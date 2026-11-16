// Plain constants, so the page can import them too.

/** Images up to 200 KB for 3 coins. */
export const STICKERS = {
  cost: 3,
  maxSize: 200 * 1024,
  contentTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
};

/** Documents up to 40 KB for 1 coin. */
export const DOCUMENTS = {
  cost: 1,
  maxSize: 40 * 1024,
  contentTypes: ["application/pdf", "text/plain", "text/markdown"],
};

/** Uploads older than this are deleted by the daily cron. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
