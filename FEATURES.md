# Our Orbit Feature Expansion

This release keeps the existing private-pair experience and adds a feature hub at **More of us**.

## Added capabilities

The memory gallery now supports phone gallery selection, camera capture with the browser's permission prompt, common phone photo/video formats including HEIC/HEIF, caption/date search, photo/video/favorites filters, private-versus-pair visibility, one-tap privacy changes, reactions, storage statistics, and repeated sphere-photo changes. Settings includes a shared sphere-photo uploader and selector; either linked participant can upload a pair-visible photo and make it the sphere image without exposing private-to-one-member media.

The **More of us** area contains a shared bucket list with device-local drafts, a relationship timeline, shared countdowns with in-app due reminders, voice memories recorded after microphone permission, gentle mood and wellness activity summaries, a private JSON export, storage indexing, and sphere rotation preferences.

The app's service worker now caches the shell and static assets for offline reopening. It intentionally does not cache private API responses or stored media. Bucket-list text drafts are kept in local storage on the current device and can be submitted when the connection returns.

## Privacy and permissions

Every new record is scoped to the authenticated relationship. Pair-visible memories and voice notes can be viewed by both linked members; private records are returned only to their creator. Destructive operations are creator-restricted where appropriate. Camera and microphone access is requested only after the user presses the corresponding action.

Countdown reminders and existing wellness reminders are generated as private in-app notifications when the notification list is opened. This release does not claim background push delivery when the app is closed.

## Database migration

The current migration chain includes `drizzle/0005_great_night_nurse.sql`, `drizzle/0006_smooth_black_cat.sql`, `drizzle/0007_fat_menace.sql`, and `drizzle/0008_serious_weapon_omega.sql`. Migrations 0006–0008 add gallery quotes and albums, featured-memory rotation, Orbit Chapters, Surprise Drops, Our Places, and Private Anniversary Mode.

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

## Orbit Keepsakes additions

The Feature Hub now includes **Surprise Drops**, which let one participant write a private message, quote, and optional shared-memory reference for the other participant to discover after a chosen future date. Surprise content is filtered server-side until its reveal time, and only the recipient can open it.

**Our Places** stores meaningful place names, optional addresses, optional coordinates, visit dates, notes, and privacy choices. Coordinates are optional, map pins are only rendered for places with coordinates, and private places remain visible only to their creator. The map uses the existing MapView integration and does not enable continuous location tracking.

**Private Anniversary Mode** computes the next anniversary from the relationship start date and gathers visible favorites, album milestones, and saved traditions into a private recap. It is read-only and computed from existing relationship data, so it requires no background scheduler.

These additions are relationship-scoped, protected by the existing authentication and membership checks, and are included in migration `0008_serious_weapon_omega.sql`. The migration runs only when a future deployment is authorized; the current live deployment is not changed automatically.
