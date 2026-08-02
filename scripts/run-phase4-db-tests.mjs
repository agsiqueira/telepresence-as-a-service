import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

if (!process.env.PHASE3_TEST_DATABASE_URL || !process.env.PHASE4_TEST_DATABASE_URL) {
  console.error("Both Phase 3 and Phase 4 test database URLs are required; refusing to contact a database.");
  process.exit(2);
}
if (process.env.PHASE3_TEST_DATABASE_URL !== process.env.PHASE4_TEST_DATABASE_URL) {
  console.error("The Phase 3 and Phase 4 test database URLs must identify the same disposable database.");
  process.exit(2);
}
const env = { ...process.env, DATABASE_URL: process.env.PHASE3_TEST_DATABASE_URL };
const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"], { stdio: "inherit", env });
if (compile.error) throw compile.error;
if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const module of ["marketplace", "marketplace-vocabulary", "profiles", "capabilities", "phase3-services", "trip-lifecycle", "safety-restriction-lock", "safety-restrictions"]) {
  const path = `.phase3-test-build/lib/${module}.js`;
  writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', ""));
}
const aliasRoot = ".phase3-test-build/node_modules/@/lib";
mkdirSync(aliasRoot, { recursive: true });
for (const module of ["db", "current-user", "marketplace", "marketplace-vocabulary", "profiles", "capabilities", "phase3-services", "trip-lifecycle", "safety-restriction-lock", "safety-restrictions"]) {
  cpSync(`.phase3-test-build/lib/${module}.js`, `${aliasRoot}/${module}.js`);
}
const test = spawnSync(process.execPath, [".phase3-test-build/scripts/phase4-db-integration.js"], { stdio: "inherit", env });
if (test.error) throw test.error;
rmSync(".phase3-test-build", { recursive: true, force: true });
process.exit(test.status ?? 1);
