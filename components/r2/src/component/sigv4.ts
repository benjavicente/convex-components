// Minimal AWS Signature V4 query presigning for R2's S3 API, on WebCrypto only.
// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html

export type Credentials = { accessKeyId: string; secretAccessKey: string };

export type PresignOptions = {
  method: "GET" | "HEAD" | "PUT" | "DELETE";
  /** Full object URL, e.g. `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`. */
  url: string;
  /** Headers the request must send with these exact values. */
  headers?: Record<string, string>;
  /** Extra query parameters to sign, e.g. `response-content-disposition`. */
  query?: Record<string, string>;
  expiresIn: number;
  /** Signing time, in milliseconds since the epoch. */
  now: number;
  region?: string;
};

const encoder = new TextEncoder();

/** RFC 3986 encoding, as SigV4 requires. */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Encodes each segment of an unencoded object path. */
export function encodePath(path: string): string {
  return path.split("/").map(uriEncode).join("/");
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

/** Returns a presigned URL. The caller must send `headers` unchanged. */
export async function presign(credentials: Credentials, options: PresignOptions): Promise<string> {
  const region = options.region ?? "auto";
  const url = new URL(options.url);
  const amzDate = new Date(options.now).toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;

  const headers = new Map<string, string>([["host", url.host]]);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    headers.set(name.toLowerCase(), value.trim().replace(/\s+/g, " "));
  }
  const headerNames = [...headers.keys()].sort();
  const signedHeaders = headerNames.join(";");

  const query: Record<string, string> = {
    ...options.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${credentials.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(options.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${uriEncode(name)}=${uriEncode(query[name]!)}`)
    .join("&");

  // `url.pathname` must already be encoded with `encodePath`.
  const canonicalUri = url.pathname;
  const canonicalRequest = [
    options.method,
    canonicalUri,
    canonicalQuery,
    headerNames.map((name) => `${name}:${headers.get(name)}\n`).join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join(
    "\n",
  );

  let key: ArrayBuffer | Uint8Array = encoder.encode(`AWS4${credentials.secretAccessKey}`);
  for (const part of [date, region, "s3", "aws4_request"]) key = await hmac(key, part);
  const signature = hex(await hmac(key, stringToSign));

  return `${url.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
