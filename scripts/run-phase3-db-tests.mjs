import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

if (!process.env.PHASE3_TEST_DATABASE_URL) {
  console.error("PHASE3_TEST_DATABASE_URL is required; refusing to contact a database.");
  process.exit(2);
}

const env = { ...process.env, DATABASE_URL: process.env.PHASE3_TEST_DATABASE_URL };
const compile = spawnSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "scripts/tsconfig.phase3-db.json"],
  { stdio: "inherit", env }
);
if (compile.error) throw compile.error;
if (compile.status !== 0) process.exit(compile.status ?? 1);
for (const compiledServerModule of [".phase3-test-build/lib/marketplace.js", ".phase3-test-build/lib/phase3-services.js"]) {
  writeFileSync(compiledServerModule, readFileSync(compiledServerModule, "utf8").replace('require("server-only");', ""));
}
const test = spawnSync(process.execPath, [".phase3-test-build/scripts/phase3-db-integration.js"], {
  stdio: "inherit",
  env,
});
if (test.error) throw test.error;
rmSync(".phase3-test-build", { recursive: true, force: true });
process.exit(test.status ?? 1);
