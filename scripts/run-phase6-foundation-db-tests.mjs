import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
const p3=process.env.PHASE3_TEST_DATABASE_URL,p4=process.env.PHASE4_TEST_DATABASE_URL,configured=process.env.DATABASE_URL;
if(!p3||!p4)throw new Error("Both disposable test database URLs are required");
const a=new URL(p3),b=new URL(p4),same=a.hostname===b.hostname&&a.port===b.port&&a.pathname===b.pathname;
if(!same)throw new Error("Disposable test database URLs must identify the same database");
if(configured){const c=new URL(configured);if(a.hostname===c.hostname&&a.port===c.port&&a.pathname===c.pathname)throw new Error("Disposable test database must differ from DATABASE_URL");}
console.log(`SAFE disposable database host=${a.hostname} database=${decodeURIComponent(a.pathname.slice(1))}`);
for(const value of[p3,p4]){const client=new PrismaClient({datasources:{db:{url:value}}});try{await client.$queryRawUnsafe("SELECT 1");}finally{await client.$disconnect();}}
const env={...process.env,DATABASE_URL:p3},build=".phase6-foundation-test-build";
try{
 for(const [command,args] of [["node_modules/prisma/build/index.js",["migrate","deploy"]],["node_modules/typescript/bin/tsc",["-p","scripts/tsconfig.phase6-foundation-db.json"]]]){const run=spawnSync(process.execPath,[command,...args],{stdio:"inherit",env});if(run.status!==0)process.exit(run.status??1)}
 const test=spawnSync(process.execPath,[`${build}/scripts/phase6-foundation-db-integration.js`],{stdio:"inherit",env});process.exitCode=test.status??1;
}finally{rmSync(build,{recursive:true,force:true})}
