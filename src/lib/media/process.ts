export type CommandResult = {
  exitCode: number;
  stdout: Uint8Array;
  stderr: string;
};
export type CommandOptions = {
  cwd?: string;
  /** Bytes or text written to the child process standard input. */
  stdin?: string | Uint8Array;
  /** Descriptors inherited by the child as /dev/fd/3, /dev/fd/4, ... */
  inheritedDescriptors?: number[];
  /** Capability-bound argv used by the real process runner. */
  executionArgv?: string[];
  /** Stream child stdout directly into this retained descriptor. */
  stdoutDescriptor?: number;
  /** Compatibility alias for older callers. */
  readableDescriptors?: number[];
  onProgress?: (progress: { seconds?: number; complete?: boolean }) => void;
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
      options?.stdin === undefined ? "ignore" : "pipe",
      options?.stdoutDescriptor ?? "pipe",
      "pipe",
      ...descriptors,
    ],
  });
  if (options?.stdin !== undefined) {
    const stdin = child.stdin;
    if (!stdin) throw new Error("Child process stdin pipe is unavailable.");
    stdin.write(options.stdin);
    stdin.end();
  }
  const readStderr = async (): Promise<string> => {
    const reader = child.stderr.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let pending = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const value = decoder.decode(chunk.value, { stream: true });
      text += value;
      if (options?.onProgress) {
        pending += value;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) {
          const [key, rawValue] = line.split("=", 2);
          if (key === "out_time_ms" || key === "out_time_us") {
            const microseconds = Number(rawValue);
            if (Number.isFinite(microseconds)) options.onProgress({ seconds: microseconds / 1_000_000 });
          } else if (key === "progress" && rawValue === "end") {
            options.onProgress({ complete: true });
          }
        }
      }
    }
    return text;
  };
  const [stdout, stderr, exitCode] = await Promise.all([
    options?.stdoutDescriptor === undefined
      ? new Response(child.stdout as ReadableStream<Uint8Array>).bytes()
      : Promise.resolve(new Uint8Array()),
    readStderr(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

export const requireTool = (name: string, which = Bun.which): string => {
  const path = which(name);
  if (!path) throw new Error(`Required media tool "${name}" is not installed.`);
  return path;
};
