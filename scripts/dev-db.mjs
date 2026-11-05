// Starts a real local PostgreSQL for development, with no Docker or system install.
// Binaries come from the embedded-postgres npm package. Data lives in .pgdata/ (git-ignored).
//
//   node scripts/dev-db.mjs          start and wait, Ctrl-C stops
//   node scripts/dev-db.mjs --detach start and exit, server keeps running
//   node scripts/dev-db.mjs --stop   stop the server
//
// Listens on localhost only and uses trust auth, so it is for local development only.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = "54329";
const dataDir = join(root, ".pgdata");
const exe = process.platform === "win32" ? ".exe" : "";

function binaries() {
  const pkg = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
  const native = join(root, "node_modules", "@embedded-postgres", pkg, "native");
  if (!existsSync(native)) throw new Error(`No embedded PostgreSQL for ${pkg}. Run npm install.`);
  // Windows tools fail once a path passes 260 characters, so deep checkouts use a short copy.
  if (process.platform === "win32" && native.length > 150) {
    const short = join(homedir(), ".supersave-pg");
    if (!existsSync(join(short, "bin", `initdb${exe}`))) {
      mkdirSync(short, { recursive: true });
      execFileSync("robocopy", [native, short, "/E", "/NFL", "/NDL", "/NJH", "/NJS", "/R:1", "/W:1"], {
        stdio: "ignore",
        // robocopy returns 1 for "files copied", which is success.
      }).toString?.();
    }
    return join(short, "bin");
  }
  return join(native, "bin");
}

function run(bin, tool, args) {
  return spawnSync(join(bin, `${tool}${exe}`), args, { encoding: "utf8", stdio: "pipe", windowsHide: true });
}

let bin;
try {
  bin = binaries();
} catch (error) {
  // robocopy's success code 1 surfaces as an exception from execFileSync.
  if (error.status === 1) bin = join(homedir(), ".supersave-pg", "bin");
  else throw error;
}

if (process.argv.includes("--stop")) {
  const stopped = run(bin, "pg_ctl", ["stop", "-D", dataDir, "-m", "fast"]);
  console.log(stopped.stdout || stopped.stderr);
  process.exit(stopped.status ?? 0);
}

const fresh = !existsSync(join(dataDir, "PG_VERSION"));
if (fresh) {
  const init = run(bin, "initdb", ["-D", dataDir, "-U", "supersave", "--auth=trust", "--encoding=UTF8", "--locale=C"]);
  if (init.status !== 0) throw new Error(init.stderr);
}

const start = spawnSync(
  join(bin, `pg_ctl${exe}`),
  ["start", "-D", dataDir, "-w", "-l", join(dataDir, "server.log"), "-o", `-p ${PORT} -c listen_addresses=localhost`],
  { stdio: "ignore", windowsHide: true, timeout: 60000 },
);
if (start.status !== 0 && start.status !== null) {
  console.log("pg_ctl did not report a clean start; see .pgdata/server.log (it may already be running).");
}

if (fresh) {
  const created = run(bin, "createdb", ["-h", "localhost", "-p", PORT, "-U", "supersave", "supersave"]);
  if (created.status !== 0) console.error(created.stderr);
}
console.log(`PostgreSQL ready on port ${PORT}`);

if (!process.argv.includes("--detach")) {
  const stop = () => {
    run(bin, "pg_ctl", ["stop", "-D", dataDir, "-m", "fast"]);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => {}, 1 << 30);
}
