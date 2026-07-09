// =====================================================================
// WearWise — Engine v2 golden-test runner (esbuild-free).
// Compiles the pure engine subset with the TypeScript compiler (pure JS),
// rewrites the "@/" path alias in the emitted CommonJS to absolute paths,
// then runs the golden tests under Node. Works in the Linux sandbox where
// esbuild/tsx/next cannot run.
// On Windows you can instead run: npx tsx tests/engine/golden.test.ts
// =====================================================================
import { execSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, statSync, rmSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.cwd();
// Emit OUTSIDE the workspace so no build artifacts land in the user's folder.
const outDir = mkdtempSync(join(tmpdir(), "ww-engine-test-"));

console.log("• compiling engine subset with tsc (emit → temp)…");
execSync(`node node_modules/typescript/bin/tsc -p tsconfig.test.json --outDir "${outDir}"`, { stdio: "inherit" });

const srcAbs = join(outDir, "src");
function walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".js")) {
      let c = readFileSync(full, "utf8");
      c = c.replace(/require\("@\/([^"]+)"\)/g, (_m, p) => `require(${JSON.stringify(join(srcAbs, p))})`);
      writeFileSync(full, c);
    }
  }
}
walk(outDir);

console.log("• running golden tests…\n");
// Run every compiled engine test suite (golden + laundry + any future *.test.js).
const testDir = join(outDir, "tests", "engine");
const suites = readdirSync(testDir).filter((f) => f.endsWith(".test.js")).sort();
let exitCode = 0;
for (const suite of suites) {
  console.log(`\n=== ${suite} ===`);
  const res = spawnSync("node", [join(testDir, suite)], { stdio: "inherit" });
  if ((res.status ?? 1) !== 0) exitCode = res.status ?? 1;
}
rmSync(outDir, { recursive: true, force: true });
process.exit(exitCode);
