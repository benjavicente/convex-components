/// <reference types="vite-plus/client" />
import r2Test from "@benjavicente/convex-r2/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, components, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { R2 } from "@benjavicente/convex-r2";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const file = {
  name: "Contrato ñ.pdf",
  contentType: "application/pdf",
  size: 5,
  sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
};
const sha256Base64 = "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=";

type Call = { method: string; path: string };

/** Fakes R2: HEAD answers with `object` (or 404), everything else succeeds. */
function fakeR2(object: { size: number; contentType: string; sha256: string } | null) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, path: decodeURIComponent(new URL(input).pathname) });
      if (method !== "HEAD") return new Response(null, { status: 204 });
      if (!object) return new Response(null, { status: 404 });
      return new Response(null, {
        headers: {
          "content-length": String(object.size),
          "content-type": object.contentType,
          "x-amz-checksum-sha256": object.sha256,
        },
      });
    }),
  );
  return calls;
}

function setup() {
  const t = convexTest(schema, modules);
  r2Test.register(t);
  return t;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("R2_ACCOUNT_ID", "acc");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "s3cr3t");
  vi.stubEnv("R2_BUCKET", "docs");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("requestUpload", () => {
  test("signs a short-lived PUT bound to the declared file, under a server key", async () => {
    const t = setup();
    const upload = await t.mutation(api.documents.requestUpload, { folder: "f1", ...file });

    expect(upload.key).toBe(`folders/f1/${upload.uploadId}`);
    expect(upload.headers).toEqual({
      "Content-Type": "application/pdf",
      "If-None-Match": "*",
      "x-amz-checksum-sha256": sha256Base64,
    });
    const url = new URL(upload.url);
    expect(url.host).toBe("acc.r2.cloudflarestorage.com");
    expect(decodeURIComponent(url.pathname)).toBe(`/docs/${upload.key}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "content-length;content-type;host;if-none-match;x-amz-checksum-sha256",
    );
    expect(upload.url).not.toContain("s3cr3t");
  });

  test.each([
    [{ contentType: "text/html" }, "not allowed"],
    [{ size: 11 * 1024 * 1024 }, "larger than"],
    [{ size: 0 }, "positive integer"],
    [{ sha256: "ABC" }, "lowercase hex"],
  ])("rejects %o", async (change, message) => {
    const t = setup();
    await expect(
      t.mutation(api.documents.requestUpload, { folder: "f1", ...file, ...change }),
    ).rejects.toThrow(message);
  });

  test("rejects a key prefix with empty or dot segments", async () => {
    const t = setup();
    for (const folder of ["", "..", "a/"]) {
      await expect(t.mutation(api.documents.requestUpload, { folder, ...file })).rejects.toThrow(
        "Invalid key prefix",
      );
    }
  });
});

describe("confirmUpload", () => {
  test("a matching object marks the upload ready and runs onConfirm once", async () => {
    const t = setup();
    const { uploadId } = await t.mutation(api.documents.requestUpload, { folder: "f1", ...file });
    fakeR2({ size: 5, contentType: "application/pdf", sha256: sha256Base64 });

    const first = await t.action(api.documents.confirmUpload, { uploadId });
    const second = await t.action(api.documents.confirmUpload, { uploadId });

    expect(first).toMatchObject({ status: "ready", upload: { uploadId, name: file.name } });
    expect(second).toEqual(first);
    expect(await t.query(api.documents.list, { folder: "f1" })).toMatchObject([
      { folder: "f1", uploadId, name: file.name, contentType: file.contentType, size: 5 },
    ]);
  });

  test("before the PUT, reports notUploaded and writes nothing", async () => {
    const t = setup();
    const { uploadId } = await t.mutation(api.documents.requestUpload, { folder: "f1", ...file });
    fakeR2(null);
    expect(await t.action(api.documents.confirmUpload, { uploadId })).toEqual({
      status: "notUploaded",
    });
    expect(await t.query(api.documents.list, { folder: "f1" })).toEqual([]);
  });

  test.each([
    [{ size: 6 }, "size is 6"],
    [{ contentType: "text/html" }, "content type is text/html"],
    [{ sha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=" }, "sha256 is e3b0"],
  ])("an object with %o is rejected and deleted with its request", async (change, reason) => {
    const t = setup();
    const { uploadId, key } = await t.mutation(api.documents.requestUpload, {
      folder: "f1",
      ...file,
    });
    const calls = fakeR2({
      size: 5,
      contentType: "application/pdf",
      sha256: sha256Base64,
      ...change,
    });

    const result = await t.action(api.documents.confirmUpload, { uploadId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining(reason) });
    expect(calls).toContainEqual({ method: "DELETE", path: `/docs/${key}` });
    expect(await t.query(api.documents.list, { folder: "f1" })).toEqual([]);
    expect(await t.action(api.documents.confirmUpload, { uploadId })).toEqual({
      status: "missing",
    });
  });

  test("ignores ids that aren't uploads", async () => {
    const t = setup();
    expect(await t.action(api.documents.confirmUpload, { uploadId: "nope" })).toEqual({
      status: "missing",
    });
  });

  test("onConfirm throwing leaves the upload pending; expiry then deletes it", async () => {
    const t = setup();
    const first = await t.mutation(api.documents.requestUpload, { folder: "f1", ...file });
    const second = await t.mutation(api.documents.requestUpload, { folder: "f1", ...file });
    const calls = fakeR2({ size: 5, contentType: "application/pdf", sha256: sha256Base64 });
    await t.action(api.documents.confirmUpload, { uploadId: first.uploadId });

    await expect(
      t.action(api.documents.confirmUpload, { uploadId: second.uploadId }),
    ).rejects.toThrow("already exists");
    const pending = await t.run((ctx) =>
      ctx.runQuery(components.r2.uploads.get, { uploadId: second.uploadId }),
    );
    expect(pending).toMatchObject({ status: "pending" });

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toContainEqual({ method: "DELETE", path: `/docs/${second.key}` });
    expect(await t.query(api.documents.list, { folder: "f1" })).toMatchObject([
      { uploadId: first.uploadId },
    ]);
  });
});

describe("expiry", () => {
  test("confirms an upload the client never confirmed", async () => {
    const t = setup();
    const { uploadId } = await t.mutation(api.documents.requestUpload, { folder: "f1", ...file });
    fakeR2({ size: 5, contentType: "application/pdf", sha256: sha256Base64 });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.query(api.documents.list, { folder: "f1" })).toMatchObject([{ uploadId }]);
  });

  test("deletes a request that was never uploaded", async () => {
    const t = setup();
    const { uploadId, key } = await t.mutation(api.documents.requestUpload, {
      folder: "f1",
      ...file,
    });
    const calls = fakeR2(null);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toEqual([
      { method: "HEAD", path: `/docs/${key}` },
      { method: "DELETE", path: `/docs/${key}` },
    ]);
    expect(await t.action(api.documents.confirmUpload, { uploadId })).toEqual({
      status: "missing",
    });
  });
});

describe("reads and deletes", () => {
  async function confirmedDocument(t: ReturnType<typeof setup>) {
    const { uploadId, key } = await t.mutation(api.documents.requestUpload, {
      folder: "f1",
      ...file,
    });
    const calls = fakeR2({ size: 5, contentType: "application/pdf", sha256: sha256Base64 });
    await t.action(api.documents.confirmUpload, { uploadId });
    const [document] = await t.query(api.documents.list, { folder: "f1" });
    return { document: document!, key, calls };
  }

  test("signs a GET with the file name as attachment", async () => {
    const t = setup();
    const { document, key } = await confirmedDocument(t);
    const url = new URL((await t.mutation(api.documents.getUrl, { documentId: document._id }))!);
    expect(decodeURIComponent(url.pathname)).toBe(`/docs/${key}`);
    expect(url.searchParams.get("response-content-disposition")).toBe(
      `attachment; filename="Contrato _.pdf"; filename*=UTF-8''Contrato%20%C3%B1.pdf`,
    );
  });

  test("remove deletes the document, the upload and the object", async () => {
    const t = setup();
    const { document, key, calls } = await confirmedDocument(t);
    await t.mutation(api.documents.remove, { documentId: document._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toContainEqual({ method: "DELETE", path: `/docs/${key}` });
    expect(await t.action(api.documents.confirmUpload, { uploadId: document.uploadId })).toEqual({
      status: "missing",
    });
  });
});

// Type-level checks for `context`; never called.
export async function contextTypeChecks(ctx: MutationCtx) {
  const r2 = new R2(components.r2);
  const args = {
    keyPrefix: "x",
    file,
    rules: { maxSize: 1, contentTypes: [] },
    onConfirm: internal.documents.onUploaded,
  };
  await r2.requestUpload(ctx, { ...args, context: { folder: "a" } });
  // @ts-expect-error `folder` must be a string
  await r2.requestUpload(ctx, { ...args, context: { folder: 1 } });
  // @ts-expect-error `folder` is required
  await r2.requestUpload(ctx, { ...args, context: {} });
  // @ts-expect-error unknown properties are rejected
  await r2.requestUpload(ctx, { ...args, context: { folder: "a", extra: true } });
}
