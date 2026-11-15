// @vitest-environment node
// The reference signer needs Node's crypto.
import { Hash } from "@smithy/hash-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import { describe, expect, test } from "vite-plus/test";
import { encodePath, presign, type PresignOptions } from "./sigv4.js";

const credentials = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

// https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html#query-string-auth-v4-signing-example
test("matches the AWS documentation example", async () => {
  const url = await presign(credentials, {
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    expiresIn: 86400,
    now: Date.UTC(2013, 4, 24),
    region: "us-east-1",
  });
  expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe(
    "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
  );
});

/** The AWS SDK's signer, configured to sign what ours signs. */
async function reference(options: PresignOptions) {
  const url = new URL(options.url);
  const headers = Object.fromEntries(
    Object.entries(options.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const signer = new SignatureV4({
    service: "s3",
    region: options.region ?? "auto",
    credentials,
    sha256: Hash.bind(null, "sha256"),
    uriEscapePath: false, // S3 keys are encoded once
  });
  const signed = await signer.presign(
    new HttpRequest({
      method: options.method,
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname,
      query: options.query ?? {},
      headers: { ...headers, host: url.host, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" },
    }),
    {
      expiresIn: options.expiresIn,
      signingDate: new Date(options.now),
      // The payload stays unsigned; other x-amz-* headers stay signed headers.
      unsignableHeaders: new Set(["x-amz-content-sha256"]),
      unhoistableHeaders: new Set(Object.keys(headers).concat("x-amz-content-sha256")),
    },
  );
  return { path: signed.path, query: signed.query };
}

const keys = [
  "a.pdf",
  "folders/f1/j57fx0zgmtz02k4996spxet3mh8j82tx",
  "spaces and ñandú/Contrato.pdf",
  "plus+equals=amp&hash#question?.txt",
  "tilde~bang!quote'paren()star*.txt",
  "percent%20literal",
  "emoji 📄/中文/ελληνικά",
  "dots.../_-/x",
];

const headerSets: Record<string, Record<string, string>> = {
  none: {},
  upload: {
    "Content-Type": "application/pdf",
    "Content-Length": "20971520",
    "If-None-Match": "*",
    "x-amz-checksum-sha256": "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=",
  },
  "messy whitespace": { "x-amz-meta-note": "  two   spaces\tand tab  " },
};

const queries: Record<string, Record<string, string>> = {
  none: {},
  disposition: {
    "response-content-disposition": `attachment; filename="Contrato _.pdf"; filename*=UTF-8''Contrato%20%C3%B1.pdf`,
  },
};

const cases = keys.flatMap((key) =>
  (["GET", "HEAD", "PUT", "DELETE"] as const).flatMap((method) =>
    Object.keys(headerSets).flatMap((headers) =>
      Object.keys(queries).map((query) => ({ key, method, headers, query })),
    ),
  ),
);

describe("presign matches the AWS SDK signer", () => {
  test.for(cases)("$method $key, headers: $headers, query: $query", async (c) => {
    const options: PresignOptions = {
      method: c.method,
      url: `https://acc.r2.cloudflarestorage.com/my-bucket/${encodePath(c.key)}`,
      headers: headerSets[c.headers],
      query: queries[c.query],
      expiresIn: 300,
      now: Date.UTC(2026, 10, 15, 12, 30, 5),
    };
    const ours = new URL(await presign(credentials, options));
    const theirs = await reference(options);

    expect(ours.pathname).toBe(theirs.path);
    expect(Object.fromEntries(ours.searchParams)).toEqual(theirs.query);
  });
});

test("encodePath keeps slashes and encodes everything outside RFC 3986's unreserved set", () => {
  expect(encodePath("a b/ñ+(1)!*'~._-")).toBe("a%20b/%C3%B1%2B%281%29%21%2A%27~._-");
});
