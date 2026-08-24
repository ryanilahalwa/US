# Our Orbit external service setup

This project is wired so **Render runs the application**, **Aiven provides MySQL**, and **Cloudinary stores private photos, videos, and voice memories**. The services are connected through Render environment variables rather than by placing credentials in the repository.

## Official service links

| Purpose | Official link | What to obtain |
| --- | --- | --- |
| Host the full-stack app | [Render Dashboard](https://dashboard.render.com/) | A connected GitHub, GitLab, or Bitbucket repository and the deployed `onrender.com` domain. |
| Render Blueprint instructions | [Render Blueprints](https://render.com/docs/infrastructure-as-code) | Use the repository’s `render.yaml` with **New → Blueprint**. |
| Render free deployment guidance | [Render first deploy](https://render.com/docs/your-first-deploy) | Free web-service setup and deployment monitoring. |
| MySQL database | [Aiven Console](https://console.aiven.io/) | An Aiven for MySQL service and its TLS connection URI from **Overview → Quick connect**. |
| Aiven MySQL setup | [Aiven for MySQL: Get started](https://aiven.io/docs/products/mysql/get-started) | Service creation and connection instructions. |
| Aiven TLS/CA information | [Aiven TLS/SSL certificates](https://aiven.io/docs/platform/concepts/tls-ssl-certificates) | Optional CA certificate for strict server-certificate verification. |
| Private media storage | [Cloudinary Console](https://console.cloudinary.com/console) | A product environment’s cloud name, API key, and API secret. |
| Cloudinary credentials | [Cloudinary API Keys](https://console.cloudinary.com/app/settings/api-keys) | Values for the three `CLOUDINARY_*` variables. |
| Cloudinary signed uploads | [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference) | Reference for the signed upload and authenticated-asset flow already used by this app. |

## Connection order

### 1. Create the Aiven database

Open the [Aiven Console](https://console.aiven.io/), create a project, choose **Create service → MySQL**, and wait until the service is running. Open **Overview → Quick connect** and copy the service URI. Put that value into Render as `DATABASE_URL`. Keep the `ssl-mode=REQUIRED` parameter if it is present.

The application detects Aiven hosts and configures mysql2 for TLS. If Aiven provides a CA certificate for the service, copy it into `AIVEN_MYSQL_CA` as a server-side Render secret. Encode line breaks as `\\n`. The migration command and runtime database pool use the same connection details.

### 2. Create the Cloudinary media environment

Open the [Cloudinary Console](https://console.cloudinary.com/console/) and create or select a product environment. From [API Keys](https://console.cloudinary.com/app/settings/api-keys), copy the cloud name, API key, and API secret into these Render variables:

| Render variable | Cloudinary value |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Product environment cloud name |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

The browser requests short-lived signed upload parameters from the app, then uploads directly to Cloudinary. The secret never belongs in frontend code. Assets are uploaded as authenticated media and delivered through the app’s `/media/{key}` route using a time-limited signed download URL. Do not configure these uploads as public unless you intentionally want to remove private-media protection.

### 3. Deploy the application to Render

Push the project to a repository, open the [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint**, select the repository, and deploy the included `render.yaml`. Render’s Blueprint flow uses the repository file to configure the web service and its build/start commands.

The Blueprint uses the following commands:

```text
Build: pnpm install --frozen-lockfile && pnpm build
Start: pnpm drizzle-kit migrate && pnpm start
Health: /api/health
```

After Render gives the service its final domain, for example `https://our-orbit-example.onrender.com`, set:

```text
OIDC_REDIRECT_URI=https://our-orbit-example.onrender.com/api/oauth/callback
```

Then redeploy after the OIDC provider is configured. The application’s own health endpoint should return database status at:

```text
https://our-orbit-example.onrender.com/api/health
```

### 4. Connect OIDC login

The application uses standard OpenID Connect when `AUTH_MODE=oidc` and `VITE_AUTH_MODE=oidc`. Create a web application/client with the OIDC provider of your choice and register this exact callback URL:

```text
https://YOUR-RENDER-DOMAIN/api/oauth/callback
```

Set these Render variables:

| Render variable | Value |
| --- | --- |
| `AUTH_MODE` | `oidc` |
| `VITE_AUTH_MODE` | `oidc` |
| `OIDC_ISSUER_URL` | The provider issuer URL, without an authorization-path suffix unless the provider specifies otherwise |
| `OIDC_CLIENT_ID` | The web client ID |
| `OIDC_CLIENT_SECRET` | The web client secret |
| `OIDC_REDIRECT_URI` | The exact public callback URL above |
| `OIDC_SCOPES` | `openid profile email` |

Provider starting points include [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Microsoft Entra app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), and [Auth0 authorization code flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow). The provider must support discovery metadata and return an ID token containing a subject claim.

### 5. Add Google Maps, if location maps are needed

Create a browser-restricted Google Maps JavaScript API key in the [Google Cloud credentials console](https://console.cloud.google.com/apis/credentials). Allow the final Render domain as an HTTP referrer and set:

```text
VITE_GOOGLE_MAPS_API_KEY=your-browser-restricted-key
```

This value is intentionally a frontend variable, so it must be restricted by domain and API. The app uses the direct Google Maps key on Render and retains the older proxy path only as a fallback for legacy deployments.

## Render environment checklist

The following values are required for the external profile:

```text
NODE_ENV=production
AUTH_MODE=oidc
VITE_AUTH_MODE=oidc
VITE_APP_ID=our-orbit
DATABASE_URL=<Aiven TLS service URI>
AIVEN_MYSQL_CA=<optional CA PEM with \\n line breaks>
JWT_SECRET=<long random server secret>
OIDC_ISSUER_URL=<provider issuer>
OIDC_CLIENT_ID=<provider web client ID>
OIDC_CLIENT_SECRET=<provider web client secret>
OIDC_REDIRECT_URI=https://<your-render-domain>/api/oauth/callback
OIDC_SCOPES=openid profile email
CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>
CLOUDINARY_API_KEY=<Cloudinary API key>
CLOUDINARY_API_SECRET=<Cloudinary API secret>
VITE_GOOGLE_MAPS_API_KEY=<restricted browser key>
```

`DATABASE_URL`, `AIVEN_MYSQL_CA`, `JWT_SECRET`, `OIDC_CLIENT_SECRET`, and `CLOUDINARY_API_SECRET` must remain private Render server variables. Do not commit them to GitHub or send them through chat.

## What can and cannot be linked automatically

The repository contains the wiring and the Render Blueprint, but no third-party account can be created without the account owner’s authorization. Therefore, the final connection requires signing in to Render, Aiven, Cloudinary, the selected OIDC provider, and Google Cloud if maps are wanted. Once those values are entered in Render, the web service, database, and private media storage work together through the configuration above.

The optional AI, automatic voice transcription, and external scheduled-notification modules remain provider-specific as documented in `RENDER_DEPLOY.md`; the core database, authentication, gallery, sphere, voice recording/playback, privacy, export, and PWA paths use the external architecture above.

## References

[1]: https://dashboard.render.com/ "Render Dashboard"
[2]: https://render.com/docs/infrastructure-as-code "Render Blueprints"
[3]: https://render.com/docs/your-first-deploy "Render: Your First Deploy"
[4]: https://console.aiven.io/ "Aiven Console"
[5]: https://aiven.io/docs/products/mysql/get-started "Aiven for MySQL: Get started"
[6]: https://aiven.io/docs/platform/concepts/tls-ssl-certificates "Aiven TLS/SSL certificates"
[7]: https://console.cloudinary.com/console "Cloudinary Console"
[8]: https://console.cloudinary.com/app/settings/api-keys "Cloudinary API Keys"
[9]: https://cloudinary.com/documentation/image_upload_api_reference "Cloudinary Upload API reference"
[10]: https://developers.google.com/identity/openid-connect/openid-connect "Google OpenID Connect"
[11]: https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app "Microsoft Entra app registration"
[12]: https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow "Auth0 authorization code flow"
[13]: https://console.cloud.google.com/apis/credentials "Google Cloud credentials"
