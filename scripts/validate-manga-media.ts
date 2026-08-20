import { resolve } from "node:path";

const child = Bun.spawn(["bun", "run", "build"], {
  cwd: resolve(import.meta.dir, ".."),
  env: { ...process.env, MANGA_VALIDATE_EXTERNAL: "1", IMAGE_SET_VALIDATE_EXTERNAL: "1" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exit(await child.exited);
