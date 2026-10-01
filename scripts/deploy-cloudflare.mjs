import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const WORKER_NAME = "decrypto-cn";
const DATABASE_NAME = "decrypto-cn-apac";
const DATABASE_ID = "70e9a11a-92f2-495d-8646-82b16c819bfa";
const CONFIG = "dist/server/wrangler.json";

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "build"]);

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
config.name = WORKER_NAME;
config.topLevelName = WORKER_NAME;
config.workers_dev = false;
config.routes = [{ pattern: "game.chemisgreat.online", custom_domain: true }];
config.d1_databases = [{ binding: "DB", database_name: DATABASE_NAME, database_id: DATABASE_ID, migrations_dir: "../../drizzle" }];
writeFileSync(CONFIG, JSON.stringify(config));

run("npx", ["wrangler", "d1", "migrations", "apply", DATABASE_NAME, "--remote", "--config", CONFIG]);
run("npx", ["wrangler", "deploy", "--config", CONFIG]);
