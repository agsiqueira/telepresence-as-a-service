import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const p3 = process.env.PHASE3_TEST_DATABASE_URL, p4 = process.env.PHASE4_TEST_DATABASE_URL, configured = process.env.DATABASE_URL;
if (!p3 || !p4) throw new Error("Both disposable test database URLs are required");
const first = new URL(p3), second = new URL(p4);
if (first.hostname !== second.hostname || first.port !== second.port || first.pathname !== second.pathname) throw new Error("Test targets differ");
if (configured) { const production = new URL(configured); if (first.hostname === production.hostname && first.port === production.port && first.pathname === production.pathname) throw new Error("Test target must differ from DATABASE_URL"); }
console.log(`SAFE disposable database host=${first.hostname} database=${decodeURIComponent(first.pathname.slice(1))}`);
for (const value of [p3, p4]) { const db = new PrismaClient({ datasources: { db: { url: value } } }); try { await db.$queryRawUnsafe("SELECT 1"); } finally { await db.$disconnect(); } }
const env = { ...process.env, DATABASE_URL: p3 }, out = ".phase6a-test-build";
try {
  for (const [command, args] of [["node_modules/prisma/build/index.js", ["migrate", "deploy"]], ["node_modules/typescript/bin/tsc", ["-p", "scripts/tsconfig.phase6a-db.json"]]]) {
    const result = spawnSync(process.execPath, [command, ...args], { stdio: "inherit", env });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const modules = ["agreements", "live-moments", "marketplace", "marketplace-vocabulary", "profiles", "safety-restriction-lock", "supply-foundation", "trip-lifecycle"];
  for (const module of modules) {
    const path = `${out}/lib/${module}.js`;
    writeFileSync(path, readFileSync(path, "utf8").replace('require("server-only");', ""));
  }
  const alias = `${out}/node_modules/@/lib`; mkdirSync(alias, { recursive: true });
  for (const module of modules) cpSync(`${out}/lib/${module}.js`, `${alias}/${module}.js`);
  const result = spawnSync(process.execPath, [`${out}/scripts/phase6a-db-integration.js`], { stdio: "inherit", env });
  process.exitCode = result.status ?? 1;
} finally { rmSync(out, { recursive: true, force: true }); }
