// PM2 processes for production (docs/deployment_guide.md). Both read
// apps/api/.env (dotenv, from their working directory).
//   pm2 start ecosystem.config.cjs   — first time
//   pm2 restart ecosystem.config.cjs — every deploy
const path = require("node:path");
const api = path.join(__dirname, "apps/api");

module.exports = {
  apps: [
    {
      name: "kinnd-api",
      cwd: api,
      script: "dist/server.js",
      node_args: "-r dotenv/config",
      env: { NODE_ENV: "production" },
      max_memory_restart: "700M",
      time: true,
    },
    {
      // BullMQ jobs: media processing, push, reminders, renewals, reconciliation, daily purge.
      name: "kinnd-worker",
      cwd: api,
      script: "dist/worker.js",
      node_args: "-r dotenv/config",
      env: { NODE_ENV: "production" },
      max_memory_restart: "1200M",
      time: true,
    },
  ],
};
