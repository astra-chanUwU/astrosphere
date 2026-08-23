import { MediaError } from "./errors";

export type MediaCommand = "serve" | "optimize" | "validate" | "sync";

export const mediaHelp = `Usage:
  bun run media:serve
  bun run media:optimize ...
  bun run media:validate
  bun run media:sync ...`;

const commands: MediaCommand[] = ["serve", "optimize", "validate", "sync"];

export const parseMediaCommand = (argv: string[]): { command: MediaCommand; args: string[] } => {
  const [supplied, ...args] = argv;
  if (!supplied || !commands.includes(supplied as MediaCommand)) {
    throw new MediaError("usage", supplied ? `Unknown media command: ${supplied}` : mediaHelp);
  }
  return { command: supplied as MediaCommand, args };
};
