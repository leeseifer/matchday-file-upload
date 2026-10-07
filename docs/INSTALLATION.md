# Installation and acceptance guide

## Prerequisites

- Salesforce CLI (`sf`) with an authenticated deployment user.
- A destination org supporting API 67.0, Lightning Experience, and Salesforce Files.
- Permission to deploy Apex, Lightning Web Components, custom fields, and permission sets.
- Node.js 22+ and npm only if running tests or the local preview.

This source uses the unmanaged names `matchdayRecordUpload`, `penaltyFileUpload`, `MatchdayFileUploadController`, `MatchdayFileUploadControllerTest`, `ContentVersion.Matchday_Upload_Key__c`, and `Matchday_File_Upload`. Check for existing components with those names before deploying. Existing components with the same names are updated by a deployment.

## Deploy

1. Clone the repository and open its root folder.
2. Authenticate with `sf org login web --alias matchday-dev`. Use `--instance-url https://test.salesforce.com` for a sandbox, or your org's SSO login URL.
3. Run `sf org list` and confirm that `matchday-dev` points to the intended org.
4. Deploy using the manifest and named Apex test:

```sh
sf project deploy start --target-org matchday-dev \
  --manifest manifest/package.xml \
  --test-level RunSpecifiedTests \
  --tests MatchdayFileUploadControllerTest --wait 20
```

If the command returns a deployment ID while still running, use `sf project deploy report --target-org matchday-dev --job-id DEPLOYMENT_ID --wait 20`. Continue only after it reports success. Other org policies or existing Account automation may affect the test's synthetic Account fixture; inspect deployment errors in that org rather than skipping tests.

The manifest contains two LWC bundles, two Apex classes, one field, and one permission set. It intentionally contains no FlexiPage, app, profile, record data, Flow, or permission-set assignment.

## Enable access

Assign **Matchday File Upload** to the intended user through Setup → Permission Sets → Manage Assignments, or:

```sh
# Current authenticated user
sf org assign permset --target-org matchday-dev --name Matchday_File_Upload

# A specific user; replace USERNAME with the actual Salesforce username
sf org assign permset --target-org matchday-dev \
  --name Matchday_File_Upload --on-behalf-of USERNAME
```

The permission set grants Apex class access and read/edit access to `Matchday_Upload_Key__c`. It does not grant system-wide data access, record access, or Files privileges. Users must already have the appropriate rights to the record and to create files.

## Place on a record page

1. Open a saved Account, Case, Opportunity, or custom record that supports Files.
2. Choose **Setup → Edit Page**.
3. Find **Matchday File Upload** under Custom components.
4. Drag it into a wide region, or create a new tab such as **Matchday Files** and place it there.
5. Save, activate, and assign the page to the desired app and audience.
6. Open the record in that app and refresh once to load the deployed component.

The wrapper receives `recordId` automatically. There is no additional property to configure. The underlying `penaltyFileUpload` component is private and should not be exposed separately. Both desktop and small form factors are declared, but mobile acceptance remains a destination-org test.

## Acceptance checklist

Use disposable synthetic files and a designated test record.

- Drop multiple files. The queue never exceeds 10, including the active upload. Duplicate files in the current queue are skipped; oversized files are rejected before upload.
- Flick gently and quickly in different directions. A click without a deliberate drag should not shoot.
- Miss or let the keeper save. The ball returns, the keeper keeps moving, and no file is uploaded.
- Score. The crowd cheers during the upload. Wait for **Attached**, then open the completed filename and verify it belongs to the test record.
- Open the record's Files related list to confirm the attachment. Reloading resets the game scoreboard, not the record's Files.
- Verify PDF, text, spreadsheet, image, and another allowed file type. Test exactly 10 MiB and an oversized file. Org-level blocked extensions remain blocked.
- Enable sounds after a user click and try reduced motion.
- Test a non-admin user with the permission set, then a user missing the permission set or record access.
- On a safe test record, interrupt the network during an upload. Restore it and retry without reloading; confirm that a committed file is recovered rather than uploaded again.
- Navigate to another record while a file is queued or uploading. The old queue must not upload to the new record.

There is no keyboard shooting control in this interaction. The component offers reduced motion, readable status, and normal file selection, but full keyboard-only upload accessibility has not been implemented. Keep the standard Files uploader available when that interaction is needed.

## Remove from a page

Use Lightning App Builder to remove the component, then save and activate the page. Uploaded Salesforce Files remain attached. Metadata removal is a separate administrative operation; this repository does not run destructive deployment commands.
