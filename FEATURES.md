# Our Orbit Feature Expansion

This release keeps the existing private-pair experience and adds a feature hub at **More of us**.

## Added capabilities

The memory gallery now supports phone gallery selection, camera capture with the browser's permission prompt, HEIC/HEIF images, caption/date search, photo/video/favorites filters, private-versus-pair visibility, one-tap privacy changes, reactions, storage statistics, and repeated sphere-photo changes.

The **More of us** area contains a shared bucket list with device-local drafts, a relationship timeline, shared countdowns with in-app due reminders, voice memories recorded after microphone permission, gentle mood and wellness activity summaries, a private JSON export, storage indexing, and sphere rotation preferences.

The app's service worker now caches the shell and static assets for offline reopening. It intentionally does not cache private API responses or stored media. Bucket-list text drafts are kept in local storage on the current device and can be submitted when the connection returns.

## Privacy and permissions

Every new record is scoped to the authenticated relationship. Pair-visible memories and voice notes can be viewed by both linked members; private records are returned only to their creator. Destructive operations are creator-restricted where appropriate. Camera and microphone access is requested only after the user presses the corresponding action.

Countdown reminders and existing wellness reminders are generated as private in-app notifications when the notification list is opened. This release does not claim background push delivery when the app is closed.

## Database migration

The generated migration is `drizzle/0005_great_night_nurse.sql`. It adds sphere rotation metadata, memory privacy/favorites/file-size fields, reactions, bucket items, timeline events, countdowns, and voice memories.

Run the migrations with the project's normal deployment command:

```bash
pnpm drizzle-kit migrate
```

## Verification

The project should be checked with:

```bash
pnpm check
pnpm test
pnpm build
```

The production health endpoint remains `/api/health`. A healthy deployment should report a reachable database after the deployment environment has supplied `DATABASE_URL` and the other documented secrets.
