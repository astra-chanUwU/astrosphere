import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, renameSync, symlinkSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOperationId,
  MaintenanceStateError,
  maintenancePaths,
  readManifest,
  readState,
  sha256File,
  writeNewManifest,
  writeStateAtomic,
} from "../src/lib/media/maintenance-manifest";
import type {
  MaintenanceManifestV1,
  MaintenanceStateV1,
} from "../src/lib/media/maintenance-types";

test("creates deterministic lowercase operation IDs and private operation paths", () => {
  expect(
    createOperationId(
      new Date("2026-08-23T12:00:00Z"),
      () => "a1b2c3d4",
    ),
  ).toBe("20260823t120000z-a1b2c3d4");
  expect(maintenancePaths("/media", "safe-id")).toEqual({
    directory: "/media/.astrosphere/maintenance",
    manifest: "/media/.astrosphere/maintenance/safe-id.manifest.json",
    state: "/media/.astrosphere/maintenance/safe-id.state.json",
    operation: "/media/.astrosphere/maintenance/safe-id",
    staging: "/media/.astrosphere/maintenance/safe-id/staging",
    lock: "/media/.astrosphere/maintenance/apply.lock",
  });
  expect(() => maintenancePaths("/media", "../escape")).toThrow("operation ID");
});

const totals = {
  files: 2,
  bytes: 30,
  references: 1,
  errors: 0,
  orphans: 0,
};

const manifestFor = (root: string): MaintenanceManifestV1 => ({
  schemaVersion: 1,
  operationId: "20260823t120000z-a1b2c3d4",
  createdAt: "2026-08-23T12:00:00.000Z",
  roots: { projectRoot: "/project", mediaRoot: root },
  quality: 85,
  validatorBaseline: totals,
  conversions: [
    {
      sourceRelativePath: "images/gallery/a.jpg",
      sourcePublicPath: "/media/images/gallery/a.jpg",
      sourceBytes: 20,
      sourceMtimeMs: 1_700_000_000_000,
      sourceSha256: "a".repeat(64),
      sourceFormat: "jpeg",
      destinationRelativePath: "images/gallery/a.webp",
      destinationPublicPath: "/media/images/gallery/a.webp",
      references: [{ source: "src/content/image-sets/gallery.md", field: "hero.src" }],
    },
  ],
  deletions: [
    {
      relativePath: "images/gallery/a.jpg",
      publicPath: "/media/images/gallery/a.jpg",
      bytes: 20,
      sha256: "a".repeat(64),
      reason: "replaced-original",
    },
  ],
  contentRewrites: [
    {
      relativePath: "src/content/image-sets/gallery.md",
      beforeSha256: "b".repeat(64),
      afterSha256: "c".repeat(64),
      edits: [
        {
          start: 0,
          end: 1,
          before: "a",
          after: "b",
          field: "hero.src",
        },
      ],
    },
  ],
  destinationChecks: [
    {
      relativePath: "images/gallery/a.webp",
      publicPath: "/media/images/gallery/a.webp",
    },
  ],
  expectedIntermediateTotals: totals,
  expectedFinalTotals: totals,
});

const plannedState = (operationId: string): MaintenanceStateV1 => ({
  schemaVersion: 1,
  operationId,
  phase: "planned",
  completedConversions: [],
  activatedDestinations: [],
  completedContentRewrites: [],
  completedDeletions: [],
});

const withTemporaryMediaRoot = async (
  operation: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "media-maintenance-manifest-"));
  try {
    await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const expectStateError = async (
  operation: Promise<unknown>,
  code: string,
): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(MaintenanceStateError);
    expect((error as MaintenanceStateError).code).toBe(code);
    return;
  }
  throw new Error(`Expected maintenance state error ${code}.`);
};

test("persists immutable manifests and atomically replaces validated state", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    const paths = maintenancePaths(root, manifest.operationId);
    await writeNewManifest(root, manifest);
    expect(await readManifest(root, manifest.operationId)).toEqual(manifest);
    await expectStateError(
      writeNewManifest(root, manifest),
      "manifest-already-exists",
    );

    await writeStateAtomic(root, manifest.operationId, plannedState(manifest.operationId));
    const complete: MaintenanceStateV1 = {
      ...plannedState(manifest.operationId),
      phase: "complete",
      result: { status: "applied", totals },
    };
    await writeStateAtomic(root, manifest.operationId, complete);
    expect(await readState(root, manifest.operationId)).toEqual(complete);
    expect(await readdir(paths.directory)).toEqual([
      `${manifest.operationId}.manifest.json`,
      `${manifest.operationId}.state.json`,
    ]);
  });
});

test("rejects corrupt files and supplied JSON that tries to escape the private directory", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    const paths = maintenancePaths(root, manifest.operationId);
    await writeNewManifest(root, manifest);
    await writeStateAtomic(root, manifest.operationId, plannedState(manifest.operationId));
    await writeFile(paths.manifest, "{");
    await expectStateError(readManifest(root, manifest.operationId), "manifest-invalid");
    await writeFile(paths.state, "{");
    await expectStateError(readState(root, manifest.operationId), "state-invalid");
    await writeFile(
      paths.state,
      JSON.stringify({ ...plannedState(manifest.operationId), operationId: "../outside" }),
    );
    await expectStateError(readState(root, manifest.operationId), "state-invalid");

    await writeFile(
      paths.manifest,
      JSON.stringify({ ...manifest, operationId: "../outside" }),
    );
    await expectStateError(readManifest(root, manifest.operationId), "manifest-invalid");
    await expectStateError(readManifest(root, "../outside"), "operation-id-invalid");
  });
});

test("binds a manifest to its requested operation ID", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    const paths = maintenancePaths(root, manifest.operationId);
    await mkdir(paths.directory, { recursive: true });
    await writeFile(
      paths.manifest,
      JSON.stringify({ ...manifest, operationId: "20260823t120000z-deadbeef" }),
    );
    await expectStateError(readManifest(root, manifest.operationId), "manifest-invalid");
  });
});

test("reports missing manifest and state leaves with stable not-found codes", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    await writeStateAtomic(root, manifest.operationId, plannedState(manifest.operationId));
    await expectStateError(readManifest(root, manifest.operationId), "manifest-not-found");

    const paths = maintenancePaths(root, manifest.operationId);
    await rm(paths.state);
    await expectStateError(readState(root, manifest.operationId), "state-not-found");
  });
});

test("fails closed for private-directory and journal-leaf symlinks or nonregular entries", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    const paths = maintenancePaths(root, manifest.operationId);
    const redirected = join(root, "redirected");
    await mkdir(redirected);
    await symlink(redirected, join(root, ".astrosphere"));
    await expectStateError(writeNewManifest(root, manifest), "private-path-unsafe");
  });

  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    const redirected = join(root, "redirected");
    await mkdir(redirected);
    await mkdir(join(root, ".astrosphere"));
    await symlink(redirected, join(root, ".astrosphere", "maintenance"));
    await expectStateError(writeNewManifest(root, manifest), "private-path-unsafe");
  });

  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    const paths = maintenancePaths(root, manifest.operationId);
    const redirected = join(root, "redirected.json");
    await writeNewManifest(root, manifest);
    await writeStateAtomic(root, manifest.operationId, plannedState(manifest.operationId));
    await writeFile(redirected, "not a manifest");
    await rm(paths.manifest);
    await symlink(redirected, paths.manifest);
    await expectStateError(readManifest(root, manifest.operationId), "manifest-invalid");
    await rm(paths.state);
    await symlink(redirected, paths.state);
    await expectStateError(readState(root, manifest.operationId), "state-invalid");
    await expectStateError(
      writeStateAtomic(root, manifest.operationId, plannedState(manifest.operationId)),
      "private-path-unsafe",
    );
    await rm(paths.manifest);
    await mkdir(paths.manifest);
    await expectStateError(readManifest(root, manifest.operationId), "manifest-invalid");
    await rm(paths.state);
    await mkdir(paths.state);
    await expectStateError(readState(root, manifest.operationId), "state-invalid");
  });
});

test("atomically publishes one complete immutable manifest without replacement", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const first = { ...manifestFor(root), quality: 84 };
    const second = { ...manifestFor(root), quality: 86 };
    const results = await Promise.allSettled([
      writeNewManifest(root, first),
      writeNewManifest(root, second),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(MaintenanceStateError);
      expect((rejected.reason as MaintenanceStateError).code).toBe("manifest-already-exists");
    }

    const paths = maintenancePaths(root, first.operationId);
    const raw = await readFile(paths.manifest, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect([84, 86]).toContain((await readManifest(root, first.operationId)).quality);
    expect((await readdir(paths.directory)).filter((name) => name.includes(".manifest-")).length).toBe(0);
  });
});

test("keeps journal I/O bound to the retained maintenance directory after a parent swap", async () => {
  const swapVisibleParent = (root: string): { held: string; external: string } => {
    const visible = join(root, ".astrosphere");
    const held = join(root, "held-astrosphere");
    const external = join(root, "external");
    renameSync(visible, held);
    mkdirSync(external);
    symlinkSync(external, visible);
    return { held, external };
  };

  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    let swapped: { held: string; external: string } | undefined;
    await writeNewManifest(root, manifest, {
      afterRetainMaintenanceDirectory: () => {
        swapped = swapVisibleParent(root);
      },
    });
    expect(swapped).toBeDefined();
    expect(
      await Bun.file(join(swapped!.held, "maintenance", `${manifest.operationId}.manifest.json`)).exists(),
    ).toBe(true);
    expect(
      await Bun.file(join(swapped!.external, `${manifest.operationId}.manifest.json`)).exists(),
    ).toBe(false);
  });

  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    await writeNewManifest(root, manifest);
    let swapped: { held: string; external: string } | undefined;
    expect(
      await readManifest(root, manifest.operationId, {
        afterRetainMaintenanceDirectory: () => {
          swapped = swapVisibleParent(root);
        },
      }),
    ).toEqual(manifest);
    expect(swapped).toBeDefined();
    expect(
      await Bun.file(join(swapped!.external, `${manifest.operationId}.manifest.json`)).exists(),
    ).toBe(false);
  });

  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    let swapped: { held: string; external: string } | undefined;
    await writeStateAtomic(root, manifest.operationId, plannedState(manifest.operationId), {
      afterRetainMaintenanceDirectory: () => {
        swapped = swapVisibleParent(root);
      },
    });
    expect(swapped).toBeDefined();
    expect(
      await Bun.file(join(swapped!.held, "maintenance", `${manifest.operationId}.state.json`)).exists(),
    ).toBe(true);
    expect(
      await Bun.file(join(swapped!.external, `${manifest.operationId}.state.json`)).exists(),
    ).toBe(false);
  });
});

test("rejects unsafe manifest records instead of accepting portable collisions or stale paths", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    await expectStateError(
      writeNewManifest(root, {
        ...manifest,
        conversions: [
          ...manifest.conversions,
          {
            ...manifest.conversions[0]!,
            sourceRelativePath: "images/gallery/A.jpg",
            destinationRelativePath: "images/gallery/A.webp",
          },
        ],
      }),
      "manifest-invalid",
    );
    await expectStateError(
      writeNewManifest(root, {
        ...manifest,
        deletions: [{ ...manifest.deletions[0]!, relativePath: "../outside.jpg" }],
      }),
      "manifest-invalid",
    );
  });
});

test("rejects unversioned, unordered, and incomplete manifest records", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const manifest = manifestFor(root);
    await expectStateError(
      writeNewManifest(root, { ...manifest, schemaVersion: 2 } as never),
      "manifest-invalid",
    );
    await expectStateError(
      writeNewManifest(root, { ...manifest, unexpected: true } as never),
      "manifest-invalid",
    );
    await expectStateError(
      writeNewManifest(root, {
        ...manifest,
        conversions: [{ ...manifest.conversions[0]!, sourceFormat: "webp" as never }],
      }),
      "manifest-invalid",
    );
    await expectStateError(
      writeNewManifest(root, {
        ...manifest,
        conversions: [
          { ...manifest.conversions[0]!, sourceRelativePath: "images/gallery/b.jpg" },
          manifest.conversions[0]!,
        ],
      }),
      "manifest-invalid",
    );
    await expectStateError(
      writeNewManifest(root, {
        ...manifest,
        deletions: [{ ...manifest.deletions[0]!, reason: "orphan" }],
      }),
      "manifest-invalid",
    );
  });
});

test("hashes only regular files without following symlinks", async () => {
  await withTemporaryMediaRoot(async (root) => {
    const first = join(root, "first.bin");
    const second = join(root, "second.bin");
    const directory = join(root, "directory");
    const link = join(root, "first-link.bin");
    await writeFile(first, "first");
    await writeFile(second, "second");
    await mkdir(directory);
    await symlink(first, link);

    expect(await sha256File(first)).toBe(
      createHash("sha256").update("first").digest("hex"),
    );
    expect(await sha256File(first)).not.toBe(await sha256File(second));
    await expectStateError(sha256File(link), "hash-unsafe-file");
    await expectStateError(sha256File(directory), "hash-unsafe-file");
  });
});
