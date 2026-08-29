/**
 * What currently holds an extension in the workspace, and why.
 *
 * Two independent things can pin an extension:
 *
 *   1. Another selected extension depends on it.
 *   2. The seeding profile lists it as mandatory and the baseline is locked
 *      (#214) — dropping H from RVA23 leaves something that is no longer RVA23.
 *
 * Both answers belong in one map because the UI presents them identically: a
 * tile or panel row refuses removal and names whatever holds the lock. Keeping
 * the two in separate places is what let the profile floor be enforced on one
 * removal path and silently bypassed on the other, so the header could claim
 * conformance for a configuration that had already lost a mandatory extension.
 *
 * Pure on purpose, in the style of marchUtils/exportUtils: no React, and the
 * dependency and profile tables are passed in rather than imported, so the
 * invariant can be tested without rendering anything.
 *
 * @param {object} args
 * @param {Set<string>|Iterable<string>} args.workspaceIds currently selected ids
 * @param {string|null} args.seedProfile profile that seeded the workspace
 * @param {boolean} args.baselineLocked whether that profile's floor is held
 * @param {object} args.smartDependencies id -> ids it requires
 * @param {object} args.profiles profile name -> mandatory ids
 * @returns {Map<string, string[]>} id -> the things requiring it
 */
export const computeLockedExtensions = ({
  workspaceIds,
  seedProfile,
  baselineLocked,
  smartDependencies = {},
  profiles = {},
}) => {
  const selected = workspaceIds instanceof Set ? workspaceIds : new Set(workspaceIds ?? []);
  const locked = new Map();

  const pin = (id, reason) => {
    if (!locked.has(id)) locked.set(id, []);
    locked.get(id).push(reason);
  };

  if (seedProfile && baselineLocked) {
    for (const id of profiles[seedProfile] || []) {
      if (selected.has(id)) pin(id, seedProfile);
    }
  }

  for (const ext of selected) {
    for (const dep of smartDependencies[ext] || []) {
      if (selected.has(dep)) pin(dep, ext);
    }
  }

  return locked;
};

/**
 * The mandatory ids of `seedProfile` missing from the selection.
 *
 * Used to decide whether a configuration still conforms, and to restore the
 * floor when the baseline is re-locked.
 */
export const missingMandatory = ({ workspaceIds, seedProfile, profiles = {} }) => {
  if (!seedProfile) return [];
  const selected = workspaceIds instanceof Set ? workspaceIds : new Set(workspaceIds ?? []);
  return (profiles[seedProfile] || []).filter((id) => !selected.has(id));
};
