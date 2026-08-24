import type { Express, Request, Response } from "express";
import { cloudinaryDeliveryUrl } from "../storage";
import { ENV } from "./env";

function mimeTypeForKey(key: string) {
  const extension = key.split(".").pop()?.toLowerCase();
  if (["mp4", "webm", "mp3", "m4a", "wav", "ogg"].includes(extension ?? "")) return "video/";
  return "image/";
}

async function serveCloudinaryMedia(req: Request, res: Response) {
  const key = (req.params as Record<string, string>)[0];
  if (!key) return res.status(400).send("Missing media key");
  try {
    res.set("Cache-Control", "private, max-age=300");
    return res.redirect(302, cloudinaryDeliveryUrl(key, mimeTypeForKey(key)));
  } catch (error) {
    console.error("[CloudinaryProxy] failed:", error);
    return res.status(500).send("Cloudinary storage is not configured");
  }
}

async function serveLegacyForgeMedia(req: Request, res: Response) {
  const key = (req.params as Record<string, string>)[0];
  if (!key) return res.status(400).send("Missing storage key");
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return res.status(410).send("This legacy media path requires the original storage configuration");
  try {
    const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
    forgeUrl.searchParams.set("path", key);
    const forgeResp = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
    if (!forgeResp.ok) return res.status(502).send("Legacy storage backend error");
    const { url } = (await forgeResp.json()) as { url: string };
    if (!url) return res.status(502).send("Empty signed URL from legacy backend");
    res.set("Cache-Control", "no-store");
    return res.redirect(307, url);
  } catch (error) {
    console.error("[LegacyStorageProxy] failed:", error);
    return res.status(502).send("Legacy storage proxy error");
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/media/*", serveCloudinaryMedia);
  app.get("/manus-storage/*", serveLegacyForgeMedia);
}
