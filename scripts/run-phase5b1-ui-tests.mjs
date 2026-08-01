import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
const out = ".phase5b1-ui-build";
const compile = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "lib/rescheduling-ui.ts", "scripts/phase5b1-ui-behavior.ts", "--module", "commonjs", "--target", "ES2022", "--moduleResolution", "node", "--esModuleInterop", "--strict", "--skipLibCheck", "--outDir", out], { stdio: "inherit" });
if (compile.status !== 0) process.exit(compile.status ?? 1);
const test = spawnSync(process.execPath, [`${out}/scripts/phase5b1-ui-behavior.js`], { stdio: "inherit" });
rmSync(out, { recursive: true, force: true });
process.exit(test.status ?? 1);
