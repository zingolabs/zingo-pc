import APP_VERSION from "./version";

/**
 * Which Zingo PC this is, to the commit: `zpc_2.0.26-194_1a2b3c4`.
 *
 * Shown beside zingolib's own description, so a report names both halves of
 * the build. The version and build number come from `version.ts`, which
 * `release:prep` writes; the commit is the one the bundle was built from, and
 * is left off when the build had no repository to read it from.
 */
export function buildId(version: string = APP_VERSION, commit: string = process.env.GIT_COMMIT ?? ""): string {
  const versionAndBuild = version.replace(/^(\S+) \((\d+)\)$/, "$1-$2");
  return commit ? `zpc_${versionAndBuild}_${commit}` : `zpc_${versionAndBuild}`;
}

export default buildId;
