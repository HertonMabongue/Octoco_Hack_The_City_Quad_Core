// Runs `next <args>` with the repo-root .env loaded into the environment.
//
// Next only reads .env files from frontend/, so without this the server-side
// route handlers (e.g. /api/dusty's GEMINI_API_KEY, MUNICIPAL_USERNAME/
// PASSWORD) never see the one root .env that configures the whole stack.
// next.config.js also loads it, but only in the config process, not in the
// workers that run route handlers — so the variables must be in the
// environment *before* Next starts. Existing shell variables win.
//
// Used by `npm run dev` and `npm run start`. `next build` doesn't need it,
// and on Vercel there is no root .env: its dashboard variables apply.
const path = require("path");
const { spawn } = require("child_process");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(path.resolve(__dirname, "..", ".."), process.argv[2] === "dev");

const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
