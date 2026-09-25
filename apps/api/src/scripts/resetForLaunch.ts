// D8 (subscription model): at launch, every existing user and their data is
// removed except one account (charlie@wurk.dk by default). That account
// keeps its data and gets a Circle for its children. Dry run by default:
//
//   npm run reset:launch --workspace=apps/api                      # report only
//   npm run reset:launch --workspace=apps/api -- --confirm         # do it
//   npm run reset:launch --workspace=apps/api -- --keep someone@example.com --confirm
//
// Take a database and media backup first (docs/deployment_guide.md). The
// QuickPay subscriptions of removed users are cancelled before anything is
// deleted, so nobody is charged afterwards. Rows referencing removed users
// are found through Postgres's own foreign-key catalog: nullable references
// are cleared, required ones deleted (recursively), so nothing is left
// dangling. Media files of removed rows are deleted from storage too.
/* eslint-disable no-console */
import { prisma } from "../db";
import { resetForLaunch } from "../lib/launchReset";

const confirm = process.argv.includes("--confirm");
const i = process.argv.indexOf("--keep");
const keepEmail = i >= 0 ? process.argv[i + 1] : "charlie@wurk.dk";

resetForLaunch({ keepEmail, confirm, log: (line) => console.log(line) })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
