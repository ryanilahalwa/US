# Deploy Our Orbit to Vercel

This project is prepared for Vercel as a React/Vite client with an Express Node.js server entrypoint. The existing private-pair routes and authentication remain intact. The media flow now uses a presigned upload handshake so phones can upload photos directly to private storage without sending large files through the Vercel Function.

## Database readiness

The application uses Drizzle ORM with a MySQL/TiDB-compatible database. The committed migrations include `drizzle/0004_wild_power_man.sql` for the shared sphere-cover field and `drizzle/0005_great_night_nurse.sql` for sphere rotation, memory privacy/favorites, reactions, bucket items, timeline events, countdowns, and voice memories:

```sql
ALTER TABLE `relationships` ADD `coverMomentId` int;
```

The included `vercel.json` applies committed migrations during the Vercel build:

```bash
pnpm drizzle-kit migrate && pnpm build
```

Set `DATABASE_URL` in Vercel before the first deployment. The database must be reachable from Vercel’s build and Function network. The app’s protected procedures fail closed when a database is unavailable rather than exposing private data. After deployment, open `/api/health`: a working database returns `{ "ok": true, "database": "ok" }`; a missing or unreachable database returns HTTP 503 without exposing credentials or records.

## Environment variables

Add these in Vercel Project Settings → Environment Variables. Set them for **Production** and, when testing preview deployments, for **Preview** as well.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | MySQL/TiDB-compatible database connection used by Drizzle and migrations. |
| `JWT_SECRET` | Yes | Signs the private session cookie. Use a long random secret. |
| `VITE_APP_ID` | Yes | OAuth application identifier used by the browser and server. |
| `VITE_OAUTH_PORTAL_URL` | Yes | Base URL of the OAuth sign-in portal used by the browser. |
| `OAUTH_SERVER_URL` | Yes | OAuth API base URL used by the server to exchange codes and load users. |
| `BUILT_IN_FORGE_API_URL` | Yes | Server-side Forge endpoint for media storage, signed downloads, and map proxy access. |
| `BUILT_IN_FORGE_API_KEY` | Yes | Server-side Forge credential for storage, signed downloads, and map proxy access. Keep this server-only. |
| `VITE_FRONTEND_FORGE_API_URL` | Recommended | Browser-side Forge endpoint used by the location map. If omitted, the app uses its built-in default endpoint. |
| `VITE_FRONTEND_FORGE_API_KEY` | Required for maps | Browser-side map proxy credential used to load the location map. |
| `OWNER_OPEN_ID` | Optional | OAuth open ID that should receive the owner/admin role during user synchronization. |

Do not commit these values to the repository or place them in the ZIP archive.

## OAuth callback

Register this callback URL with the OAuth application after the Vercel domain is known:

```text
https://YOUR-VERCEL-DOMAIN/api/oauth/callback
```

The browser builds the callback URL from the current deployment origin, so Preview and Production deployments use their own hostnames.

## Phone photos and memories

On the Moments page, **Choose photo or video** opens the phone’s photo/file picker. **Take a photo** requests the browser’s camera permission and opens the camera when the phone supports the `capture` input. The selected file is limited to 15 MB, uploaded directly to private storage using a short-lived presigned URL, and then recorded in the database with its caption and date.

JPEG, PNG, WEBP, GIF, HEIC, HEIF, MP4, and WEBM are accepted. If a browser cannot display HEIC or HEIF inline, the original private file remains stored and can still be managed from the gallery; JPEG or PNG is the safest cross-browser format.

## Changing the sphere photo

Either linked participant can open Moments, select any shared photo, and press **Use in sphere**. The relationship’s `coverMomentId` is stored in the database, so the sphere can be changed repeatedly over time. Removing the active cover clears the selection and lets the sphere fall back to the latest available photo.

## Deployment commands

Using the Vercel CLI from this project directory:

```bash
npx vercel link
npx vercel --prod
```

Or import the repository through the Vercel dashboard and deploy after adding the variables above.

## Verification checklist

After deployment, verify `/api/health` first, then confirm that the welcome screen loads, OAuth login returns to the deployed domain, a relationship can be created, a partner invitation can be accepted, a photo can be selected from the phone gallery, camera permission can be granted for **Take a photo**, the photo appears in Moments, either participant can set or rotate the sphere picture, privacy and favorite controls work, reactions save, the bucket list and timeline save, countdown reminders appear in-app, microphone permission allows a voice memory, the insights and export panels load, feelings and wellness entries save, the location map loads when map variables are configured, and the app shell can be reopened offline.

For current Vercel behavior, see [How to ship an Express app on Vercel](https://vercel.com/kb/guide/ship-a-express-app-on-vercel) and [Using the Node.js Runtime with Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js).
