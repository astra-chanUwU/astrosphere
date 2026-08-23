export type MediaErrorKind =
  | "usage"
  | "configuration"
  | "validation"
  | "optimization"
  | "synchronization"
  | "maintenance";

export const mediaExitCodes = {
  usage: 2,
  configuration: 3,
  validation: 4,
  optimization: 5,
  synchronization: 6,
  maintenance: 7,
} as const;

export class MediaError extends Error {
  constructor(public readonly kind: MediaErrorKind, message: string) {
    super(message);
    this.name = "MediaError";
  }
}

export const exitCodeForMediaError = (error: unknown): number =>
  error instanceof MediaError ? mediaExitCodes[error.kind] : 1;
