# Validation record

Standalone release preparation: **7 October 2026**.

## Verified for this source package

| Check                                 | Result                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Metadata extraction                   | 19 metadata and component-test source files copied from the working uploader; matching source bytes after the Apex test setup correction |
| Fresh dependency installation         | Pinned npm packages and a generated lockfile; Node.js 22.19.0 / npm 10.9.3                                                               |
| Component tests                       | 44 passed, 3 suites                                                                                                                      |
| Preview compilation                   | Successful with aligned LWC compiler, DOM engine, and Rollup plugin at 8.28.2                                                            |
| Preview HTTP smoke test               | HTML, bundle, and self-contained preview returned HTTP 200; path traversal rejected with HTTP 403                                        |
| Metadata conversion                   | Salesforce CLI converted the standalone source successfully; six manifest members and no record page                                     |
| Salesforce validation-only deployment | Succeeded with zero component errors and zero test errors; 5 Apex tests passed                                                           |
| Public source review                  | No auth directories, credentials, original org URLs/IDs, client record pages, live records, or private verification exports included     |

The validation-only deployment used the previously tested development org. It did not apply a new deployment. A completely fresh destination org was not available for this release check; use the installation checklist in your own org.

The extraction revealed two developer tooling issues, now corrected: Jest tried to execute the audio helper as a test suite, and the standalone compiler/runtime versions initially differed. Jest now selects only `*.test.js`, and the LWC toolchain versions are aligned. The Apex test setup now checks for an existing permission-set assignment before inserting one, so validation can run after the deployment user has already enabled the component. The runtime game and upload adapter were copied without behavior changes.

## Prior live integration evidence

In the original development org, browser uploads succeeded for text, JSON, and HEIC. The largest observed browser upload was 2,108,524 bytes. Four completed attachments were verified through ContentVersion and ContentDocumentLink metadata. A separate 10,485,760-byte synthetic UI API upload returned a saved checksum matching the local file.

Org identifiers, usernames, uploaded document names, and private browser evidence are intentionally omitted. The README image shows only the local preview and synthetic sample files. The preview's percentage indicator is simulated; the real Salesforce adapter uses indeterminate progress.

## Not yet covered by live acceptance

- A complete 10 MiB upload through the browser Lightning Data Service path.
- A fresh destination org, a non-admin user, additional object pages, and Salesforce mobile.
- Live fault injection for lost responses and record navigation during an in-flight upload; these behaviors have component tests.
- Keyboard-only shooting and full accessibility conformance.

## Reproduce local checks

```sh
npm ci
npm test
npm run build:preview
npm run check:package
sf project convert source --root-dir force-app --output-dir .mdapi
```

For a validation-only deployment against an authenticated org:

```sh
sf project deploy start --target-org matchday-dev \
  --manifest manifest/package.xml --dry-run \
  --test-level RunSpecifiedTests \
  --tests MatchdayFileUploadControllerTest --wait 20
```

GitHub Actions repeats the npm installation, component tests, preview build, and package checks on pushes and pull requests. It has read-only repository permissions and does not connect to a Salesforce org.
