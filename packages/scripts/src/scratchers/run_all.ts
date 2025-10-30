// packages\scripts\src\scratchers\run_all.ts
import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

type RunResult = { name: string; code: number | null };

function run(cmd: string, args: string[], name: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: process.env, shell: true });
    p.on("close", (code) => resolve({ name, code }));
    p.on("error", () => resolve({ name, code: 1 }));
  });
}

function passThroughFlags(): string[] {
  const args = process.argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--dry-run" || a === "--seed" || a === "--rehost-all" || a === "--only-missing") {
      out.push(a); continue;
    }
    if (a.startsWith("--concurrency=")) { out.push(a); continue; }
    if (a === "--concurrency" || a === "-c") {
      const val = args[i + 1];
      out.push("--concurrency", (val && !val.startsWith("-")) ? (i++, val) : "4");
    }
  }
  return out;
}

// Resolve a sibling script next to this file and decide how to execute it
function resolveScript(baseName: string): { cmd: string; args: string[] } {
  const here = path.dirname(fileURLToPath(import.meta.url)); // ESM-safe __dirname
  const jsPath = path.join(here, `${baseName}.js`);
  const tsPath = path.join(here, `${baseName}.ts`);

  if (fs.existsSync(jsPath)) {
    // Dist/prod: run compiled JS with Node
    return { cmd: process.execPath, args: [jsPath] };
  }
  if (fs.existsSync(tsPath)) {
    // Dev: run TS with tsx
    return { cmd: "npx", args: ["tsx", tsPath] };
  }
  throw new Error(`Cannot locate ${baseName}.js or ${baseName}.ts in ${here}`);
}

async function main() {
  const flags = passThroughFlags();

  console.log(`[orchestrator] starting (flags: ${flags.join(" ") || "(none)"} )`);
  console.log(
    `[orchestrator] storage: ${
      process.env.PUBLIC_BASE_URL ? "PUBLIC_BASE_URL=" + process.env.PUBLIC_BASE_URL : "FS mode"
    }; provider banner will follow...`
  );

  const ga = resolveScript("fetch_ga_scratchers");
  const ny = resolveScript("fetch_ny_scratchers");
  const fl = resolveScript("fetch_fl_scratchers");
  const ca = resolveScript("fetch_ca_scratchers");
  const tx = resolveScript("fetch_tx_scratchers");

  const rGA = await run(ga.cmd, [...ga.args, ...flags], "GA");
  const rNY = await run(ny.cmd, [...ny.args, ...flags], "NY");
  const rFL = await run(fl.cmd, [...fl.args, ...flags], "FL");
  const rCA = await run(ca.cmd, [...ca.args, ...flags], "CA");
  const rTX = await run(tx.cmd, [...tx.args, ...flags], "TX");

  console.log(
    `[orchestrator] results: GA=${rGA.code} NY=${rNY.code} FL=${rFL.code} CA=${rCA.code} TX=${rTX.code}`
  );

  const hardFail =
    (rGA.code ?? 1) !== 0 || (rNY.code ?? 1) !== 0 || (rFL.code ?? 1) !== 0 || (rCA.code ?? 1) !== 0 || (rTX.code ?? 1) !== 0;
  if (hardFail) {
    console.error("[orchestrator] one or more scrapers failed");
    process.exit(1);
  }

  console.log("[orchestrator] done");
}

main().catch((e) => {
  console.error("[orchestrator] fatal:", e);
  process.exit(1);
});
