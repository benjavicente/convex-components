/// <reference types="vite-plus/client" />
import { R2 } from "@benjavicente/convex-r2";
import r2Test from "@benjavicente/convex-r2/test";
import { registerGithubOauth } from "@convex-dev/auth/components/github/test";
import { registerCore, sessionIdentity } from "@convex-dev/auth/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { r2 } from "./lib/r2";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const sha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const sha256Base64 = "LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=";
const png = { name: "cat.png", contentType: "image/png", size: 5, sha256 };
const pdf = { name: "Contrato ñ.pdf", contentType: "application/pdf", size: 5, sha256 };

type Call = { method: string; path: string };
type FakeObject = { size: number; contentType: string; sha256: string };

/** Fakes R2: HEAD answers with the object stored under that key, or 404. */
function fakeR2(objects: (key: string) => FakeObject | null) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const path = decodeURIComponent(new URL(input).pathname);
      calls.push({ method, path });
      if (method !== "HEAD") return new Response(null, { status: 204 });
      const object = objects(path.replace(/^\/demo\//, ""));
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

/** Every key holds exactly what its request declared. */
const uploadedAsDeclared = (file: { size: number; contentType: string }) => () => ({
  size: file.size,
  contentType: file.contentType,
  sha256: sha256Base64,
});

function setup() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerGithubOauth(t);
  r2Test.register(t);
  return t;
}

/** Creates a GitHub user and a session for it, as a sign-in would. */
async function signIn(t: ReturnType<typeof setup>, login: string) {
  const userId = await t.mutation(internal.users.createUser, {
    method: { name: "github", profile: { id: login, login, emailVerified: false } },
  });
  const tokens = await t.run((ctx) =>
    ctx.runMutation(components.auth.public._internal_dangerous_signIn, {
      claims: { method: "github", profile: {} },
      componentPath: "authGithub",
      userId,
      accessTokenTtlSeconds: 3600,
      refreshInactivityTimeoutSeconds: 86400,
      sessionMaxLifetimeSeconds: 86400,
    }),
  );
  return { userId, as: t.withIdentity(sessionIdentity(tokens)) };
}

async function coins(user: Awaited<ReturnType<typeof signIn>>) {
  return (await user.as.query(api.users.me, {}))?.coins;
}

/** Gives the user stickers they already keep, which spends 3 coins each. */
async function keepStickers(t: ReturnType<typeof setup>, ownerId: Id<"users">, count: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("stickers", { ownerId, uploadId: `kept-${i}`, label: "kept" });
    }
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("R2_ACCOUNT_ID", "acc");
  vi.stubEnv("R2_ACCESS_KEY_ID", "key-id");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "s3cr3t");
  vi.stubEnv("R2_BUCKET", "demo");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("requesting uploads", () => {
  test("needs a signed-in user", async () => {
    const t = setup();
    await expect(t.mutation(api.stickers.requestUpload, { label: "cat", ...png })).rejects.toThrow(
      "Sign in first",
    );
  });

  test("signs a short-lived PUT bound to the declared file, under a server key", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    const upload = await alice.as.mutation(api.stickers.requestUpload, { label: "cat", ...png });

    expect(upload.key).toBe(`stickers/${alice.userId}/${upload.uploadId}`);
    expect(upload.headers).toEqual({
      "Content-Type": "image/png",
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
    ["stickers", { contentType: "application/pdf" }, "not allowed"],
    ["stickers", { size: 200 * 1024 + 1 }, "larger than 204800"],
    ["documents", { contentType: "image/png" }, "not allowed"],
    ["documents", { size: 40 * 1024 + 1 }, "larger than 40960"],
    ["documents", { size: 0 }, "positive integer"],
    ["documents", { sha256: "ABC" }, "lowercase hex"],
  ] as const)("%s rejects %o with a message for the client", async (type, change, message) => {
    const t = setup();
    const alice = await signIn(t, "alice");
    const request =
      type === "stickers"
        ? alice.as.mutation(api.stickers.requestUpload, { label: "x", ...png, ...change })
        : alice.as.mutation(api.documents.requestUpload, { title: "x", ...pdf, ...change });
    // A ConvexError's data is what reaches the client; a plain Error's message doesn't.
    await expect(request).rejects.toMatchObject({ data: expect.stringContaining(message) });
  });

  test("each type checks its own price before signing", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    await keepStickers(t, alice.userId, 3);
    await expect(
      alice.as.mutation(api.stickers.requestUpload, { label: "cat", ...png }),
    ).rejects.toThrow("This costs 3 coins; you have 1");
    await expect(
      alice.as.mutation(api.documents.requestUpload, { title: "Contract", ...pdf }),
    ).resolves.toMatchObject({ uploadId: expect.any(String) });
  });
});

describe("confirming uploads", () => {
  test("a sticker costs 3 coins and a document 1, each in its own table", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    fakeR2(uploadedAsDeclared(png));
    const sticker = await alice.as.mutation(api.stickers.requestUpload, { label: "cat", ...png });
    expect(await t.action(api.uploads.confirm, { uploadId: sticker.uploadId })).toMatchObject({
      status: "ready",
    });
    expect(await coins(alice)).toBe(7);

    fakeR2(uploadedAsDeclared(pdf));
    const doc = await alice.as.mutation(api.documents.requestUpload, {
      title: " Contract ",
      ...pdf,
    });
    expect(await t.action(api.uploads.confirm, { uploadId: doc.uploadId })).toMatchObject({
      status: "ready",
    });
    expect(await coins(alice)).toBe(6);

    expect(await alice.as.query(api.stickers.mine, {})).toMatchObject([
      { ownerId: alice.userId, uploadId: sticker.uploadId, label: "cat" },
    ]);
    expect(await alice.as.query(api.documents.mine, {})).toMatchObject([
      { ownerId: alice.userId, uploadId: doc.uploadId, title: "Contract", fileName: pdf.name },
    ]);
  });

  test("confirming twice charges once", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    fakeR2(uploadedAsDeclared(png));
    const { uploadId } = await alice.as.mutation(api.stickers.requestUpload, {
      label: "cat",
      ...png,
    });
    const first = await t.action(api.uploads.confirm, { uploadId });
    expect(await t.action(api.uploads.confirm, { uploadId })).toEqual(first);
    expect(await coins(alice)).toBe(7);
  });

  test("onConfirm refusing (coins spent meanwhile) deletes the upload at once", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    // With 4 coins left, both requests pass the price check; only one can be paid.
    await keepStickers(t, alice.userId, 2);
    const first = await alice.as.mutation(api.stickers.requestUpload, { label: "A", ...png });
    const second = await alice.as.mutation(api.stickers.requestUpload, { label: "B", ...png });
    const calls = fakeR2(uploadedAsDeclared(png));

    await t.action(api.uploads.confirm, { uploadId: first.uploadId });
    expect(await t.action(api.uploads.confirm, { uploadId: second.uploadId })).toEqual({
      status: "rejected",
      reason: "This costs 3 coins; you have 1",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toContainEqual({ method: "DELETE", path: `/demo/${second.key}` });
    expect(await coins(alice)).toBe(1);
    expect(await alice.as.query(api.stickers.mine, {})).toMatchObject([
      { label: "A" },
      { label: "kept" },
      { label: "kept" },
    ]);
    expect(await t.action(api.uploads.confirm, { uploadId: second.uploadId })).toEqual({
      status: "missing",
    });
  });

  test("a ready upload keeps no expiry, callback or context", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    fakeR2(uploadedAsDeclared(png));
    const { uploadId } = await alice.as.mutation(api.stickers.requestUpload, {
      label: "cat",
      ...png,
    });
    expect(await t.run((ctx) => r2.get(ctx, uploadId))).toMatchObject({
      status: "pending",
      expiresAt: expect.any(Number),
    });
    await t.action(api.uploads.confirm, { uploadId });
    const ready = await t.run((ctx) => r2.get(ctx, uploadId));
    expect(ready).toMatchObject({ status: "ready", key: expect.stringContaining(uploadId) });
    expect(ready).not.toHaveProperty("expiresAt");
  });

  test("before the PUT, reports notUploaded and charges nothing", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    fakeR2(() => null);
    const { uploadId } = await alice.as.mutation(api.stickers.requestUpload, {
      label: "cat",
      ...png,
    });
    expect(await t.action(api.uploads.confirm, { uploadId })).toEqual({ status: "notUploaded" });
    expect(await coins(alice)).toBe(10);
  });

  test.each([
    [{ size: 6 }, "size is 6"],
    [{ contentType: "image/gif" }, "content type is image/gif"],
    [{ sha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=" }, "sha256 is e3b0"],
  ])("an object with %o is deleted with its request, charging nothing", async (change, reason) => {
    const t = setup();
    const alice = await signIn(t, "alice");
    const { uploadId, key } = await alice.as.mutation(api.stickers.requestUpload, {
      label: "cat",
      ...png,
    });
    const calls = fakeR2(() => ({ ...uploadedAsDeclared(png)(), ...change }));

    const result = await t.action(api.uploads.confirm, { uploadId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(result).toMatchObject({ status: "rejected", reason: expect.stringContaining(reason) });
    expect(calls).toContainEqual({ method: "DELETE", path: `/demo/${key}` });
    expect(await coins(alice)).toBe(10);
    expect(await alice.as.query(api.stickers.mine, {})).toEqual([]);
  });

  test("ignores ids that aren't uploads", async () => {
    const t = setup();
    expect(await t.action(api.uploads.confirm, { uploadId: "nope" })).toEqual({
      status: "missing",
    });
  });
});

describe("expiry", () => {
  test("confirms and charges an upload the client never confirmed", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    fakeR2(uploadedAsDeclared(png));
    const { uploadId } = await alice.as.mutation(api.stickers.requestUpload, {
      label: "cat",
      ...png,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await alice.as.query(api.stickers.mine, {})).toMatchObject([{ uploadId }]);
    expect(await coins(alice)).toBe(7);
  });

  test("deletes a request that was never uploaded", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    const calls = fakeR2(() => null);
    const { uploadId, key } = await alice.as.mutation(api.stickers.requestUpload, {
      label: "cat",
      ...png,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(calls).toEqual([
      { method: "HEAD", path: `/demo/${key}` },
      { method: "DELETE", path: `/demo/${key}` },
    ]);
    expect(await t.action(api.uploads.confirm, { uploadId })).toEqual({ status: "missing" });
  });
});

describe("reading and deleting", () => {
  async function confirmedDocument(t: ReturnType<typeof setup>) {
    const alice = await signIn(t, "alice");
    const calls = fakeR2(uploadedAsDeclared(pdf));
    const { uploadId, key } = await alice.as.mutation(api.documents.requestUpload, {
      title: "Contract",
      ...pdf,
    });
    await t.action(api.uploads.confirm, { uploadId });
    const [document] = await alice.as.query(api.documents.mine, {});
    return { alice, document: document!, key, calls };
  }

  test("signs a GET for the owner only, with the file name as attachment", async () => {
    const t = setup();
    const { alice, document, key } = await confirmedDocument(t);
    const bob = await signIn(t, "bob");

    const url = new URL(
      (await alice.as.mutation(api.documents.url, { documentId: document._id }))!,
    );
    expect(decodeURIComponent(url.pathname)).toBe(`/demo/${key}`);
    expect(url.searchParams.get("response-content-disposition")).toBe(
      `attachment; filename="Contrato _.pdf"; filename*=UTF-8''Contrato%20%C3%B1.pdf`,
    );
    expect(await bob.as.mutation(api.documents.url, { documentId: document._id })).toBeNull();
  });

  test("remove deletes the row, the upload and the object, and gives the coin back", async () => {
    const t = setup();
    const { alice, document, key, calls } = await confirmedDocument(t);
    expect(await coins(alice)).toBe(9);
    await alice.as.mutation(api.documents.remove, { documentId: document._id });
    expect(await coins(alice)).toBe(10);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toContainEqual({ method: "DELETE", path: `/demo/${key}` });
    expect(await alice.as.query(api.documents.mine, {})).toEqual([]);
    expect(await t.action(api.uploads.confirm, { uploadId: document.uploadId })).toEqual({
      status: "missing",
    });
  });
});

describe("retention", () => {
  test("the daily cleanup deletes uploads older than 30 days, with their files", async () => {
    const t = setup();
    const alice = await signIn(t, "alice");
    const calls = fakeR2(uploadedAsDeclared(pdf));
    const old = await alice.as.mutation(api.documents.requestUpload, { title: "Old", ...pdf });
    await t.action(api.uploads.confirm, { uploadId: old.uploadId });

    vi.advanceTimersByTime(29 * 24 * 60 * 60 * 1000);
    const recent = await alice.as.mutation(api.documents.requestUpload, { title: "New", ...pdf });
    await t.action(api.uploads.confirm, { uploadId: recent.uploadId });
    vi.advanceTimersByTime(2 * 24 * 60 * 60 * 1000);

    await t.mutation(internal.cleanup.deleteOldUploads, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await alice.as.query(api.documents.mine, {})).toMatchObject([{ title: "New" }]);
    expect(calls).toContainEqual({ method: "DELETE", path: `/demo/${old.key}` });
    expect(calls).not.toContainEqual({ method: "DELETE", path: `/demo/${recent.key}` });
  });
});

// Type-level checks for `context`; never called.
export async function contextTypeChecks(ctx: MutationCtx, ownerId: Id<"users">) {
  const r2 = new R2(components.r2);
  const args = {
    keyPrefix: "x",
    file: png,
    rules: { maxSize: 1, contentTypes: [] },
    onConfirm: internal.stickers.onUploaded,
  };
  await r2.requestUpload(ctx, { ...args, context: { ownerId, label: "a" } });
  // @ts-expect-error `label` must be a string
  await r2.requestUpload(ctx, { ...args, context: { ownerId, label: 1 } });
  // @ts-expect-error `ownerId` is required
  await r2.requestUpload(ctx, { ...args, context: { label: "a" } });
  // @ts-expect-error a document's context doesn't fit a sticker's callback
  await r2.requestUpload(ctx, { ...args, context: { ownerId, title: "a" } });
}
