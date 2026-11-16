import { uploadFile, type FileInfo, type UploadTarget } from "@benjavicente/convex-r2/browser";
import { useMutation as useTanStackMutation } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import { STICKERS, DOCUMENTS } from "../convex/lib/pricing";

export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  }
  return error instanceof Error ? error.message : String(error);
}

export function UploadForm({
  kind,
  coins,
  request,
}: {
  kind: "sticker" | "document";
  coins: number | undefined;
  request: (info: FileInfo, text: string) => Promise<UploadTarget>;
}) {
  const sticker = kind === "sticker";
  const rules = sticker ? STICKERS : DOCUMENTS;
  const { cost } = rules;
  const id = `${kind}-file`;
  const confirm = useAction(api.uploads.confirm);
  const form = useRef<HTMLFormElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState(false);
  const mutation = useTanStackMutation({
    mutationFn: async ({
      file,
      text,
      signal,
    }: {
      file: File;
      text: string;
      signal: AbortSignal;
    }) => {
      const { confirmed } = await uploadFile(file, {
        request: (info) => request(info, text),
        signal,
        onProgress: ({ loaded, total }) =>
          setProgress(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0),
        confirm: (uploadId) => {
          setConfirming(true);
          return confirm({ uploadId });
        },
      });
      return confirmed;
    },
    onSuccess: (result) => {
      if (result?.status === "ready") {
        form.current?.reset();
        setFile(null);
      }
    },
    onSettled: () => setConfirming(false),
  });
  useEffect(() => () => controller.current?.abort(), []);
  const selectFile = (next: File | null) => {
    mutation.reset();
    setProgress(0);
    setFile(next);
  };
  const insufficient = coins !== undefined && coins < cost;
  const result = mutation.data;
  const cancelled = mutation.error instanceof Error && mutation.error.name === "AbortError";
  return (
    <form
      ref={form}
      className="upload-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!file || mutation.isPending || insufficient || coins === undefined) return;
        const value = new FormData(event.currentTarget).get("text");
        const text = typeof value === "string" ? value.trim() : "";
        if (!text) return;
        controller.current = new AbortController();
        setProgress(0);
        mutation.mutate({ file, text, signal: controller.current.signal });
      }}
    >
      <label className="field-label" htmlFor={`${kind}-text`}>
        {sticker ? "Give it a label" : "Give it a title"}
      </label>
      <input
        className="text-input"
        id={`${kind}-text`}
        name="text"
        placeholder={sticker ? "e.g. A very good frog" : "e.g. My tiny masterpiece"}
        required
        pattern=".*\S.*"
        disabled={mutation.isPending}
      />
      <div
        className={`dropzone ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!mutation.isPending) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!mutation.isPending) selectFile(event.dataTransfer.files[0] ?? null);
        }}
      >
        <span className="drop-icon" aria-hidden="true">
          {sticker ? "✿" : "↥"}
        </span>
        <label htmlFor={id} className="file-label">
          {file ? file.name : "Drop a little file here"}
        </label>
        <span className="text-sm">
          {file
            ? `${file.size.toLocaleString()} bytes · choose another below`
            : "or choose one from your computer"}
        </span>
        <input
          id={id}
          type="file"
          accept={rules.contentTypes.join(",")}
          disabled={mutation.isPending}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        />
      </div>
      <p className="file-hint">
        {rules.contentTypes.map((type) => type.split("/")[1]).join(", ")} · up to{" "}
        {rules.maxSize / 1024} KB
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="button primary"
          disabled={!file || mutation.isPending || insufficient || coins === undefined}
        >
          {mutation.isPending
            ? confirming
              ? "Checking with the server…"
              : "Uploading…"
            : `Upload ${kind}`}{" "}
          <span aria-hidden="true">↗</span>
        </button>
        {mutation.isPending && (
          <button
            type="button"
            className="text-button"
            disabled={confirming}
            onClick={() => controller.current?.abort()}
          >
            Cancel
          </button>
        )}
      </div>
      {insufficient && (
        <p className="file-hint">
          You need {cost} {cost === 1 ? "coin" : "coins"}; you have {coins}. Try a lower-cost upload
          if you can.
        </p>
      )}
      {coins === undefined && <p className="file-hint">Checking your coin balance…</p>}
      {mutation.isPending && (
        <div className="upload-progress">
          <progress aria-label={`${kind} upload progress`} max={100} value={progress} />
          <p>
            {confirming
              ? "File sent. Checking server rules; this step cannot be cancelled."
              : `Preparing & sending your file · ${progress}%`}
          </p>
        </div>
      )}
      <div aria-live="polite" aria-atomic="true">
        {result?.status === "ready" && (
          <p className="note success">★ All done! Your {kind} is on the desk.</p>
        )}
        {result?.status === "rejected" && (
          <p className="note error">
            A note from the server: {result.reason}. The refused file is deleted.
          </p>
        )}
        {result && result.status !== "ready" && result.status !== "rejected" && (
          <p className="note error">
            {result.status === "notUploaded"
              ? "The file did not reach storage."
              : "This upload request could not be found."}{" "}
            Please try again.
          </p>
        )}
        {mutation.isError && (
          <p className={`note ${cancelled ? "" : "error"}`}>
            {cancelled ? "Upload cancelled. You can try again." : errorMessage(mutation.error)}
          </p>
        )}
      </div>
    </form>
  );
}
