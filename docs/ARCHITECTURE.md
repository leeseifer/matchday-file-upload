# Architecture

```mermaid
sequenceDiagram
    participant User
    participant Game as penaltyFileUpload
    participant Adapter as matchdayRecordUpload
    participant LDS as Lightning Data Service
    participant Apex as Confirmation Apex
    participant SF as Salesforce Files
    User->>Game: Queue files and flick a ball
    Game->>Adapter: uploadrequest after a goal
    Adapter->>Apex: Look up stable retry key
    Apex-->>Adapter: Existing confirmed file or no match
    opt No previously committed upload
        Adapter->>LDS: createRecord(ContentVersion)
        LDS->>SF: Save bytes and publish to current record
        Adapter->>Apex: Confirm saved file
    end
    Apex->>SF: Query size and ContentDocumentLink in user mode
    Apex-->>Adapter: Confirmed document and size
    Adapter->>Game: completeUpload
    Game-->>User: Attached link; next queued ball
```

## Metadata boundaries

`matchdayRecordUpload` is exposed to `lightning__RecordPage` without object restrictions. The private game receives a record ID, file-size limit, and upload progress mode. It dispatches a cancelable `uploadrequest` containing the file, record ID, and shot request ID. The wrapper accepts the event synchronously and returns completion or failure through the game's public methods.

The wrapper creates ContentVersion through `lightning/uiRecordApi.createRecord`. It supplies Title, PathOnClient, base64 VersionData, FirstPublishLocationId, and the unique retry-key field. Files are handled serially. File bytes are read only for the active upload and do not pass through Apex.

`MatchdayFileUploadController` is a `with sharing` read-only class. Its queries use `AccessLevel.USER_MODE` / `WITH USER_MODE`. It checks parent access, the current user's upload key, FirstPublishLocationId, and an actual ContentDocumentLink before returning IDs and size. The wrapper compares saved size with the browser File size before marking it attached.

The permission set grants only access to that Apex class and the custom ContentVersion field. Normal Salesforce CRUD, field access, sharing, Files rules, and storage constraints still apply. No credentials, external upload endpoint, or public file links are required.

## Retries and record changes

A random 32-character hexadecimal key is associated with the current record and the file's name, size, and last-modified timestamp. The same key is reused on a retry while the component remains mounted. The ContentVersion field is unique, so a race between a delayed response and a retry cannot create another version with that key.

The adapter queries before sending and reconciles an ambiguous creation error before reporting failure. It does not blindly resend a failed binary request. Successful completion clears that file's key, allowing a later intentional upload of the same file.

Queued files, upload requests, and retry keys are held in memory. They are not persisted across reloads, separate browser tabs, or component recreation. After an interrupted session, users should check Files before selecting the file again. There is no resumable or chunked upload protocol.

Changing record context resets the game's queue and ignores old callbacks. The adapter snapshots the target record ID and checks it again before creating ContentVersion. If an already-sent upload commits after navigation, it remains linked to its original record.

## Motion and audio

The ball and keeper use cached element references and transforms rather than reactive template updates on every frame. Spectators animate in staggered groups. Audio is synthesized locally with Web Audio and starts after the user enables sound. Scored balls render behind the keeper; his angry reaction ends when the ball resets, while the speed increase remains.

The local preview supplies a simulated adapter. It compiles the same game source but does not include the Salesforce wrapper or access real org data.

## Platform references

- [Lightning createRecord](https://developer.salesforce.com/docs/platform/lwc/guide/reference-create-record.html)
- [Salesforce online file creation example](https://developer.salesforce.com/docs/platform/mobile-offline/guide/use-images-upload-file-representation.html)
- [Standard lightning-file-upload](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-file-upload.html)

The standard uploader does not document an API for injecting this custom queue's preselected File objects. This implementation uses record creation to preserve uploading only after a goal.
