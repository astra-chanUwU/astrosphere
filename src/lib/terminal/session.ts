import { MediaProgress } from "./progress";
import { formatCommandHeader, formatDuration, formatStatus, formatSummary, terminalInteractive, type SummaryMarker } from "./format";

export type TerminalSessionOptions = {
  scope: string;
  command: string;
  plain?: boolean;
  output?: (text: string) => void;
  errorOutput?: (text: string) => void;
  now?: () => number;
  isTTY?: boolean;
};

export class TerminalSession {
  private readonly output: (text: string) => void;
  private readonly now: () => number;
  private readonly errorOutput: (text: string) => void;
  private readonly interactive: boolean;
  private readonly startedAt: number;
  private activeProgress: MediaProgress | undefined;

  public constructor(private readonly options: TerminalSessionOptions) {
    this.output = options.output ?? ((text) => process.stdout.write(text));
    this.errorOutput = options.errorOutput ?? this.output;
    this.now = options.now ?? Date.now;
    this.interactive = options.isTTY ?? terminalInteractive(options.plain);
    this.startedAt = this.now();
  }

  public start(options: { title?: string } = {}): void {
    this.line(formatCommandHeader(this.options.scope, this.options.command, { color: this.interactive }));
    if (options.title) this.line(`  ${options.title}`);
  }

  public phase(name: string): void {
    this.progress().start(name, 1);
  }

  public phaseDone(detail = "complete"): void {
    if (!this.activeProgress) return;
    this.activeProgress.finish(detail);
    this.activeProgress = undefined;
  }

  public progress(): MediaProgress {
    this.disposeProgress();
    this.activeProgress = new MediaProgress({ output: this.output, isTTY: this.interactive, now: this.now });
    return this.activeProgress;
  }

  public status(message: string, marker: SummaryMarker = "info"): void {
    this.disposeProgress();
    this.line(formatStatus(message, marker, { color: this.interactive }));
  }

  public summary(entries: Array<[string, string | number]>, marker?: SummaryMarker): void {
    this.line(formatSummary(entries, { color: this.interactive, ...(marker ? { marker } : {}) }));
  }

  public complete(message: string, entries: Array<[string, string | number]> = []): void {
    this.disposeProgress();
    this.line(formatStatus(message, "success", { color: this.interactive }));
    if (entries.length > 0) this.summary(entries);
    this.line(`  Elapsed ${formatDuration(this.now() - this.startedAt)}`);
  }

  public fail(message: string): void {
    this.disposeProgress();
    this.errorOutput(`${formatStatus(`${message} · elapsed ${formatDuration(this.now() - this.startedAt)}`, "error", { color: this.interactive })}\n`);
  }

  public dispose(): void { this.disposeProgress(); }

  private disposeProgress(): void {
    this.activeProgress?.dispose();
    this.activeProgress = undefined;
  }

  private line(text: string): void { this.output(`${text}\n`); }
}
