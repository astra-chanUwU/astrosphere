export type CommandResult = { exitCode: number; stdout: Uint8Array; stderr: string };
export type CommandRunner = (argv: string[], options?: { cwd?: string }) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (argv, options) => {
  const child = Bun.spawn(argv, { cwd: options?.cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).bytes(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

export const requireTool = (name: string, which = Bun.which): string => {
  const path = which(name);
  if (!path) throw new Error(`Required media tool "${name}" is not installed.`);
  return path;
};
