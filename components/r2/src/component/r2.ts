import { env } from "./_generated/server.js";
import { encodePath, presign, type PresignOptions } from "./sigv4.js";

/** Reads the R2 config from the component's env. Call it inside handlers only. */
export function r2Config() {
  return {
    accountId: env.R2_ACCOUNT_ID,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  };
}

export function resolveBucket(bucket: string | undefined): string {
  const resolved = bucket ?? env.R2_BUCKET;
  if (!resolved) {
    throw new Error("No R2 bucket: pass `bucket` or set the component's R2_BUCKET env var");
  }
  return resolved;
}

export function objectUrl(accountId: string, bucket: string, key: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com/${encodePath(bucket)}/${encodePath(key)}`;
}

export function dashboardLink(accountId: string, bucket: string, key: string): string {
  return `https://dash.cloudflare.com/${accountId}/r2/default/buckets/${encodePath(bucket)}/objects/${encodeURIComponent(key)}/details`;
}

export async function presignObject(
  bucket: string,
  key: string,
  options: Omit<PresignOptions, "url" | "now"> & { now?: number },
): Promise<string> {
  const { accountId, credentials } = r2Config();
  return presign(credentials, {
    ...options,
    url: objectUrl(accountId, bucket, key),
    now: options.now ?? Date.now(),
  });
}

/** Hex SHA-256 to the base64 form of `x-amz-checksum-sha256`. */
export function hexToBase64(value: string): string {
  const bytes = value.match(/../g)!.map((pair) => parseInt(pair, 16));
  return btoa(String.fromCharCode(...bytes));
}

export function base64ToHex(value: string): string {
  return Array.from(atob(value), (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export type ObjectHead = { size: number; contentType: string | null; sha256: string | null };

/** HEADs an object. Returns null when it doesn't exist. Needs an action (fetch). */
/** Signed into the HEAD: R2 only returns the SHA-256 when asked. */
export const HEAD_SIGNED_HEADERS = { "x-amz-checksum-mode": "ENABLED" };
/**
 * Not signed: Cloudflare compresses text responses and then drops
 * Content-Length, even on HEAD, unless the response is asked uncompressed.
 */
export const HEAD_HEADERS = { ...HEAD_SIGNED_HEADERS, "Accept-Encoding": "identity" };

export async function headObject(bucket: string, key: string): Promise<ObjectHead | null> {
  const url = await presignObject(bucket, key, {
    method: "HEAD",
    headers: HEAD_SIGNED_HEADERS,
    expiresIn: 60,
  });
  const response = await fetch(url, { method: "HEAD", headers: HEAD_HEADERS });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 HEAD ${key} failed: ${response.status}`);
  // Throwing lets the caller retry; reading a missing length as 0 would
  // reject and delete a good file.
  const length = response.headers.get("content-length");
  if (length === null) throw new Error(`R2 HEAD ${key} returned no Content-Length`);
  const checksum = response.headers.get("x-amz-checksum-sha256");
  return {
    size: Number(length),
    contentType: response.headers.get("content-type"),
    sha256: checksum ? base64ToHex(checksum) : null,
  };
}

/** Deletes an object. Deleting a missing object succeeds. Needs an action (fetch). */
export async function deleteObject(bucket: string, key: string): Promise<void> {
  const url = await presignObject(bucket, key, { method: "DELETE", expiresIn: 60 });
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${response.status}`);
  }
}
