/**
 * What may be removed from the workspace, and why.
 *
 * The bug these tests exist for: the profile floor (#214) was computed in one
 * place for display and re-derived from dependencies alone in the removal
 * guard. The two disagreed, so a mandatory extension could be toggled off from
 * a catalogue tile while the header still reported the configuration matched
 * the profile — exactly the false compliance the lock was added to prevent.
 * The panel path enforced the floor and the tile path did not, which is the
 * kind of divergence that only shows up when both callers are exercised.
 *
 * These run against the real PROFILES table rather than a fixture, so a future
 * edit that adds a mandatory extension to a profile is covered the day it lands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLockedExtensions, missingMandatory } from '../src/workspaceLock.js';
import { PROFILES } from '../src/profiles.js';

const PROFILE = 'RVA23';
const mandatory = PROFILES[PROFILE];

test('the profile table used by these tests is non-trivial', () => {
  assert.ok(Array.isArray(mandatory) && mandatory.length > 0, `${PROFILE} should have members`);
});

test('a locked profile pins every one of its mandatory extensions', () => {
  const locked = computeLockedExtensions({
    workspaceIds: new Set(mandatory),
    seedProfile: PROFILE,
    baselineLocked: true,
    profiles: PROFILES,
  });

  for (const id of mandatory) {
    assert.ok(locked.has(id), `${id} is mandatory for ${PROFILE} and must be held while locked`);
    assert.ok(
      locked.get(id).includes(PROFILE),
      `${id} should name ${PROFILE} as the reason it cannot be removed`,
    );
  }
});

test('releasing the baseline releases the mandatory extensions', () => {
  const locked = computeLockedExtensions({
    workspaceIds: new Set(mandatory),
    seedProfile: PROFILE,
    baselineLocked: false,
    profiles: PROFILES,
  });

  // Nothing else is holding them, so with the floor released they are free.
  for (const id of mandatory) {
    assert.equal(locked.has(id), false, `${id} should be removable once the baseline is released`);
  }
});

test('an extension absent from the workspace is not pinned', () => {
  const [first, ...rest] = mandatory;
  const locked = computeLockedExtensions({
    workspaceIds: new Set(rest),
    seedProfile: PROFILE,
    baselineLocked: true,
    profiles: PROFILES,
  });

  assert.equal(locked.has(first), false, 'a floor only holds what is actually selected');
});

test('dependencies pin their providers, and name the dependant', () => {
  const locked = computeLockedExtensions({
    workspaceIds: new Set(['Zba', 'Zbb']),
    seedProfile: null,
    baselineLocked: false,
    smartDependencies: { Zbb: ['Zba'] },
  });

  assert.deepEqual(locked.get('Zba'), ['Zbb']);
  assert.equal(locked.has('Zbb'), false);
});

test('both reasons accumulate on the same extension', () => {
  const id = mandatory[0];
  const locked = computeLockedExtensions({
    workspaceIds: new Set([...mandatory, 'Dependant']),
    seedProfile: PROFILE,
    baselineLocked: true,
    smartDependencies: { Dependant: [id] },
    profiles: PROFILES,
  });

  assert.deepEqual(
    locked.get(id),
    [PROFILE, 'Dependant'],
    'the user should be told every reason an extension is held',
  );
});

test('no profile, no floor', () => {
  const locked = computeLockedExtensions({
    workspaceIds: new Set(mandatory),
    seedProfile: null,
    baselineLocked: true,
    profiles: PROFILES,
  });

  assert.equal(locked.size, 0);
});

test('missingMandatory reports exactly what the selection lacks', () => {
  const [dropped, ...kept] = mandatory;

  assert.deepEqual(
    missingMandatory({ workspaceIds: new Set(kept), seedProfile: PROFILE, profiles: PROFILES }),
    [dropped],
  );
  assert.deepEqual(
    missingMandatory({
      workspaceIds: new Set(mandatory),
      seedProfile: PROFILE,
      profiles: PROFILES,
    }),
    [],
    'a complete selection is missing nothing',
  );
  assert.deepEqual(
    missingMandatory({ workspaceIds: new Set(), seedProfile: null, profiles: PROFILES }),
    [],
    'without a seeding profile there is no floor to fall short of',
  );
});

test('accepts a plain iterable as well as a Set', () => {
  const locked = computeLockedExtensions({
    workspaceIds: mandatory,
    seedProfile: PROFILE,
    baselineLocked: true,
    profiles: PROFILES,
  });

  assert.equal(locked.size, mandatory.length);
});
