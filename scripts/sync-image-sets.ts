import { access } from "node:fs/promises";
import { createImageSetSyncCommand } from "../src/lib/vps-operations";

const source = Bun.env.IMAGE_SET_MEDIA_ROOT ?? "";
const target = Bun.env.VPS_IMAGE_SET_TARGET ?? "";
const command = createImageSetSyncCommand({ source, target, dryRun: Bun.argv.includes("--dry-run") });

try {
  await access(source);
} catch {
  throw new Error(`IMAGE_SET_MEDIA_ROOT does not exist or is unreadable: ${source}`);
}

console.log(`Image-set sync: ${source} -> ${target}`);
const child = Bun.spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
process.exit(await child.exited);
