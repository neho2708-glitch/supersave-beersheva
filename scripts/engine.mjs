// Runs a data-engine command with whichever Python this machine has, from the right folder.
//   node scripts/engine.mjs import --all     |  node scripts/engine.mjs --pytest
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const engineDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data-engine");
const candidates = process.env.PYTHON_BIN ? [process.env.PYTHON_BIN] : process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
const args = process.argv.slice(2);
const command = args[0] === "--pytest" ? ["-m", "pytest", "tests", "-q", ...args.slice(1)] : ["-m", "supersave_engine.cli", ...args];

for (const python of candidates) {
  const result = spawnSync(python, command, { cwd: engineDir, stdio: "inherit" });
  if (!result.error) process.exit(result.status ?? 1);
}
console.error("Python was not found. Install Python 3.11+ or set PYTHON_BIN.");
process.exit(1);
