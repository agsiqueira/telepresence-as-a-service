import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const phase3 = process.env.PHASE3_TEST_DATABASE_URL, phase4 = process.env.PHASE4_TEST_DATABASE_URL;
if (!phase3 || !phase4) throw new Error("Both test database URLs are required");
if (phase3 !== phase4) throw new Error("Test database URLs differ");
if (phase3 === process.env.DATABASE_URL) throw new Error("Disposable test database must differ from DATABASE_URL");
const env = { ...process.env, DATABASE_URL: phase3 };
const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit", env }); if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["agreements", "rescheduling", "trip-lifecycle", "journey-requests", "marketplace", "marketplace-vocabulary", "profiles", "safety-restriction-lock", "supply-foundation"]) { const path = `.phase3-test-build/lib/${module}.js`; writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', "")); }
const aliasRoot = ".phase3-test-build/node_modules/@/lib"; mkdirSync(aliasRoot, { recursive: true }); for (const module of ["agreements", "rescheduling", "trip-lifecycle", "journey-requests", "marketplace", "marketplace-vocabulary", "profiles", "safety-restriction-lock", "supply-foundation"]) cpSync(`.phase3-test-build/lib/${module}.js`, `${aliasRoot}/${module}.js`);
const test = spawnSync(process.execPath, [".phase3-test-build/scripts/phase5b-reschedule-db-integration.js"], { stdio: "inherit", env }); rmSync(".phase3-test-build", { recursive: true, force: true }); process.exit(test.status ?? 1);
