# Floor Flow

Floor Flow is a browser-based plant floor scheduling and verification platform. It is built for live floor boards, supervisor queue control, admin setup, user access, and scan-ready operator flows.

## Included

- `index.html` - landing page
- `board.html` - floor console / touchscreen board
- `supervisor.html` - supervisor scheduling and queue control screen
- `admin.html` - admin / maintenance screen
- `display.html` - read-only plant display board
- `css/styles.css` - shared styling
- `js/*.js` - Firebase-ready application logic

## Core screens

- Floor Console: mark work ready, complete work, view notes, and advance the queue.
- Supervisor View: plan and edit the current / next queue.
- Display Board: read-only live plant screen.
- Admin / Maintenance: manage equipment, areas, users, branding, activity logs, and system controls.

## Firebase collections in use

- `users`
- `presses`
- `logs`
- `system`

## Roles

- `operator`
- `dieSetter` - internal role key for authorized floor staff
- `supervisor`
- `admin`

## Notes

- Branding is configurable through Admin > System Controls.
- User import supports Employee ID and optional Badge Code fields.
- Badge printing uses the saved system branding when available.
- Browser sessions are designed for shared machine use with logout and session timeout behavior.
