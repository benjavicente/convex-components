/// <reference types="node" />
// Checks what real R2 enforces on presigned PUTs. Runs only with R2_TEST_ACCOUNT_ID,
// R2_TEST_ACCESS_KEY_ID, R2_TEST_SECRET_ACCESS_KEY and R2_TEST_BUCKET set; the
// token needs Object Read & Write on that bucket.
import { afterAll, describe, expect, test } from "vite-plus/test";
import { base64ToHex, hexToBase64, objectUrl } from "./component/r2.js";
import { encodePath, presign } from "./component/sigv4.js";

const env = {
  accountId: process.env.R2_TEST_ACCOUNT_ID,
  accessKeyId: process.env.R2_TEST_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_TEST_SECRET_ACCESS_KEY,
  bucket: process.env.R2_TEST_BUCKET,
};
const configured = Object.values(env).every(Boolean);

describe.skipIf(!configured)("real R2", () => {
  const credentials = { accessKeyId: env.accessKeyId!, secretAccessKey: env.secretAccessKey! };
  const prefix = `convex-r2-live-test/${crypto.randomUUID()}`;
  const keys: string[] = [];
  const body = new TextEncoder().encode("hello");
  const sha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  function url(key: string) {
    return objectUrl(env.accountId!, env.bucket!, key);
  }

  /** Signs a PUT the way the component does. */
  async function signPut(name: string, now = Date.now()) {
    const key = `${prefix}/${name} ñ`;
    keys.push(key);
    const headers = {
      "Content-Type": "text/plain",
      "If-None-Match": "*",
      "x-amz-checksum-sha256": hexToBase64(sha256),
    };
    const signed = await presign(credentials, {
      method: "PUT",
      url: url(key),
      headers: { ...headers, "Content-Length": String(body.length) },
      expiresIn: 300,
      now,
    });
    return { key, url: signed, headers };
  }

  async function signed(method: "HEAD" | "DELETE", key: string, headers = {}) {
    return presign(credentials, { method, url: url(key), headers, expiresIn: 60, now: Date.now() });
  }

  afterAll(async () => {
    for (const key of keys) await fetch(await signed("DELETE", key), { method: "DELETE" });
  });

  test("accepts the signed PUT and reports the stored checksum on HEAD", async () => {
    const put = await signPut("ok");
    const response = await fetch(put.url, { method: "PUT", headers: put.headers, body });
    expect(response.status, await response.text()).toBe(200);

    const headHeaders = { "x-amz-checksum-mode": "ENABLED" };
    const head = await fetch(await signed("HEAD", put.key, headHeaders), {
      method: "HEAD",
      headers: headHeaders,
    });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-type")).toBe("text/plain");
    expect(head.headers.get("content-length")).toBe("5");
    expect(base64ToHex(head.headers.get("x-amz-checksum-sha256") ?? "")).toBe(sha256);
  });

  test("If-None-Match: * refuses a second PUT to the same key", async () => {
    const put = await signPut("twice");
    expect((await fetch(put.url, { method: "PUT", headers: put.headers, body })).status).toBe(200);
    const again = await fetch(put.url, { method: "PUT", headers: put.headers, body });
    expect(again.status).toBe(412);
  });

  test("refuses a body longer than the signed Content-Length", async () => {
    const put = await signPut("longer");
    const response = await fetch(put.url, { method: "PUT", headers: put.headers, body: "hello!" });
    expect(response.status).toBe(403);
  });

  test("refuses a body of the right length whose SHA-256 differs", async () => {
    const put = await signPut("digest");
    const response = await fetch(put.url, { method: "PUT", headers: put.headers, body: "HELLO" });
    expect(response.status).toBe(400);
  });

  test("refuses a different Content-Type", async () => {
    const put = await signPut("type");
    const headers = { ...put.headers, "Content-Type": "text/html" };
    expect((await fetch(put.url, { method: "PUT", headers, body })).status).toBe(403);
  });

  test("refuses a PUT that drops If-None-Match", async () => {
    const put = await signPut("no-if-none-match");
    const { "If-None-Match": _, ...headers } = put.headers;
    expect((await fetch(put.url, { method: "PUT", headers, body })).status).toBe(403);
  });

  test("refuses an expired URL", async () => {
    const put = await signPut("expired", Date.now() - 10 * 60 * 1000);
    expect((await fetch(put.url, { method: "PUT", headers: put.headers, body })).status).toBe(403);
  });

  test("encodes keys with spaces and non-ASCII", () => {
    expect(new URL(url(`${prefix}/a ñ`)).pathname).toBe(
      `/${env.bucket}/${encodePath(`${prefix}/a ñ`)}`,
    );
  });
});
