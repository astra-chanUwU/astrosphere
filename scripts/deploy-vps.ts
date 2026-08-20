import { cp, mkdir, readdir, rename, rm, statfs, symlink } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { getDeploymentCommands, getVpsLayout } from "../src/lib/vps-operations";

const layout = getVpsLayout(Bun.env.ASTROSPHERE_ROOT ?? "/srv/astrosphere");
if (resolve(process.cwd()) !== layout.app) {
  throw new Error(`Run deploy:vps from ${layout.app}.`);
}

const filesystem = await statfs(layout.root);
const freeBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
if (freeBytes < 2 * 1024 ** 3) {
  throw new Error("Deployment requires at least 2 GiB of free disk space.");
}

const run = async (command: string[]) => {
  console.log(`> ${command.join(" ")}`);
  const child = Bun.spawn(command, {
    cwd: layout.app,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}.`);
};

for (const command of getDeploymentCommands()) await run(command);

await mkdir(layout.releases, { recursive: true });
const releaseName = new Date().toISOString().replace(/[:.]/g, "-");
const release = resolve(layout.releases, releaseName);
await cp(resolve(layout.app, "dist"), release, { recursive: true, errorOnExist: true });

const nextSite = `${layout.site}.next`;
await rm(nextSite, { force: true });
await symlink(release, nextSite);
await rename(nextSite, layout.site);

const releases = (await readdir(layout.releases, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

for (const oldRelease of releases.slice(0, -3)) {
  const path = resolve(layout.releases, oldRelease);
  if (basename(path) !== oldRelease) throw new Error(`Unsafe release path: ${oldRelease}`);
  await rm(path, { recursive: true });
}

console.log(`Active release: ${release}`);
