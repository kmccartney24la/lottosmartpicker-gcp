import { spawn } from "node:child_process";

type RunResult = { name: string; code: number | null };

function run(cmd: string, args: string[], name: string): Promise<RunResult> {
  return new Promise((resolve) => {
    // Use shell so Windows can find tsx.cmd via npx
    const p = spawn(cmd, args, { stdio: "inherit", env: process.env, shell: true });
    p.on("close", (code) => resolve({ name, code }));
    p.on("error", () => resolve({ name, code: 1 }));
  });
}

function passThroughFlags(): string[] {
  // Pass selected flags through to the child scrapers.
  // Handles forms: "--concurrency 4", "--concurrency=4", "-c 4"
  const args = process.argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // simple boolean flags we support
    if (a === "--dry-run" || a === "--seed" || a === "--rehost-all" || a === "--only-missing") {
      out.push(a);
      continue;
    }
    if (a.startsWith("--concurrency=")) {
      out.push(a);
      continue;
    }
    if (a === "--concurrency" || a === "-c") {
      const val = args[i + 1];
      if (val && !val.startsWith("-")) {
        out.push(a, val);
        i++;
      } else {
        // default to 4 if value missing
        out.push("--concurrency", "4");
      }
      continue;
    }
  }
  return out;
}

async function main() {
  const flags = passThroughFlags();

  console.log(`[orchestrator] starting (flags: ${flags.join(" ") || "(none)"} )`);
  console.log(
    `[orchestrator] storage: ${
      process.env.PUBLIC_BASE_URL ? "PUBLIC_BASE_URL=" + process.env.PUBLIC_BASE_URL : "FS mode"
    }; provider banner will follow...`
  );

  // Use "npx tsx" so it works cross-platform (Windows needs .cmd shims)
  const ga = await run("npx", ["tsx", "scripts/scratchers/fetch_ga_scratchers.ts", ...flags], "GA");
  const ny = await run("npx", ["tsx", "scripts/scratchers/fetch_ny_scratchers.ts", ...flags], "NY");
  const fl = await run("npx", ["tsx", "scripts/scratchers/fetch_fl_scratchers.ts", ...flags], "FL");
  const ca = await run("npx", ["tsx", "scripts/scratchers/fetch_ca_scratchers.ts", ...flags], "CA"); // <-- NEW

  console.log(`[orchestrator] results: GA=${ga.code} NY=${ny.code} FL=${fl.code} CA=${ca.code}`);

  const hardFail =
    (ga.code ?? 1) !== 0 ||
    (ny.code ?? 1) !== 0 ||
    (fl.code ?? 1) !== 0 ||
    (ca.code ?? 1) !== 0; // <-- NEW
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
