/// <reference types="vite/client" />
// The component's flow under convex-test, through a minimal app (./convex).
// R2 is faked; src/r2.live.test.ts checks what real R2 enforces.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { sweepGraceMs } from "../src/component/uploads.js";
import { register } from "../src/test.js";
import { api } from "./convex/_generated/api.js";
import schema from "./convex/schema.js";
const modules = import.meta.glob("./convex/**/*.ts");
const sha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const sha256Base64 = "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=";
const pdf = { name: "Estados financieros ñ.pdf", contentType: "application/pdf", size: 5, sha256 };
/**
 * Fakes R2. A PUT stores what it sends; HEAD answers with `head(key)` if
 * given, else the stored object, else 404. Like Cloudflare, it compresses text
 * and drops Content-Length unless the request asks for `Accept-Encoding: identity`.
 */
function fakeR2(head) {
  const calls = [];
  const objects = new Map();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init = {}) => {
      const method = init.method ?? "GET";
      const key = decodeURIComponent(new URL(input).pathname).replace(/^\/test\//, "");
      const headers = new Headers(init.headers);
      calls.push({ method, key });
      if (method === "PUT") {
        objects.set(key, {
          size: init.body.size,
          contentType: headers.get("content-type") ?? "",
          sha256: headers.get("x-amz-checksum-sha256") ?? "",
        });
        return new Response(null, { status: 200 });
      }
      if (method !== "HEAD") return new Response(null, { status: 204 });
      const object = head ? head(key) : (objects.get(key) ?? null);
      if (!object) return new Response(null, { status: 404 });
      const compressed =
        object.contentType.startsWith("text/") && headers.get("accept-encoding") !== "identity";
      return new Response(null, {
        headers: {
          ...(compressed ? {} : { "content-length": String(object.size) }),
          "content-type": object.contentType,
          "x-amz-checksum-sha256": object.sha256,
        },
      });
    }),
  );
  return calls;
}
/** Every key holds exactly what was declared for `file`. */
const asDeclared = (file) => () => ({
  size: file.size,
  contentType: file.contentType,
  sha256: sha256Base64,
});
function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("R2_ACCOUNT_ID", "acc");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "s3cr3t");
  vi.stubEnv("R2_BUCKET", "test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("request", () => {
  test("signs a 5-minute PUT bound to the declared file, under a server key", async () => {
    const t = setup();
    const upload = await t.mutation(api.app.request, { file: pdf });
    expect(upload.key).toBe(`docs/${upload.uploadId}`);
    expect(upload.headers).toEqual({
      "Content-Type": "application/pdf",
      "If-None-Match": "*",
      "x-amz-checksum-sha256": sha256Base64,
    });
    const url = new URL(upload.url);
    expect(url.host).toBe("acc.r2.cloudflarestorage.com");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match;x-amz-checksum-sha256",
    );
    expect(upload.url).not.toContain("s3cr3t");
  });
  test.each([
    [{ contentType: "image/png" }, "not allowed"],
    [{ size: 1025 }, "larger than 1024"],
    [{ size: 0 }, "positive integer"],
    [{ size: 1.5 }, "positive integer"],
    [{ name: "" }, "name is empty"],
    [{ sha256: "ABC" }, "lowercase hex"],
  ])("refuses %o with a ConvexError the client sees", async (change, message) => {
    const t = setup();
    await expect(
      t.mutation(api.app.request, { file: { ...pdf, ...change } }),
    ).rejects.toMatchObject({ data: expect.stringContaining(message) });
  });
});
describe("confirm", () => {
  test("runs onConfirm once and returns only the status", async () => {
    const t = setup();
    fakeR2(asDeclared(pdf));
    const { uploadId } = await t.mutation(api.app.request, { file: pdf });
    // Anyone with the id may confirm, so the result carries no file details.
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "ready" });
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "ready" });
    expect(await t.query(api.app.documents, {})).toMatchObject([{ uploadId, name: pdf.name }]);
  });
  test("reports notUploaded before the PUT, without running onConfirm", async () => {
    const t = setup();
    fakeR2(() => null);
    const { uploadId } = await t.mutation(api.app.request, { file: pdf });
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "notUploaded" });
    expect(await t.query(api.app.documents, {})).toEqual([]);
  });
  test.each([
    [{ size: 6 }, "size is 6"],
    [{ contentType: "text/plain" }, "content type is text/plain"],
    [{ sha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=" }, "sha256 is e3b0"],
  ])("rejects an object with %o and deletes it", async (change, reason) => {
    const t = setup();
    const { uploadId, key } = await t.mutation(api.app.request, { file: pdf });
    const calls = fakeR2(() => ({ ...asDeclared(pdf)(), ...change }));
    const result = await t.action(api.app.confirm, { uploadId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(result).toEqual({ status: "rejected", reason: expect.stringContaining(reason) });
    expect(calls).toContainEqual({ method: "DELETE", key });
    expect(await t.query(api.app.documents, {})).toEqual([]);
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "missing" });
  });
  test("an onConfirm that writes, then throws, leaves no write and deletes the upload", async () => {
    const t = setup();
    const calls = fakeR2(asDeclared(pdf));
    const { uploadId, key } = await t.mutation(api.app.request, { file: pdf, refuse: true });
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({
      status: "rejected",
      reason: "Refused by the app",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.query(api.app.documents, {})).toEqual([]);
    expect(await t.query(api.app.get, { uploadId })).toBeNull();
    expect(calls).toContainEqual({ method: "DELETE", key });
  });
  test("confirms a text file, which Cloudflare would compress", async () => {
    const t = setup();
    const text = { ...pdf, name: "notes.txt", contentType: "text/plain" };
    fakeR2(asDeclared(text));
    const { uploadId } = await t.mutation(api.app.request, { file: text });
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "ready" });
  });
  test("a HEAD without Content-Length throws, keeping the upload", async () => {
    const t = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { headers: { "content-type": "application/pdf" } })),
    );
    const { uploadId } = await t.mutation(api.app.request, { file: pdf });
    await expect(t.action(api.app.confirm, { uploadId })).rejects.toThrow("no Content-Length");
    fakeR2(asDeclared(pdf));
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "ready" });
  });
  test("ignores ids that aren't uploads", async () => {
    const t = setup();
    expect(await t.action(api.app.confirm, { uploadId: "nope" })).toEqual({ status: "missing" });
  });
});
describe("sweep after expiry", () => {
  test("the grace is a minute plus the file at 1 MB/s, at most 30 minutes", () => {
    expect(sweepGraceMs(200 * 1000)).toBe(60_200);
    expect(sweepGraceMs(100 * 1000 ** 2)).toBe(160_000);
    expect(sweepGraceMs(5 * 1024 ** 3)).toBe(30 * 60_000);
  });
  test("confirms an upload the client never confirmed", async () => {
    const t = setup();
    fakeR2(asDeclared(pdf));
    const { uploadId } = await t.mutation(api.app.request, { file: pdf });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.query(api.app.documents, {})).toMatchObject([{ uploadId }]);
  });
  test("waits for the URL's 5 minutes plus a minute of grace for a small file", async () => {
    const t = setup();
    const calls = fakeR2(() => null);
    const small = await t.mutation(api.app.request, { file: pdf });
    vi.advanceTimersByTime(5 * 60_000 + 59_000);
    await t.finishInProgressScheduledFunctions();
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(2_000);
    await t.finishInProgressScheduledFunctions();
    expect(calls).toContainEqual({ method: "HEAD", key: small.key });
  });
  test("deletes a request that was never uploaded", async () => {
    const t = setup();
    const calls = fakeR2(() => null);
    const { uploadId, key } = await t.mutation(api.app.request, { file: pdf });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toEqual([
      { method: "HEAD", key },
      { method: "DELETE", key },
    ]);
    expect(await t.action(api.app.confirm, { uploadId })).toEqual({ status: "missing" });
  });
  test("deletes the key again, in case a deleted upload was PUT again before expiry", async () => {
    const t = setup();
    const calls = fakeR2(asDeclared(pdf));
    const { uploadId, key } = await t.mutation(api.app.request, { file: pdf });
    await t.action(api.app.confirm, { uploadId });
    await t.mutation(api.app.remove, { uploadId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.filter((c) => c.method === "DELETE" && c.key === key)).toHaveLength(2);
  });
  test("retries when R2 fails", async () => {
    const t = setup();
    let failures = 2;
    const calls = fakeR2(() => {
      if (failures-- > 0) throw new Error("R2 is down");
      return asDeclared(pdf)();
    });
    const { uploadId } = await t.mutation(api.app.request, { file: pdf });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls.filter((c) => c.method === "HEAD")).toHaveLength(3);
    expect(await t.query(api.app.documents, {})).toMatchObject([{ uploadId }]);
  });
});
describe("reading, deleting and storing", () => {
  test("get and getUrl see ready uploads only", async () => {
    const t = setup();
    fakeR2(asDeclared(pdf));
    const { uploadId, key } = await t.mutation(api.app.request, { file: pdf });
    expect(await t.query(api.app.get, { uploadId })).toBeNull();
    expect(await t.query(api.app.getUrl, { uploadId })).toBeNull();
    await t.action(api.app.confirm, { uploadId });
    expect(await t.query(api.app.get, { uploadId })).toEqual({
      uploadId,
      bucket: "test",
      key,
      ...pdf,
      link: expect.stringContaining("dash.cloudflare.com"),
    });
    const url = new URL(await t.query(api.app.getUrl, { uploadId }));
    expect(decodeURIComponent(url.pathname)).toBe(`/test/${key}`);
    expect(url.searchParams.get("response-content-disposition")).toBe(
      `attachment; filename="Estados financieros _.pdf"; filename*=UTF-8''Estados%20financieros%20%C3%B1.pdf`,
    );
  });
  test("delete removes the upload and its object", async () => {
    const t = setup();
    const calls = fakeR2(asDeclared(pdf));
    const { uploadId, key } = await t.mutation(api.app.request, { file: pdf });
    await t.action(api.app.confirm, { uploadId });
    await t.mutation(api.app.remove, { uploadId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toContainEqual({ method: "DELETE", key });
    expect(await t.query(api.app.get, { uploadId })).toBeNull();
  });
  test("store uploads from an action through the same confirm", async () => {
    const t = setup();
    const calls = fakeR2();
    const result = await t.action(api.app.store, { text: "hello" });
    expect(result).toEqual({ uploadId: expect.any(String), status: "ready" });
    expect(calls.map((c) => c.method)).toEqual(["PUT", "HEAD"]);
    expect(await t.query(api.app.documents, {})).toMatchObject([
      { uploadId: result.uploadId, name: "note.txt" },
    ]);
  });
});
