// Cloudinary-backed private media storage for Render/Aiven deployments.
// The browser uploads directly to Cloudinary using a short-lived server signature;
// media is stored as authenticated assets and served through /media/{key}.

import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

type UploadParams = Record<string, string>;
type CloudinaryResourceType = "image" | "video" | "raw";

function getCloudinaryConfig() {
  if (!ENV.cloudinaryCloudName || !ENV.cloudinaryApiKey || !ENV.cloudinaryApiSecret) {
    throw new Error("Cloudinary storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.");
  }
  cloudinary.config({
    cloud_name: ENV.cloudinaryCloudName,
    api_key: ENV.cloudinaryApiKey,
    api_secret: ENV.cloudinaryApiSecret,
    secure: true,
  });
  return { cloudName: ENV.cloudinaryCloudName, apiKey: ENV.cloudinaryApiKey, apiSecret: ENV.cloudinaryApiSecret };
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function splitKey(key: string) {
  const extensionMatch = key.match(/\.([a-zA-Z0-9]+)$/);
  const format = extensionMatch?.[1]?.toLowerCase() || "bin";
  const publicId = extensionMatch ? key.slice(0, -(format.length + 1)) : key;
  return { publicId, format };
}

function resourceTypeFor(mimeType: string, key: string): CloudinaryResourceType {
  if (mimeType.startsWith("video/") || mimeType.startsWith("audio/")) return "video";
  const extension = key.split(".").pop()?.toLowerCase();
  return extension === "mp4" || extension === "webm" || extension === "mp3" || extension === "m4a" || extension === "wav" || extension === "ogg" ? "video" : "image";
}

export function cloudinaryDeliveryUrl(relKey: string, mimeType = "") {
  getCloudinaryConfig();
  const key = normalizeKey(relKey);
  const { publicId, format } = splitKey(key);
  const resourceType = resourceTypeFor(mimeType, key);
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  });
}

export async function storagePreparePut(
  relKey: string,
  mimeType = "application/octet-stream",
): Promise<{ key: string; uploadUrl: string; url: string; uploadParams: UploadParams }> {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const { publicId } = splitKey(key);
  const resourceType = resourceTypeFor(mimeType, key);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const paramsToSign = { public_id: publicId, timestamp, type: "authenticated" };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
  return {
    key,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
    url: `/media/${key}`,
    uploadParams: { ...paramsToSign, api_key: apiKey, signature },
  };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const prepared = await storagePreparePut(relKey, contentType);
  const form = new FormData();
  form.append("file", typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any], { type: contentType }));
  Object.entries(prepared.uploadParams).forEach(([key, value]) => form.append(key, value));
  const uploadResp = await fetch(prepared.uploadUrl, { method: "POST", body: form });
  if (!uploadResp.ok) throw new Error(`Cloudinary upload failed (${uploadResp.status})`);
  return { key: prepared.key, url: prepared.url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/media/${key}` };
}

export async function storageGetSignedUrl(relKey: string, mimeType = ""): Promise<string> {
  return cloudinaryDeliveryUrl(relKey, mimeType);
}

export async function storageDelete(relKey: string, mimeType = ""): Promise<void> {
  getCloudinaryConfig();
  const key = normalizeKey(relKey);
  const { publicId } = splitKey(key);
  const resourceType = resourceTypeFor(mimeType, key);
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated", invalidate: true });
}
