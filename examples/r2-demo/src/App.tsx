import { useAuthActions } from "@convex-dev/auth/react";
import { useOauth, useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import { uploadFile } from "@benjavicente/convex-r2/browser";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) return <p>Loading…</p>;
  return isAuthenticated ? <Uploads /> : <SignIn />;
}

function SignIn() {
  const { signIn } = useSignInWithGithub(api.auth);
  const { flowError } = useOauth();
  return (
    <main>
      <h1>R2 uploads demo</h1>
      <p>Sign in to get 5 coins. Stickers cost 1 coin, documents 3.</p>
      <button onClick={() => void signIn()}>Sign in with GitHub</button>
      {flowError && <p role="alert">Sign-in failed: {flowError.error}</p>}
    </main>
  );
}

function Uploads() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  return (
    <main>
      <header>
        <h1>R2 uploads demo</h1>
        <p>
          {me?.login}: <strong>{me?.coins ?? "…"} coins</strong>{" "}
          <button onClick={() => void signOut()}>Sign out</button>
        </p>
      </header>
      <Stickers />
      <Documents />
    </main>
  );
}

/** Upload state shared by both sections. */
function useUpload() {
  const confirm = useAction(api.uploads.confirm);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  async function run(file: File, request: Parameters<typeof uploadFile>[1]["request"]) {
    setStatus("Uploading…");
    try {
      const { confirmed } = await uploadFile(file, {
        request,
        confirm: (uploadId) => confirm({ uploadId }),
        onProgress: ({ loaded, total }) => setProgress(loaded / total),
      });
      setStatus(
        confirmed?.status === "rejected"
          ? `Rejected: ${confirmed.reason}`
          : `Upload ${confirmed?.status}`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }
  const view = (
    <>
      <progress value={progress} />
      <output>{status}</output>
    </>
  );
  return { run, view };
}

function formFile(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  return { file: data.get("file") as File, text: data.get("text") as string };
}

function Stickers() {
  const stickers = useQuery(api.stickers.mine);
  const request = useMutation(api.stickers.requestUpload);
  const upload = useUpload();
  return (
    <section>
      <h2>Stickers: images up to 10 KB, 1 coin</h2>
      <form
        onSubmit={(event) => {
          const { file, text } = formFile(event);
          void upload.run(file, (info) => request({ label: text, ...info }));
        }}
      >
        <input name="text" placeholder="Label" required />
        <input
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          required
        />
        <button>Upload</button>
        {upload.view}
      </form>
      <ul>
        {stickers?.map((sticker) => (
          <Sticker key={sticker._id} sticker={sticker} />
        ))}
      </ul>
    </section>
  );
}

function Sticker({ sticker }: { sticker: Doc<"stickers"> }) {
  const getUrl = useMutation(api.stickers.url);
  const remove = useMutation(api.stickers.remove);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void getUrl({ stickerId: sticker._id }).then(setUrl);
  }, [getUrl, sticker._id]);
  return (
    <li>
      {url && <img src={url} alt={sticker.label} height={48} />} {sticker.label}{" "}
      <button onClick={() => void remove({ stickerId: sticker._id })}>Delete</button>
    </li>
  );
}

function Documents() {
  const documents = useQuery(api.documents.mine);
  const request = useMutation(api.documents.requestUpload);
  const getUrl = useMutation(api.documents.url);
  const remove = useMutation(api.documents.remove);
  const upload = useUpload();
  return (
    <section>
      <h2>Documents: PDF or text up to 50 KB, 3 coins</h2>
      <form
        onSubmit={(event) => {
          const { file, text } = formFile(event);
          void upload.run(file, (info) => request({ title: text, ...info }));
        }}
      >
        <input name="text" placeholder="Title" required />
        <input name="file" type="file" accept=".pdf,.txt,.md" required />
        <button>Upload</button>
        {upload.view}
      </form>
      <ul>
        {documents?.map((document) => (
          <li key={document._id}>
            {document.title} ({document.fileName}, {document.size} bytes){" "}
            <button
              onClick={() =>
                void getUrl({ documentId: document._id }).then((url) => url && location.assign(url))
              }
            >
              Download
            </button>{" "}
            <button onClick={() => void remove({ documentId: document._id })}>Delete</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
