import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

if (!process.env.PHASE3_TEST_DATABASE_URL || !process.env.PHASE4_TEST_DATABASE_URL) throw new Error("Both test database URLs are required");
if (process.env.PHASE3_TEST_DATABASE_URL !== process.env.PHASE4_TEST_DATABASE_URL) throw new Error("Test database URLs differ");
const env = { ...process.env, DATABASE_URL: process.env.PHASE3_TEST_DATABASE_URL };
const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit", env });
if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["agreements", "proposals", "journey-requests", "marketplace", "marketplace-vocabulary", "profiles"]) {
  const path = `.phase3-test-build/lib/${module}.js`;
  writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', ""));
}
const aliasRoot = ".phase3-test-build/node_modules/@/lib";
mkdirSync(aliasRoot, { recursive: true });
for (const module of ["agreements", "proposals", "journey-requests", "marketplace", "marketplace-vocabulary", "profiles"]) cpSync(`.phase3-test-build/lib/${module}.js`, `${aliasRoot}/${module}.js`);
const test = spawnSync(process.execPath, [".phase3-test-build/scripts/phase34-db-concurrency.js"], { stdio: "inherit", env });
rmSync(".phase3-test-build", { recursive: true, force: true });
process.exit(test.status ?? 1);
