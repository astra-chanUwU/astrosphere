export type MaintenanceEnvelope<T> = {
  schemaVersion: 1;
  command: "media:maintain";
  ok: true;
  result: T;
};

export type MaintenanceErrorBody = {
  category:
    | "usage"
    | "configuration"
    | "validation"
    | "optimization"
    | "state";
  code: string;
  message: string;
  operationId?: string;
  context?: Record<string, string | number | boolean>;
};

export type MaintenanceErrorEnvelope = {
  schemaVersion: 1;
  command: "media:maintain";
  ok: false;
  error: MaintenanceErrorBody;
};

export type MaintainArgs =
  | { action: "plan"; quality: number }
  | { action: "apply"; operationId: string; jobs: number };

export type MaintenanceTotals = {
  files: number;
  bytes: number;
  references: number;
  errors: number;
  orphans: number;
};

export type MaintenancePlanSummary = {
  conversions: number;
  deletions: number;
  contentRewrites: number;
  sourceBytes: number;
  deletionBytes: number;
};

export type MaintenancePlanResult =
  | { status: "clean"; baseline: MaintenanceTotals }
  | {
      status: "planned";
      operationId: string;
      manifestPath: string;
      summary: MaintenancePlanSummary;
    };

export type MaintenanceConversionV1 = {
  sourceRelativePath: string;
  sourcePublicPath: string;
  sourceBytes: number;
  sourceMtimeMs: number;
  sourceSha256: string;
  sourceFormat: "jpeg" | "png" | "gif";
  destinationRelativePath: string;
  destinationPublicPath: string;
  references: Array<{ source: string; field: string }>;
};

export type MaintenanceDeletionV1 = {
  relativePath: string;
  publicPath: string;
  bytes: number;
  sha256: string;
  reason: "orphan" | "replaced-original";
};

export type MaintenanceContentEditV1 = {
  start: number;
  end: number;
  before: string;
  after: string;
  field: string;
};

export type MaintenanceContentRewriteV1 = {
  relativePath: string;
  beforeSha256: string;
  afterSha256: string;
  edits: MaintenanceContentEditV1[];
};

export type MaintenanceDestinationCheckV1 = {
  relativePath: string;
  publicPath: string;
};

export type MaintenanceManifestV1 = {
  schemaVersion: 1;
  operationId: string;
  createdAt: string;
  roots: { projectRoot: string; mediaRoot: string };
  quality: number;
  validatorBaseline: MaintenanceTotals;
  conversions: MaintenanceConversionV1[];
  deletions: MaintenanceDeletionV1[];
  contentRewrites: MaintenanceContentRewriteV1[];
  destinationChecks: MaintenanceDestinationCheckV1[];
  expectedIntermediateTotals: MaintenanceTotals;
  expectedFinalTotals: MaintenanceTotals;
};

export type MaintenancePhaseV1 =
  | "planned"
  | "staging"
  | "activated"
  | "deleting"
  | "complete"
  | "failed-before-delete"
  | "blocked-after-delete";

export type MaintenanceFinalResultV1 = {
  status: "applied" | "already-applied";
  totals: MaintenanceTotals;
};

export type MaintenanceFailureV1 = {
  code: string;
  message: string;
};

type MaintenanceStateBaseV1 = {
  schemaVersion: 1;
  operationId: string;
  completedConversions: string[];
  activatedDestinations: string[];
  completedContentRewrites: string[];
  completedDeletions: string[];
};

export type MaintenanceStateV1 =
  | (MaintenanceStateBaseV1 & {
      phase: "planned" | "staging" | "activated" | "deleting";
    })
  | (MaintenanceStateBaseV1 & {
      phase: "complete";
      result: MaintenanceFinalResultV1;
    })
  | (MaintenanceStateBaseV1 & {
      phase: "failed-before-delete" | "blocked-after-delete";
      failure: MaintenanceFailureV1;
    });
