import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "delete uploads older than 30 days",
  { hourUTC: 7, minuteUTC: 0 },
  internal.cleanup.deleteOldUploads,
);

export default crons;
