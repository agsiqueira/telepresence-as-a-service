import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
const p3=process.env.PHASE3_TEST_DATABASE_URL,p4=process.env.PHASE4_TEST_DATABASE_URL;
if(!p3||!p4)throw new Error("Both disposable test database URLs are required");
if(p3!==p4)throw new Error("Disposable test database URLs must identify the same database");
const configured=(readFileSync(".env","utf8").split(/\r?\n/).find(v=>/^DATABASE_URL\s*=/.test(v))||"").replace(/^DATABASE_URL\s*=\s*/,"").trim().replace(/^['\"]|['\"]$/g,"");
if(!configured||p3===configured)throw new Error("Disposable test database must differ from DATABASE_URL");
const identity=new URL(p3);console.log(`SAFE disposable database host=${identity.hostname} database=${identity.pathname.slice(1)}`);
const env={...process.env,DATABASE_URL:p3},build=".phase5f-test-build";
try{
 for(const [command,args] of [["node_modules/prisma/build/index.js",["migrate","deploy"]],["node_modules/typescript/bin/tsc",["-p","scripts/tsconfig.phase5f-db.json"]]]){const run=spawnSync(process.execPath,[command,...args],{stdio:"inherit",env});if(run.status!==0)process.exit(run.status??1)}
 const modules=["simulated-tips","profiles","safety-restriction-lock","marketplace","marketplace-vocabulary"];
 for(const module of modules){const path=`${build}/lib/${module}.js`;writeFileSync(path,readFileSync(path,"utf8").replace('require("server-only");',""))}
 const alias=`${build}/node_modules/@/lib`;mkdirSync(alias,{recursive:true});for(const module of modules)cpSync(`${build}/lib/${module}.js`,`${alias}/${module}.js`);
 const test=spawnSync(process.execPath,[`${build}/scripts/phase5f-db-integration.js`],{stdio:"inherit",env});process.exitCode=test.status??1;
}finally{rmSync(build,{recursive:true,force:true})}
