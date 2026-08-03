import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
if (!process.env.PHASE3_TEST_DATABASE_URL) { console.error("PHASE3_TEST_DATABASE_URL is required; refusing to contact a database."); process.exit(2); }
const env = { ...process.env, DATABASE_URL: process.env.PHASE3_TEST_DATABASE_URL };
const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit", env }); if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["marketplace", "profiles", "admin", "phase3-services", "trip-lifecycle", "safety-restriction-lock"]) { const path = `.phase3-test-build/lib/${module}.js`; writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', "")); }
const alias = ".phase3-test-build/node_modules/@/lib"; mkdirSync(alias, { recursive: true }); for (const module of ["marketplace", "marketplace-vocabulary", "profiles", "phase3-services", "trip-lifecycle", "safety-restriction-lock", "db"]) cpSync(`.phase3-test-build/lib/${module}.js`, `${alias}/${module}.js`);
const test = spawnSync(process.execPath, [".phase3-test-build/scripts/phase5b-db-integration.js"], { stdio: "inherit", env }); rmSync(".phase3-test-build", { recursive: true, force: true }); process.exit(test.status ?? 1);
