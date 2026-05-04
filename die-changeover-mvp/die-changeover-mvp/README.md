



## Included

- `index.html` - landing page
- `board.html` - Floor Board touchscreen board
- `supervisor.html` - supervisor scheduling/editing screen
- `admin.html` - admin / maintenance screen
- `css/styles.css` - shared styling
- `js/*.js` - local demo data store and Firebase-ready starter scaffold

## How it works right now

This starter runs in **demo mode** using browser `localStorage`, so you can test it immediately on GitHub Pages without any backend.

## Quick start

1. Upload the folder to a GitHub repo.
2. Enable GitHub Pages.
3. Open `index.html`.
4. Use the app in demo mode.

## Firebase upgrade path

When you are ready:

1. Create a Firebase project.
2. Turn on Authentication.
3. Turn on Firestore.
4. Add your config to `js/firebase-config.js`.
5. Replace the localStorage functions in `js/store.js` with Firestore reads/writes.

## Suggested Firebase collections

- `users`
- `presses`
- `changeovers`
- `auditLogs`
- `statusTypes`

## Suggested roles

- `dieSetter`
- `supervisor`
- `maintenance`
- `admin`

## Notes

- This MVP is designed to preserve the look and workflow of your current floor board.
- Buttons and spacing are intentionally oversized for touch screen use.
- This version is manual-first and can later connect to MES / ERP data.
