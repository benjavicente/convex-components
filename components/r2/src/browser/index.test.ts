import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { UploadError, uploadFile } from "./index.js";

type Sent = { method: string; url: string; headers: Record<string, string>; body: unknown };

/** A fake XHR that reports progress and then answers with `status`. */
function fakeXhr(status: number, sent: Sent[]) {
  return class {
    upload: { onprogress?: (e: { loaded: number; total: number }) => void } = {};
    status = 0;
    responseText = "";
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    private request: Sent = { method: "", url: "", headers: {}, body: undefined };
    open(method: string, url: string) {
      this.request = { ...this.request, method, url };
    }
    setRequestHeader(name: string, value: string) {
      this.request.headers[name] = value;
    }
    abort() {
      queueMicrotask(() => this.onabort?.());
    }
    send(body: Blob) {
      this.request.body = body;
      sent.push(this.request);
      setTimeout(() => {
        this.upload.onprogress?.({ loaded: body.size, total: body.size });
        this.status = status;
        this.responseText = status === 200 ? "" : "<Error/>";
        this.onload?.();
      }, 0);
    }
  };
}

const target = { uploadId: "u1", url: "https://r2.test/put", headers: { "If-None-Match": "*" } };

afterEach(() => vi.unstubAllGlobals());

describe("uploadFile", () => {
  test("declares the file, PUTs it with the signed headers and confirms", async () => {
    const sent: Sent[] = [];
    vi.stubGlobal("XMLHttpRequest", fakeXhr(200, sent));
    const file = new File(["hello"], "hi.txt", { type: "text/plain" });
    const request = vi.fn(async () => target);
    const confirm = vi.fn(async () => "ok" as const);
    const progress = vi.fn();

    const result = await uploadFile(file, { request, confirm, onProgress: progress });

    expect(request).toHaveBeenCalledWith({
      name: "hi.txt",
      contentType: "text/plain",
      size: 5,
      sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    });
    expect(sent).toEqual([{ method: "PUT", url: target.url, headers: target.headers, body: file }]);
    expect(progress).toHaveBeenCalledWith({ loaded: 5, total: 5 });
    expect(confirm).toHaveBeenCalledWith("u1");
    expect(result).toEqual({ target, confirmed: "ok" });
  });

  test("rejects with the status when R2 refuses the PUT, without confirming", async () => {
    vi.stubGlobal("XMLHttpRequest", fakeXhr(403, []));
    const confirm = vi.fn();
    const error = await uploadFile(new File(["x"], "x.bin"), {
      request: async () => target,
      confirm,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect(error).toMatchObject({ status: 403, body: "<Error/>" });
    expect(confirm).not.toHaveBeenCalled();
  });

  test("aborts an in-flight PUT with the signal's reason", async () => {
    vi.stubGlobal("XMLHttpRequest", fakeXhr(200, []));
    const controller = new AbortController();
    const upload = uploadFile(new File(["x"], "x.bin"), {
      request: async () => {
        setTimeout(() => controller.abort(new Error("cancelled")), 0);
        return target;
      },
      signal: controller.signal,
    });
    await expect(upload).rejects.toThrow("cancelled");
  });
});
