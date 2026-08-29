import { formatDuration } from "./format";

const orbitFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const asciiFrames = ["-", "\\", "|", "/"];

export const formatProgressBar = (completed: number, total: number, width = 24, unicode = true): string => {
  const safeTotal = Math.max(1, total);
  const ratio = Math.max(0, Math.min(1, completed / safeTotal));
  const filledWidth = Math.round(ratio * width);
  const filled = unicode ? "█" : "#";
  const empty = unicode ? "░" : "-";
  return `[${filled.repeat(filledWidth)}${empty.repeat(width - filledWidth)}] ${Math.round(ratio * 100)}%`;
};

export type MediaProgressUpdate = {
  current?: string;
  completed: number;
  detail?: string;
  filePercent?: number;
  processedSeconds?: number;
};

export type MediaProgressOptions = {
  output?: (text: string) => void;
  isTTY?: boolean;
  animate?: boolean;
  now?: () => number;
  columns?: number;
  unicode?: boolean;
};

export class MediaProgress {
  private readonly output: (text: string) => void;
  private readonly isTTY: boolean;
  private readonly animate: boolean;
  private readonly now: () => number;
  private readonly columns: number;
  private readonly unicode: boolean;
  private title = "Media optimization";
  private total = 0;
  private startedAt = 0;
  private currentStartedAt = 0;
  private currentName: string | undefined;
  private updateState: MediaProgressUpdate = { completed: 0 };
  private timer: ReturnType<typeof setInterval> | undefined;
  private priorLines = 0;
  private cursorHidden = false;
  private lastPlainState = "";

  public constructor(options: MediaProgressOptions = {}) {
    this.output = options.output ?? ((text) => process.stderr.write(text));
    this.isTTY = options.isTTY ?? (
      Boolean(process.stderr.isTTY) && process.env.NO_COLOR === undefined && process.env.CI === undefined
    );
    this.animate = options.animate ?? true;
    this.now = options.now ?? Date.now;
    this.columns = options.columns ?? process.stderr.columns ?? 80;
    this.unicode = options.unicode ?? true;
  }

  public start(title: string, total: number): void {
    this.stopTimer();
    this.title = title;
    this.total = Math.max(0, total);
    this.startedAt = this.now();
    this.currentStartedAt = this.startedAt;
    this.currentName = undefined;
    this.updateState = { completed: 0 };
    this.priorLines = 0;
    this.lastPlainState = "";
    if (this.isTTY && !this.cursorHidden) {
      this.output("\u001b[?25l");
      this.cursorHidden = true;
    }
    this.write();
    if (this.isTTY && this.animate) {
      this.timer = setInterval(() => this.write(), 80);
      this.timer.unref?.();
    }
  }

  public update(update: MediaProgressUpdate): void {
    if (update.current && update.current !== this.currentName) {
      this.currentName = update.current;
      this.currentStartedAt = this.now();
    }
    this.updateState = update;
    this.write();
  }

  public finish(detail = "complete"): void {
    this.stopTimer();
    this.updateState = { ...this.updateState, completed: this.total, detail, filePercent: 100 };
    this.write(true);
    this.restoreCursor();
  }

  public dispose(): void {
    this.stopTimer();
    this.restoreCursor();
  }

  public render(): string {
    const { completed, current, detail, filePercent, processedSeconds } = this.updateState;
    const now = this.now();
    const elapsed = Math.max(0, now - this.startedAt);
    const frames = this.unicode ? orbitFrames : asciiFrames;
    const frame = frames[Math.floor(elapsed / 80) % frames.length]!;
    const currentText = current ? ` ${this.truncate(current, Math.max(18, this.columns - 48))}` : "";
    const detailText = detail ? ` · ${detail}` : "";
    const barWidth = Math.max(10, Math.min(24, this.columns - 45));
    const overall = `Overall ${formatProgressBar(completed, this.total, barWidth, this.unicode)} ${completed}/${this.total}`;
    const file = current
      ? `\nFile     ${formatProgressBar(filePercent ?? (completed >= this.total ? 100 : 0), 100, barWidth, this.unicode)}${currentText}${detailText}`
      : "";
    const fractionalCompleted = Math.min(this.total, completed + Math.max(0, Math.min(100, filePercent ?? 0)) / 100);
    const eta = elapsed >= 1_000 && fractionalCompleted > 0 && fractionalCompleted < this.total
      ? formatDuration(elapsed * (this.total - fractionalCompleted) / fractionalCompleted)
      : fractionalCompleted >= this.total ? "0s" : "estimating...";
    const activeElapsed = Math.max(1, now - this.currentStartedAt) / 1_000;
    const speed = processedSeconds !== undefined && processedSeconds > 0
      ? ` · Speed ${(processedSeconds / activeElapsed).toFixed(2)}×`
      : "";
    const etaText = eta === "estimating..." ? "ETA estimating..." : `ETA ~${eta}`;
    return `${frame} ${this.title}\n${overall}${file}\nElapsed ${formatDuration(elapsed)} · ${etaText}${speed}`;
  }

  private truncate(value: string, width: number): string {
    return value.length <= width ? value : `${value.slice(0, Math.max(1, width - 1))}…`;
  }

  private write(final = false): void {
    if (!this.isTTY) {
      const { completed, current, detail } = this.updateState;
      const state = `${this.title}: ${completed}/${this.total}${current ? ` ${current}` : ""}${detail ? ` · ${detail}` : ""}`;
      if (state !== this.lastPlainState) {
        this.output(`${state}\n`);
        this.lastPlainState = state;
      }
      return;
    }
    const lines = this.render().split("\n");
    let text = this.priorLines > 1 ? `\u001b[${this.priorLines - 1}A\r` : "\r";
    const count = Math.max(this.priorLines, lines.length);
    for (let index = 0; index < count; index += 1) {
      text += `\u001b[2K${lines[index] ?? ""}`;
      if (index < count - 1) text += "\n";
    }
    if (lines.length < count) text += `\u001b[${count - lines.length}A`;
    if (final) text += "\n";
    this.output(text);
    this.priorLines = final ? 0 : lines.length;
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private restoreCursor(): void {
    if (this.cursorHidden) this.output("\u001b[?25h");
    this.cursorHidden = false;
  }
}
