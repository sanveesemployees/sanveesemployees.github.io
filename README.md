# Branch Staff Directory

A lightweight branch staff directory built with a GitHub Pages frontend and a Google Apps Script backend. The app uses a Google Sheet as the data store and a Google Apps Script (Code.gs) as a serverless JSON API. This makes it easy to edit data using the sheet while serving a responsive frontend to staff and admins.

Key features

- View staff by branch (current and former staff)
- Admin UI for adding, editing, moving and deleting staff
- Branch management (add/rename/delete)
- Photo upload and removal (stored in Drive)
- Admin permission scoping by branch and rights

## Live demo

The app is suitable for GitHub Pages. If you want to publish a demo, enable Pages on this repo (branch `main`, folder `/`).

## Project structure (important files)

- `index.html` — main app markup
- `Styles.css`, `ProfessionalOverrides.css` — styling
- `JavaScript.js` — frontend app logic (configure `SCRIPT_URL` here)
- `Code.gs` — Google Apps Script backend (deploy as Web App)
- `README.md` — this file

## Quick start

1. Create a Google Sheet to act as your data store (use the structure expected by `Code.gs`).
2. Open the sheet and go to Extensions → Apps Script. Paste the contents of `Code.gs` and save.
3. In `Code.gs` replace the `SPREADSHEET_ID` constant with your sheet ID.
4. Deploy the Apps Script as a Web App (Deploy → New deployment → Web app). Set "Execute as" = Me and "Who has access" = Anyone (or Anyone with the link). Copy the Web App URL.
5. In `JavaScript.js` set `SCRIPT_URL` to the Apps Script Web App URL (replace the placeholder constant near the top of the file).
6. Push files to GitHub and enable GitHub Pages (Settings → Pages) for the branch containing `index.html`.
7. Open the published Pages URL to view the app.

## Admin account (default)

The `Code.gs` file includes an initialization helper that sets a default admin when first run (see `initializeMainAdmin`). The default email/password in the current `Code.gs` are shown as an example — change them after first login.

Important: change the default admin credentials immediately after initialization.

## Photo handling notes

- Uploaded photos are resized client-side and sent as base64; the backend uploads them to a Drive folder named `Branch Staff Photos` and saves the Drive file id in the sheet.
- When you click "Remove Photo" the client will call the `removePhoto` API which attempts to trash the Drive file and clears the sheet value. If Drive permissions prevent deleting the file you may still need to remove it manually from Drive.

## Common troubleshooting

- Confirm `SCRIPT_URL` is set to the exact Web App URL returned by Apps Script deployment.
- Apps Script deployment: ensure you choose the correct access (Anyone or Anyone with the link) so GitHub Pages can call it.
- Photo permissions: Apps Script will operate under the account that deployed it. If photos fail to upload/delete, re-check the account's Drive permissions and the target folder name.
- Modal/dialog stacking: If a confirmation appears under an open modal, we added z-index tweaks so confirm dialogs appear on top — verify styles if custom CSS changes it.

## Developer notes

- Frontend: plain vanilla JS with helper functions and delegated event handling. The file to edit for most changes is `JavaScript.js`.
- Backend: `Code.gs` contains the GAS API. It uses `doGet` and `doPost` handlers to serve JSON responses. The spreadsheet layout (headers) should be preserved.
- To change the photo folder name on Drive, update the `PHOTO_FOLDER_NAME` constant in `Code.gs` and re-deploy.

## Security considerations

- The app currently uses a simple session token approach stored in localStorage. For production use consider stronger auth (OAuth, firebase auth, etc.) and move session tokens into secure cookies.
- Limit Apps Script access appropriately. Only deploy the web app with minimum required permissions.

## Contributing

Feel free to open issues or PRs. Suggestions:

- Improve input validation and error handling
- Add unit tests for key logic
- Move UI to a lightweight framework (Alpine, Lit) for easier maintenance

## Contact / Support

Open an issue in this repository with the label `bug` or `enhancement` and include console errors and steps to reproduce.

---

If you'd like, I can also:

- Add a short developer checklist to the README (deploy, update SCRIPT_URL, change admin creds)
- Extract constants (z-index values, folder names) into top-of-file variables for easier configuration
