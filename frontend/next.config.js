// One env file for the whole stack: locally, the repo-root .env is loaded
// here too, so PUBLIC_API_URL (the ngrok URL the firmware also posts to) is
// the only line to change. On Vercel there is no root .env — set
// PUBLIC_API_URL (or NEXT_PUBLIC_API_URL) in the project's Environment
// Variables and redeploy; it is read at build time.
const path = require("path");
const { loadEnvConfig } = require("@next/env");

loadEnvConfig(path.resolve(__dirname, ".."));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          // Camera + location are used by the report form; nothing else.
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
