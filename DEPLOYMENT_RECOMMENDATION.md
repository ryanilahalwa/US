# Deployment recommendation

## Recommendation

For a **free external deployment of the current Our Orbit app**, use **[Render Free](https://dashboard.render.com/) for the Express web service, [Aiven Free MySQL](https://console.aiven.io/) for the database, and [Cloudinary Free](https://console.cloudinary.com/console/) for private media**. This arrangement matches the current MySQL/Drizzle schema and keeps photos, videos, and voice memories outside the database. The complete connection sequence is in [`SERVICE_SETUP.md`](SERVICE_SETUP.md).

The project now includes [`render.yaml`](render.yaml), [`RENDER_DEPLOY.md`](RENDER_DEPLOY.md), and [`SERVICE_SETUP.md`](SERVICE_SETUP.md).
 Render builds the existing application, applies the committed Drizzle migrations at startup, launches the existing Express server, and checks `/api/health`. Aiven supplies the `DATABASE_URL`, while Cloudinary receives signed browser uploads and serves authenticated media through `/media/{key}`.

## Platform comparison

| Platform | Role | Fit | Main limitation |
| --- | --- | --- | --- |
| **Render Free** | Express web service | Best zero-cost external host for this project’s persistent Node server. | Free services may sleep and Render says they are for testing, hobby projects, and previews rather than production. [1] |
| **Aiven Free MySQL** | MySQL-compatible database | Indefinitely free, no credit card required, backups and monitoring, and directly compatible with the current Drizzle MySQL schema. | 1 GB storage and 1 GB RAM; free services may power off after inactivity and have no production SLA. [2] |
| **Cloudinary Free** | Photo, video, and voice storage | Free forever, no credit card required, signed/authenticated media, CDN delivery, and image/video support. | Monthly credits are limited, so large video libraries may require an upgrade or another storage adapter. [3] [4] |
| Railway | Alternative Express host | Operationally simple and close to the current server architecture. | The free plan is credit-limited after the trial; the Hobby plan is paid. [5] |
| Vercel | Preview or frontend-oriented alternative | Excellent previews and static delivery. | The Hobby plan is for personal, non-commercial use and does not replace the database and media services. [6] |

## Required external configuration

The external deployment profile uses `AUTH_MODE=oidc` and requires an OpenID Connect provider. Register `https://YOUR-RENDER-DOMAIN/api/oauth/callback` with the chosen provider, then set `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`. The existing Manus OAuth path remains available when `AUTH_MODE` is `manus`, but Manus-specific credentials are not required for the Render profile.

Location sharing uses a browser-restricted `VITE_GOOGLE_MAPS_API_KEY` when present. Restrict the key to the Render domain; the previous Forge map proxy remains a fallback for Manus deployments.

## Operational guidance

Use regular database exports because the free database is intentionally small. Keep all media in Cloudinary and monitor monthly credits. Avoid committing `DATABASE_URL`, Cloudinary secrets, OIDC secrets, JWT secrets, or Google Maps keys to the repository. When the app becomes important or receives more traffic, upgrade the web service first if cold starts become disruptive, then upgrade the database or media provider based on the actual limiting resource.

## References

[1]: https://render.com/docs/free "Render: Deploy for Free"
[2]: https://aiven.io/docs/products/mysql/concepts/mysql-free-tier "Aiven for MySQL free tier"
[3]: https://cloudinary.com/pricing "Cloudinary Pricing and Plans"
[4]: https://cloudinary.com/documentation/control_access_to_media "Cloudinary: Media Access Control and Authentication"
[5]: https://docs.railway.com/pricing/plans "Railway: Pricing Plans"
[6]: https://vercel.com/docs/plans/hobby "Vercel Hobby Plan"
