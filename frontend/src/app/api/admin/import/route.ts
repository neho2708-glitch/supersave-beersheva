import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { clearSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";

const CHAINS = ["shufersal", "rami-levy", "carrefour", "yochananof", "victory", "osher-ad", "mahsanei-hashuk"];
const UNAVAILABLE = "לא ניתן להפעיל את מנוע הנתונים בשרת זה";

/** The server may be started from the repository root or from frontend/. */
function findEngineDir(): string | null {
  const candidates = [join(process.cwd(), "data-engine"), join(process.cwd(), "..", "data-engine")];
  return candidates.find((dir) => existsSync(join(dir, "supersave_engine"))) ?? null;
}

/** Starts an import in the background. Protected by the middleware. Needs a host with Python. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { chain?: string; action?: string };
  const engineDir = findEngineDir();
  if (!engineDir) return NextResponse.json({ started: false, error: UNAVAILABLE }, { status: 500 });

  const python = process.env.PYTHON_BIN || "python3";
  const args = ["-m", "supersave_engine.cli"];
  if (body.action === "verify") {
    args.push("verify");
  } else {
    args.push("import", "--trigger", "admin");
    if (body.chain && CHAINS.includes(body.chain)) args.push("--chain", body.chain);
    else args.push("--all");
  }

  // Answer only after the process really started: a missing Python arrives as an "error" event.
  const started = await new Promise<boolean>((resolve) => {
    try {
      // Kept in a git-ignored file so a crash of the background process can be diagnosed.
      const logPath = join(engineDir, "admin-import.log");
      const log = openSync(logPath, "a");
      // On Windows a detached child gets its own console, and a Ctrl-C event there ended long imports.
      const child = spawn(python, args, {
        cwd: engineDir,
        detached: process.platform !== "win32",
        stdio: ["ignore", log, log],
        windowsHide: true,
      });
      closeSync(log);
      child.once("error", () => resolve(false));
      child.once("spawn", () => resolve(true));
      child.on("exit", (code, signal) => {
        appendFileSync(logPath, `[${new Date().toISOString()}] ${args.slice(2).join(" ")} exited: code=${code} signal=${signal}\n`);
        clearSnapshot();
      });
      child.unref();
    } catch {
      resolve(false);
    }
  });
  if (!started) return NextResponse.json({ started: false, error: UNAVAILABLE }, { status: 500 });
  return NextResponse.json({ started: true, command: args.slice(2).join(" ") });
}
