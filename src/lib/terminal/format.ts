export type TerminalStyleOptions = { color?: boolean };
export type SummaryMarker = "success" | "warning" | "error" | "info";

const ansi = {
  reset: "\u001b[0m", dim: "\u001b[2m", bold: "\u001b[1m",
  cyan: "\u001b[36m", green: "\u001b[32m", yellow: "\u001b[33m",
  red: "\u001b[31m", blue: "\u001b[34m",
};

const paint = (value: string, code: string, color: boolean): string =>
  color ? `${code}${value}${ansi.reset}` : value;

export const terminalColorEnabled = (): boolean =>
  Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;

export const terminalInteractive = (plain = false): boolean =>
  !plain && Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.CI === undefined && process.env.TERM !== "dumb";

export const extractTerminalOptions = (argv: string[]): { args: string[]; plain: boolean } => {
  let plain = false;
  const args: string[] = [];
  for (const argument of argv) {
    if (argument === "--plain") {
      if (plain) throw new Error("--plain may only be specified once");
      plain = true;
    } else {
      args.push(argument);
    }
  }
  return { args, plain };
};

export const formatCommandHeader = (
  scope: string,
  command: string,
  options: TerminalStyleOptions = {},
): string => {
  const color = options.color ?? terminalColorEnabled();
  return `${paint("◆", ansi.cyan, color)} ${paint(scope, ansi.bold, color)} ${paint(command, ansi.dim, color)}`;
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    value /= 1024;
    unit = next;
    if (value < 1024 || next === units.at(-1)) break;
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision).replace(/(?:\.0+|(?<=\.[0-9])0+)$/, "")} ${unit}`;
};

export const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m ${seconds}s`;
  }
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
};

const markerFor = (marker: SummaryMarker): [string, string] => {
  switch (marker) {
    case "success": return ["✓", ansi.green];
    case "warning": return ["!", ansi.yellow];
    case "error": return ["✗", ansi.red];
    case "info": return ["·", ansi.blue];
  }
};

export const formatSummary = (
  entries: Array<[label: string, value: string | number]>,
  options: TerminalStyleOptions & { marker?: SummaryMarker } = {},
): string => {
  const color = options.color ?? terminalColorEnabled();
  const width = Math.max(...entries.map(([label]) => label.length), 0);
  const prefix = options.marker ? `${paint(...markerFor(options.marker), color)} ` : "  ";
  return entries.map(([label, value], index) => {
    const linePrefix = index === 0 ? prefix : "  ";
    return `${linePrefix}${paint(label.padEnd(width), ansi.dim, color)}  ${value}`;
  }).join("\n");
};

export const formatStatus = (
  message: string,
  marker: SummaryMarker = "info",
  options: TerminalStyleOptions = {},
): string => {
  const color = options.color ?? terminalColorEnabled();
  const [symbol, code] = markerFor(marker);
  return `${paint(symbol, code, color)} ${message}`;
};
