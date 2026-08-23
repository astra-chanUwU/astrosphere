export type CommandResult = {
  exitCode: number;
  stdout: Uint8Array;
  stderr: string;
};
export type CommandOptions = {
  cwd?: string;
  /** Descriptors inherited by the child as /dev/fd/3, /dev/fd/4, ... */
  inheritedDescriptors?: number[];
  /** Capability-bound argv used by the real process runner. */
  executionArgv?: string[];
  /** Stream child stdout directly into this retained descriptor. */
  stdoutDescriptor?: number;
  /** Compatibility alias for older callers. */
  readableDescriptors?: number[];
};
export type CommandRunner = (
  argv: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (argv, options) => {
  const descriptors =
    options?.inheritedDescriptors ?? options?.readableDescriptors ?? [];
  const child = Bun.spawn(options?.executionArgv ?? argv, {
    cwd: options?.cwd,
    stdio: [
      "ignore",
      options?.stdoutDescriptor ?? "pipe",
      "pipe",
      ...descriptors,
    ],
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    options?.stdoutDescriptor === undefined
      ? new Response(child.stdout as ReadableStream<Uint8Array>).bytes()
      : Promise.resolve(new Uint8Array()),
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
