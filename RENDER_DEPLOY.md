# Our Orbit on Render + Aiven + Cloudinary

This deployment profile keeps the existing React, Express, tRPC, Drizzle, and MySQL-compatible schema while replacing Manus-specific media delivery with Cloudinary and enabling provider-neutral OpenID Connect login. For clickable account consoles and the complete connection order, see [`SERVICE_SETUP.md`](SERVICE_SETUP.md).

## Services

| Responsibility | Service | Required setup |
| --- | --- | --- |
| Web service and Express API | [Render Web Service](https://dashboard.render.com/) | Deploy from GitHub using the included `render.yaml`. Render supplies `PORT`; the app starts with `pnpm drizzle-kit migrate && pnpm start`. |
| MySQL-compatible database | [Aiven for MySQL](https://console.aiven.io/) | Create one MySQL service and copy its TLS connection URL into `DATABASE_URL`. The free tier is small, so keep media files out of the database. |
| Photos, videos, and voice memories | [Cloudinary](https://console.cloudinary.com/console/) | Create a product environment and provide its cloud name, API key, and API secret. The app uploads authenticated assets using server-generated signatures and serves signed delivery URLs through `/media/{key}`. |
| Login | Any OpenID Connect provider | Create a web client and register `https://YOUR-RENDER-DOMAIN/api/oauth/callback` as the callback URL. Google, Microsoft Entra ID, Auth0, and other OIDC providers can be used. |

## Render setup

1. Push this project to a private GitHub repository. Review [`SERVICE_SETUP.md`](SERVICE_SETUP.md) for the direct [Render](https://dashboard.render.com/), [Aiven](https://console.aiven.io/), and [Cloudinary](https://console.cloudinary.com/console/) links.
2. In Render, choose **New → Blueprint** and select the repository. Render will read `render.yaml`.
3. Confirm that the service is named `our-orbit` and that the plan is **Free** for testing or personal use.
4. Set the unsynchronised environment values in the Render dashboard. Do not commit secrets to GitHub.
5. Deploy and open `/api/health`. A working database configuration returns `{"ok":true,"database":"ok"}`.
6. Register the final Render callback URL with the OIDC provider before testing login.

## Environment variables

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `AUTH_MODE` | `oidc` |
| `VITE_APP_ID` | `our-orbit`; this must match the server session app ID. |
| `DATABASE_URL` | Aiven’s MySQL TLS connection URL, normally containing `ssl-mode=REQUIRED`; obtain it from [Aiven Quick connect](https://aiven.io/docs/products/mysql/get-started). |
| `AIVEN_MYSQL_CA` | Optional CA PEM for strict certificate verification; encode line breaks as `\\n`. If omitted, Aiven TLS is still requested but certificate verification is relaxed for compatibility with Aiven’s service URI. |
| `JWT_SECRET` | A long random secret; Render can generate this. |
| `OIDC_ISSUER_URL` | The provider issuer, for example `https://accounts.google.com`. |
| `OIDC_CLIENT_ID` | The OIDC web-client ID. |
| `OIDC_CLIENT_SECRET` | The OIDC web-client secret. |
| `OIDC_REDIRECT_URI` | `https://YOUR-RENDER-DOMAIN/api/oauth/callback`. |
| `OIDC_SCOPES` | `openid profile email`. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary product-environment cloud name from the [Cloudinary Console](https://console.cloudinary.com/app/settings/api-keys). |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |
| `VITE_AUTH_MODE` | `oidc`. |
| `VITE_APP_TITLE` | `Our Orbit`. |
| `VITE_GOOGLE_MAPS_API_KEY` | A browser-restricted Google Maps JavaScript API key with the Render domain allowed. |

## Database migrations

The Render start command runs `pnpm drizzle-kit migrate` before `pnpm start`. This applies all committed migrations, including the sphere-cover migration and the expanded relationship-feature migration. The operation is idempotent and should be run against the Aiven database URL only.

The runtime database helper detects Aiven hosts and translates `ssl-mode=REQUIRED` into mysql2’s TLS configuration. For strict server-certificate verification, paste Aiven’s CA PEM into `AIVEN_MYSQL_CA` with newline characters represented as `\\n`; the value is kept server-side. The migration command continues to use the same `DATABASE_URL`, so the Aiven URI must be accepted by Drizzle Kit as well as the runtime pool.

## Media privacy

Cloudinary assets are uploaded with the `authenticated` delivery type. The API secret remains on the Render server; it is never sent to the browser. The client receives a short-lived upload signature and a database media key, while `/media/{key}` generates a signed Cloudinary delivery URL. Configure Cloudinary security settings and keep the product environment private.

## Limitations and migration notes

The Render Free service is suitable for a personal or hobby deployment, but it may sleep after inactivity and is not recommended by Render for production applications. Aiven Free provides a small MySQL service, so use Cloudinary for all media and schedule regular database exports. Cloudinary’s free plan uses monthly credits, so large video libraries may require an upgrade or a different object-storage adapter. The map uses `VITE_GOOGLE_MAPS_API_KEY` directly in the browser when provided; restrict that key by HTTP referrer to the Render domain.

The previous Manus OAuth flow remains available when `AUTH_MODE` is omitted or set to `manus`. The Render profile uses `AUTH_MODE=oidc`, which avoids the Manus authentication backend. Existing users authenticated through Manus will need to sign in through the selected OIDC provider and may require an account migration if their open IDs do not match.

## Optional integrations still using Manus credentials

The core database, authentication, gallery, sphere, voice recording, and media playback paths are external-deployment-ready. A few optional modules remain provider-specific and are intentionally preserved so the existing app behavior is not changed:

| Module | Current behavior on Render without Forge variables | External replacement needed for full portability |
| --- | --- | --- |
| AI chat and model-backed suggestions | Unavailable unless `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` are configured. | Replace the LLM adapter with the provider of your choice. |
| Automatic voice transcription | Voice recording and playback work; automatic transcription requires the existing Forge transcription service. | Add a separate transcription provider or keep captions manual. |
| Server-triggered external notifications and scheduled jobs | In-app database notifications work; external scheduled delivery requires the existing Forge heartbeat/notification service. | Add an external scheduler and notification provider if background delivery is required. |
| Map fallback | Direct Google Maps works when `VITE_GOOGLE_MAPS_API_KEY` is set. | No replacement is needed; the Forge proxy remains only as a fallback. |

Do not add Manus variables unless you intentionally want those optional modules. The Cloudinary API secret, OIDC client secret, Aiven database URL, and JWT secret must remain server-side.

## Verification checklist

After deployment, verify the health endpoint, OIDC login and logout, relationship creation, partner invitation, gallery upload from a phone, camera permission, Cloudinary photo/video playback, sphere-photo selection, voice recording and playback, bucket list, timeline, countdowns, feelings, wellness, location sharing, export, and offline shell reopening.

## References

[1]: https://render.com/docs/free "Render: Deploy for Free"
[2]: https://aiven.io/docs/products/mysql/concepts/mysql-free-tier "Aiven for MySQL free tier"
[3]: https://cloudinary.com/documentation/control_access_to_media "Cloudinary: Media Access Control and Authentication"
[4]: https://cloudinary.com/documentation/delivery_url_signatures "Cloudinary: Generating delivery URL signatures"
