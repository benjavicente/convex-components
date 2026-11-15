import r2 from "@benjavicente/convex-r2/convex.config.js";
import authGithub from "@convex-dev/auth/components/github/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

// Components can't read the app's env vars, so the app declares them and
// binds them by reference: values stay in the deployment's env.
const app = defineApp({
  env: {
    AUTH_GITHUB_CLIENT_ID: v.string(),
    AUTH_GITHUB_CLIENT_SECRET: v.string(),
    R2_ACCOUNT_ID: v.string(),
    R2_ACCESS_KEY_ID: v.string(),
    R2_SECRET_ACCESS_KEY: v.string(),
    R2_BUCKET: v.string(),
  },
});

app.use(auth);
app.use(authGithub, {
  httpPrefix: "/oauth/github",
  env: {
    CLIENT_ID: app.env.AUTH_GITHUB_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GITHUB_CLIENT_SECRET,
  },
});
app.use(r2, {
  env: {
    R2_ACCOUNT_ID: app.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: app.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: app.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: app.env.R2_BUCKET,
  },
});

export default app;
