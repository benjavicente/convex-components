import { useAuthActions } from "@convex-dev/auth/react";
import { useOauth, useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import {
  useMutation as useTanStackMutation,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { DOCUMENTS, STARTING_COINS, STICKERS } from "../convex/lib/pricing";
import type { Doc } from "../convex/_generated/dataModel";
import { errorMessage, UploadForm } from "./UploadForm";

function Brand() {
  return (
    <a className="brand" href="#main">
      <span className="brand-mark" aria-hidden="true">
        r2<span>✦</span>
      </span>
      <span>
        Convex R2 Component<small>DEMO</small>
      </span>
    </a>
  );
}

export function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {isLoading ? (
        <main id="main" className="loading" role="status">
          <span className="font-display text-3xl">Loading…</span>
        </main>
      ) : isAuthenticated ? (
        <Uploads />
      ) : (
        <SignIn />
      )}
    </>
  );
}

function SignIn() {
  const { signIn } = useSignInWithGithub(api.auth);
  const { flowError } = useOauth();
  const signin = useTanStackMutation({ mutationFn: () => signIn() });
  return (
    <div className="desk-shell">
      <header className="topbar">
        <Brand />
      </header>
      <main id="main" className="welcome">
        <div className="welcome-copy">
          <Intro />
        </div>
        <section className="name-card paper-card">
          <div className="name-band">Try the demo</div>
          <div className="name-body">
            <p>
              Sign in with GitHub to get <strong>{STARTING_COINS} coins</strong>. A sticker costs{" "}
              {STICKERS.cost} coins and a document costs {DOCUMENTS.cost}. Deleting a file gives its
              coins back.
            </p>
            <button
              className="button ink w-full"
              disabled={signin.isPending}
              onClick={() => signin.mutate()}
            >
              {signin.isPending ? "Opening GitHub…" : "Sign in with GitHub"}
              <span aria-hidden="true">↗</span>
            </button>
            {flowError && (
              <p className="note error" role="alert">
                Sign-in failed: {flowError.error}
              </p>
            )}
            {signin.isError && (
              <p className="note error" role="alert">
                {errorMessage(signin.error)}
              </p>
            )}
          </div>
        </section>
      </main>
      <DeskRules />
    </div>
  );
}

function Uploads() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const signout = useTanStackMutation({ mutationFn: () => signOut() });
  return (
    <div className="desk-shell">
      <header className="topbar">
        <Brand />
        <div className="account">
          <div className="coin-pouch">
            <span className="coin-star" aria-hidden="true">
              ★
            </span>
            <span>
              <strong>{me?.coins ?? "…"} coins</strong>
              <small>left</small>
            </span>
          </div>
          <div className="account-name">
            <span>{me?.login ?? "Your desk"}</span>
            <button
              className="text-button"
              disabled={signout.isPending}
              onClick={() => signout.mutate()}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {signout.isError && (
        <p className="note error" role="alert">
          {errorMessage(signout.error)}
        </p>
      )}
      <main id="main">
        <div className="desk-heading">
          <Intro />
        </div>
        <div className="workspaces">
          <Stickers coins={me?.coins} />
          <Documents coins={me?.coins} />
        </div>
      </main>
      <DeskRules />
    </div>
  );
}

function Intro() {
  return (
    <>
      <h1>Convex R2 Component</h1>
      <p className="intro">
        Upload files from the browser straight to Cloudflare R2. The server checks each file and
        then runs your <code>onConfirm</code> mutation, so you get full control without a webhook.
      </p>
    </>
  );
}

function DeskRules() {
  return (
    <footer className="desk-rules">
      <p className="font-display text-xl">How it works</p>
      <ol>
        <li>
          <span>1</span>
          <div>
            <strong>Request</strong>
            <p>
              Your mutation checks the user and the price. The component then signs a 5-minute,
              single-use upload URL for that exact file: its type, size and SHA-256.
            </p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Upload</strong>
            <p>The browser hashes the file and sends it to R2 directly, with progress.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Confirm</strong>
            <p>
              The server compares the stored file with the request and runs your{" "}
              <code>onConfirm</code> in the same transaction. If it throws, the file is deleted.
            </p>
          </div>
        </li>
        <li>
          <span>4</span>
          <div>
            <strong>Clean up</strong>
            <p>
              Uploads that are never confirmed are checked when they expire. This demo also deletes
              files after 30 days.
            </p>
          </div>
        </li>
      </ol>
      <p className="footer-line">Built with Convex and Cloudflare R2</p>
    </footer>
  );
}

function WorkCard({ kind, children }: { kind: "sticker" | "document"; children: ReactNode }) {
  const sticker = kind === "sticker";
  const rules = sticker ? STICKERS : DOCUMENTS;
  return (
    <section className={`paper-card work-card ${kind}-card`} aria-labelledby={`${kind}-heading`}>
      <span className="tape" aria-hidden="true" />
      <div className="section-heading">
        <span className="section-icon" aria-hidden="true">
          {sticker ? "✿" : "▤"}
        </span>
        <div>
          <h2 id={`${kind}-heading`}>{sticker ? "Stickers" : "Documents"}</h2>
        </div>
      </div>
      <div className="price-tag">
        ★ {rules.cost} {rules.cost === 1 ? "coin" : "coins"} · up to {rules.maxSize / 1024} KB
      </div>
      <p className="section-description">
        {sticker
          ? "Images saved with a label. Each upload type has its own request mutation, rules and onConfirm. The page shows stickers through signed URLs."
          : "PDF or text files saved with a title, in their own table with their own rules. Downloads use a signed URL that serves the file as an attachment."}
      </p>
      {children}
    </section>
  );
}

function Stickers({ coins }: { coins: number | undefined }) {
  const stickers = useQuery(api.stickers.mine);
  const request = useMutation(api.stickers.requestUpload);
  return (
    <WorkCard kind="sticker">
      <UploadForm
        kind="sticker"
        coins={coins}
        request={(info, label) => request({ ...info, label })}
      />
      <div className="collection-heading">
        <h3>Your stickers</h3>
        <span>{stickers?.length ?? "…"} collected</span>
      </div>
      {stickers === undefined ? (
        <p role="status" className="empty-state">
          Loading…
        </p>
      ) : stickers.length === 0 ? (
        <div className="empty-state">
          <span className="empty-doodles" aria-hidden="true">
            ✧ ✿ ♡
          </span>
          <p>No stickers yet.</p>
        </div>
      ) : (
        <ul className="sticker-grid">
          {stickers.map((sticker) => (
            <Sticker key={sticker._id} sticker={sticker} />
          ))}
        </ul>
      )}
    </WorkCard>
  );
}

function Sticker({ sticker }: { sticker: Doc<"stickers"> }) {
  const getUrl = useMutation(api.stickers.url);
  const remove = useMutation(api.stickers.remove);
  const signedUrl = useTanStackQuery({
    queryKey: ["stickerUrl", sticker._id],
    queryFn: () => getUrl({ stickerId: sticker._id }),
    // Refresh before the server's one-hour signed URL expires.
    staleTime: 50 * 60 * 1000,
  });
  const [imageFailed, setImageFailed] = useState(false);
  const deletion = useTanStackMutation({ mutationFn: () => remove({ stickerId: sticker._id }) });
  return (
    <li className="sticker-item">
      <div className="sticker-image">
        {signedUrl.data && !imageFailed ? (
          <img src={signedUrl.data} alt={sticker.label} onError={() => setImageFailed(true)} />
        ) : (
          <span className="text-sm">{signedUrl.isPending ? "Loading…" : "Image unavailable"}</span>
        )}
      </div>
      <p>{sticker.label}</p>
      <button
        className="text-button"
        disabled={deletion.isPending}
        aria-label={`Delete sticker ${sticker.label}`}
        onClick={() => deletion.mutate()}
      >
        {deletion.isPending ? "Deleting…" : "Delete"}
      </button>
      {(deletion.isError || signedUrl.isError) && (
        <p className="note error" role="alert">
          {errorMessage(signedUrl.error ?? deletion.error)}
        </p>
      )}
    </li>
  );
}

function Documents({ coins }: { coins: number | undefined }) {
  const documents = useQuery(api.documents.mine);
  const request = useMutation(api.documents.requestUpload);
  return (
    <WorkCard kind="document">
      <UploadForm
        kind="document"
        coins={coins}
        request={(info, title) => request({ ...info, title })}
      />
      <div className="collection-heading">
        <h3>Your documents</h3>
        <span>{documents?.length ?? "…"} filed</span>
      </div>
      {documents === undefined ? (
        <p role="status" className="empty-state">
          Loading…
        </p>
      ) : documents.length === 0 ? (
        <div className="empty-state folder-empty">
          <span className="empty-doodles" aria-hidden="true">
            ▤
          </span>
          <p>No documents yet.</p>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((document) => (
            <Document key={document._id} document={document} />
          ))}
        </ul>
      )}
    </WorkCard>
  );
}

function Document({ document }: { document: Doc<"documents"> }) {
  const getUrl = useMutation(api.documents.url);
  const remove = useMutation(api.documents.remove);
  const download = useTanStackMutation({
    mutationFn: async () => {
      const url = await getUrl({ documentId: document._id });
      if (!url) throw new Error("This document is no longer available.");
      location.assign(url);
    },
  });
  const deletion = useTanStackMutation({ mutationFn: () => remove({ documentId: document._id }) });
  return (
    <li className="document-item">
      <span className="document-tab">
        {document.fileName.split(".").pop()?.toUpperCase() ?? "FILE"}
      </span>
      <h4>{document.title}</h4>
      <p className="file-hint">
        {document.fileName} · {document.size.toLocaleString()} bytes
      </p>
      <div className="flex flex-wrap gap-4">
        <button
          className="text-button"
          disabled={download.isPending || deletion.isPending}
          onClick={() => download.mutate()}
          aria-label={`Download ${document.title}`}
        >
          {download.isPending ? "Preparing…" : "Download ↓"}
        </button>
        <button
          className="text-button"
          disabled={deletion.isPending || download.isPending}
          onClick={() => deletion.mutate()}
          aria-label={`Delete document ${document.title}`}
        >
          {deletion.isPending ? "Deleting…" : "Delete"}
        </button>
      </div>
      {(download.isError || deletion.isError) && (
        <p className="note error" role="alert">
          {errorMessage(download.error ?? deletion.error)}
        </p>
      )}
    </li>
  );
}
