# Local Matchday preview

From the repository root:

```sh
npm ci
npm run build:preview
npm run preview
```

Open http://127.0.0.1:4173, choose **Add sample files**, and flick the active ball toward the goal. The preview can simulate normal, slow, and failed uploads and switch between compact and full-width layouts. Audio starts only after enabling the speaker control.

The preview uses the actual `penaltyFileUpload` LWC with a local simulation adapter. It does not read or upload selected file contents. Completed files are labeled **Simulated**. A refresh clears the queue.

The build also produces `dist/Matchday-preview.html`, a self-contained page for local review without a server. It is generated locally, not committed.

For real Salesforce uploads, deploy the [standalone metadata](../../README.md#install-in-salesforce) and place **Matchday File Upload** on a saved record page.
