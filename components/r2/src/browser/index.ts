import type { FileInfo } from "../component/validators.js";

export type { FileInfo };

/** What the app's request mutation returns (from `R2.requestUpload`). */
export type UploadTarget = { uploadId: string; url: string; headers: Record<string, string> };

export type UploadOptions<Target extends UploadTarget, Confirmed> = {
  /** Calls the app's request mutation for this upload type. */
  request: (file: FileInfo) => Promise<Target>;
  /** Calls the app's confirm action. Without it, the server confirms after the URL expires. */
  confirm?: (uploadId: string) => Promise<Confirmed>;
  onProgress?: (progress: { loaded: number; total: number }) => void;
  signal?: AbortSignal;
};

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hashes the file, gets a URL from `request`, PUTs the file with progress,
 * then runs `confirm` if given.
 */
export async function uploadFile<Target extends UploadTarget, Confirmed = undefined>(
  file: File,
  options: UploadOptions<Target, Confirmed>,
): Promise<{ target: Target; confirmed: Confirmed | undefined }> {
  const { signal } = options;
  signal?.throwIfAborted();
  const info: FileInfo = {
    name: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
    sha256: await sha256Hex(file),
  };
  signal?.throwIfAborted();
  const target = await options.request(info);
  signal?.throwIfAborted();
  await put(file, target, options);
  const confirmed = await options.confirm?.(target.uploadId);
  return { target, confirmed };
}

function put(
  file: File,
  target: UploadTarget,
  { onProgress, signal }: Pick<UploadOptions<UploadTarget, unknown>, "onProgress" | "signal">,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    if (onProgress) {
      xhr.upload.onprogress = (event) => onProgress({ loaded: event.loaded, total: event.total });
    }
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    const done = (fn: () => void) => {
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    xhr.onload = () =>
      done(() =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new UploadError(`Upload failed: ${xhr.status}`, xhr.status, xhr.responseText)),
      );
    xhr.onerror = () => done(() => reject(new UploadError("Upload failed: network error", 0, "")));
    xhr.onabort = () =>
      done(() => reject(signal?.reason ?? new DOMException("Aborted", "AbortError")));
    xhr.send(file);
  });
}
