import { useAuthActions } from "@convex-dev/auth/react";
import { useOauth, useSignInWithGithub } from "@convex-dev/auth/methods/github/react";
import {
  useMutation as useTanStackMutation,
  useQuery as useTanStackQuery,
} from "@tanstack/react-query";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../convex/_generated/api";
import { STICKERS, DOCUMENTS } from "../convex/lib/pricing";
import type { Doc } from "../convex/_generated/dataModel";
import { errorMessage, UploadForm } from "./UploadForm";

function Brand() {
  return (
    <a className="brand" href="#main">
      <span className="brand-mark" aria-hidden="true">
        r2<span>✦</span>
      </span>
      <span>
        the upload desk<small>A CONVEX + R2 PLAYGROUND</small>
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
          <span className="font-display text-3xl">Setting up your desk…</span>
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
        <span className="desk-tag">small files, big possibilities</span>
      </header>
      <main id="main" className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">A LITTLE UPLOAD WORKSHOP</p>
          <h1>
            Make yourself
            <br />
            at <span className="underline-crayon">home.</span>
          </h1>
          <p className="intro">
            A place for your favorite stickers, tiny documents, and a little experimenting.
          </p>
          <div className="welcome-samples" aria-hidden="true">
            <span className="sample-flower">✿</span>
            <span className="sample-paper">
              a tiny
              <br />
              masterpiece <span>★</span>
            </span>
            <span className="sample-star">★</span>
          </div>
        </div>
        <section className="name-card paper-card">
          <div className="name-band">
            HELLO, CREATOR<small>this desk is yours</small>
          </div>
          <div className="name-body">
            <span className="gold-star" aria-hidden="true">
              ★
            </span>
            <h2>Let’s make something.</h2>
            <p>
              Sign in with GitHub and start with <strong>5 coins</strong>. Spend them on two little
              ways to upload.
            </p>
            <div className="welcome-prices">
              <span>
                ✿ Stickers{" "}
                <strong>
                  {STICKERS.cost} {STICKERS.cost === 1 ? "coin" : "coins"}
                </strong>
              </span>
              <span>
                ▤ Documents{" "}
                <strong>
                  {DOCUMENTS.cost} {DOCUMENTS.cost === 1 ? "coin" : "coins"}
                </strong>
              </span>
            </div>
            <button
              className="button ink w-full"
              disabled={signin.isPending}
              onClick={() => signin.mutate()}
            >
              {signin.isPending ? "Opening GitHub…" : "Sign in with GitHub"}
              <span aria-hidden="true">↗</span>
            </button>
            <p className="file-hint text-center">
              Your own collection. Live updates. Real server rules.
            </p>
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
              <small>in your pocket</small>
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
          <div>
            <p className="eyebrow">PICK A FILE. MAKE IT YOURS.</p>
            <h1>
              Your little <span className="underline-crayon">upload desk.</span>
            </h1>
            <p className="intro">Two upload paths. A few coins. Plenty of room to play.</p>
          </div>
          <span className="desk-stamp" aria-hidden="true">
            small files
            <br />
            <b>BIG IDEAS</b>
            <span>✦ ✦ ✦</span>
          </span>
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

function DeskRules() {
  return (
    <footer className="desk-rules">
      <p className="font-display text-xl">A little look under the paper.</p>
      <ol>
        <li>
          <span>1</span>
          <div>
            <strong>Request a spot</strong>
            <p>Each upload path checks its own file type, size and coin rules on the server.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Straight to R2</strong>
            <p>Your browser hashes the file and uploads directly, with progress along the way.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>One final check</strong>
            <p>Confirmation spends your coins. If the server refuses, the file is deleted.</p>
          </div>
        </li>
      </ol>
      <p className="footer-line">
        Built with Convex + Cloudflare R2 <span>Made for small experiments ✦</span>
      </p>
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
          <p className="eyebrow">{sticker ? "01 / STICKER SHEET" : "02 / PAPER FOLDER"}</p>
          <h2 id={`${kind}-heading`}>
            {sticker ? "Stick something good." : "File a little thought."}
          </h2>
        </div>
      </div>
      <div className="price-tag">
        ★ {rules.cost} {rules.cost === 1 ? "coin" : "coins"} · up to {rules.maxSize / 1024} KB
      </div>
      <p className="section-description">
        {sticker
          ? "Tiny images, ready to collect. Saved with a label and shown with a signed image URL."
          : "A home for your words. Saved with a title and downloaded as an attachment."}
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
        <h3>Your sticker sheet</h3>
        <span>{stickers?.length ?? "…"} collected</span>
      </div>
      {stickers === undefined ? (
        <p role="status" className="empty-state">
          Opening your sticker sheet…
        </p>
      ) : stickers.length === 0 ? (
        <div className="empty-state">
          <span className="empty-doodles" aria-hidden="true">
            ✧ ✿ ♡
          </span>
          <p>Your first sticker goes here.</p>
          <small>Upload a tiny image to start your collection.</small>
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
        <h3>Your paper folder</h3>
        <span>{documents?.length ?? "…"} filed</span>
      </div>
      {documents === undefined ? (
        <p role="status" className="empty-state">
          Opening your folder…
        </p>
      ) : documents.length === 0 ? (
        <div className="empty-state folder-empty">
          <span className="empty-doodles" aria-hidden="true">
            ▤
          </span>
          <p>A fresh folder, just for you.</p>
          <small>Drop in a document to fill the first page.</small>
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
