import { LightningElement, api } from "lwc";
import { createRecord } from "lightning/uiRecordApi";
import { RefreshEvent } from "lightning/refresh";
import findUpload from "@salesforce/apex/MatchdayFileUploadController.findUpload";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function errorMessage(error) {
  return (
    error?.body?.output?.errors?.[0]?.message ||
    error?.body?.message ||
    error?.message ||
    "The upload could not be confirmed. Your file is still queued. Try again to check its status."
  );
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () =>
      reject(new Error("This file could not be read. Select it again."));
    reader.onabort = () =>
      reject(new Error("File reading was interrupted. Select it again."));
    reader.readAsDataURL(file);
  });
}

export default class MatchdayRecordUpload extends LightningElement {
  @api recordId;
  maxFileBytes = MAX_FILE_BYTES;
  _keys = new Map();
  _pending = new Set();

  keyFor(recordId, file) {
    const fingerprint = `${recordId}|${file.name}|${file.size}|${file.lastModified}`;
    if (!this._keys.has(fingerprint)) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      this._keys.set(
        fingerprint,
        Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
      );
    }
    return { fingerprint, key: this._keys.get(fingerprint) };
  }

  async handleUploadRequest(event) {
    // Accept synchronously so the game does not report an absent adapter.
    event.preventDefault();
    const { id, recordId, file } = event.detail;
    if (this._pending.has(id)) return;
    this._pending.add(id);
    const game = event.target;
    let key;
    let fingerprint;
    try {
      if (!recordId || recordId !== this.recordId)
        throw new Error(
          "The record changed. Select files for the current record."
        );
      if (!file || file.size > MAX_FILE_BYTES)
        throw new Error("Choose a file of 10 MB or less.");
      ({ key, fingerprint } = this.keyFor(recordId, file));
      // Reconcile before sending. The unique field also protects against a
      // previous in-flight request committing after this check.
      let result = await findUpload({ recordId, uploadKey: key });
      if (!result) {
        const base64 = await readBase64(file);
        if (!this.isConnected || recordId !== this.recordId)
          throw new Error(
            "The record changed before upload. Select the file again."
          );
        try {
          await createRecord({
            apiName: "ContentVersion",
            fields: {
              Title: file.name.slice(0, 255),
              PathOnClient: file.name.slice(0, 500),
              VersionData: base64,
              FirstPublishLocationId: recordId,
              Matchday_Upload_Key__c: key
            }
          });
        } catch (uploadError) {
          // A lost response or duplicate-key error may mean it committed.
          // Read status once; never blindly resend the binary.
          result = await findUpload({ recordId, uploadKey: key });
          if (!result) throw uploadError;
        }
        result = result || (await findUpload({ recordId, uploadKey: key }));
      }
      if (!result?.documentId || result.contentSize !== file.size)
        throw new Error(
          "The file was sent, but its saved size and record link could not be confirmed. Retry to check the existing upload."
        );
      if (this.isConnected && recordId === this.recordId) {
        game.completeUpload(id, result);
        this._keys.delete(fingerprint);
        this.dispatchEvent(new RefreshEvent());
      }
    } catch (error) {
      if (this.isConnected && recordId === this.recordId)
        game.failUpload(id, errorMessage(error));
    } finally {
      this._pending.delete(id);
    }
  }
}
