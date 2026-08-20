import { access } from "node:fs/promises";
import { createMangaSyncCommand } from "../src/lib/vps-operations";

const source = Bun.env.MANGA_MEDIA_ROOT ?? "";
const target = Bun.env.VPS_MEDIA_TARGET ?? "";
const command = createMangaSyncCommand({ source, target, dryRun: Bun.argv.includes("--dry-run") });

try {
  await access(source);
} catch {
  throw new Error(`MANGA_MEDIA_ROOT does not exist or is unreadable: ${source}`);
}

console.log(`Manga sync: ${source} -> ${target}`);
const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
