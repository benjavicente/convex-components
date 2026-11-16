import { ConvexError } from "convex/values";

const MAX_LENGTH = 100;

/** Trims user text, throwing a `ConvexError` the client can show when it's empty or too long. */
export function requiredText(text: string, emptyMessage: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new ConvexError(emptyMessage);
  if (trimmed.length > MAX_LENGTH) throw new ConvexError(`Keep it under ${MAX_LENGTH} characters`);
  return trimmed;
}
