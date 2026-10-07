# Troubleshooting

| Symptom                                   | Check                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Component missing in App Builder          | Confirm deployment success; find **Matchday File Upload**, not the private game bundle. Open a Lightning record page.                 |
| Component missing for a user              | Check page activation, app/profile assignments, and component visibility rules.                                                       |
| Open a saved record message               | The wrapper needs a real `recordId`. It is intended for saved record pages.                                                           |
| Goal followed by an access error          | Assign `Matchday_File_Upload`; verify normal record and Files access, field permissions, and org file restrictions.                   |
| File too large                            | The component caps files at 10 MiB. Use the standard Files uploader for larger documents.                                             |
| File remains queued after a network error | Restore the connection and retry in the same panel. It first checks whether the previous upload committed.                            |
| File exists but confirmation fails        | Check the record's Files and permissions. Confirmation requires matching size, creator, original parent, and an existing record link. |
| Repeated upload after refreshing          | Retry keys are held in memory; check existing Files before selecting the same file after a reload.                                    |
| Sound is silent                           | Enable the speaker control after a user click. Check browser/site sound settings.                                                     |
| A shot falls short                        | A gentle movement produces a softer shot. Drag upward toward the goal and release with more speed.                                    |
| No animations                             | Check the Motion toggle and the operating system's reduced-motion preference.                                                         |
| Preview not found                         | Run `npm ci` and `npm run build:preview` before `npm run preview`.                                                                    |
| Preview port already in use               | Start it on another port with `MATCHDAY_PREVIEW_PORT=4174 npm run preview`, then open that port.                                      |
| API version error during deployment       | The package uses API 67.0; use a compatible org. Lowering the API version requires separate compatibility testing.                    |

For local diagnostics, run `npm test`, `npm run build:preview`, and `npm run check:package`. For Apex, run:

```sh
sf apex run test --target-org matchday-dev \
  --class-names MatchdayFileUploadControllerTest \
  --result-format human --wait 10
```

When reporting an issue publicly, include the browser, form factor, file type and byte size, and a redacted error message. Use synthetic files and remove org URLs, record IDs, usernames, and document contents from screenshots or logs.
