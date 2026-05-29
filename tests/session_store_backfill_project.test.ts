import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../src/services/sqlite/SessionStore.js';

/**
 * TEH-563 — cowork project backfill (race fix).
 *
 * In cowork, the sandbox session-state JSON (holding userSelectedFolders) is
 * written by the client AFTER claude-mem's session-init hook runs, so the
 * project resolves to the "outputs" fallback and is stamped at creation. Once
 * the state file exists, a later hook resolves the real project — backfillProject
 * lets that later resolution correct the already-stamped fallback (and the
 * observations/summaries that inherited it), without ever clobbering a real
 * project name.
 */
describe('SessionStore.backfillProject (cowork race fix)', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });
  afterEach(() => {
    store.close();
  });

  const obs = {
    type: 'discovery',
    title: 'o',
    subtitle: null,
    facts: [],
    narrative: 'n',
    concepts: [],
    files_read: [],
    files_modified: [],
  };

  it('overrides a cowork "outputs" fallback with a later-resolved project', () => {
    const id = store.createSDKSession('cs1', 'outputs', 'hello');
    expect(store.backfillProject('cs1', 'test my project bro')).toBe(true);
    expect(store.getSessionById(id)?.project).toBe('test my project bro');
  });

  it('retags observations that inherited the fallback project', () => {
    const id = store.createSDKSession('cs2', 'outputs', 'hi');
    store.updateMemorySessionId(id, 'ms2');
    const o = store.storeObservation('ms2', 'outputs', obs, 1, 0, 1600000000000);

    store.backfillProject('cs2', 'real-proj');

    expect(store.getObservationById(o.id)?.project).toBe('real-proj');
  });

  it('does NOT override a real (non-fallback) project', () => {
    const id = store.createSDKSession('cs3', 'my-real-repo', 'x');
    expect(store.backfillProject('cs3', 'something-else')).toBe(false);
    expect(store.getSessionById(id)?.project).toBe('my-real-repo');
  });

  it('is a no-op when the resolved project equals the stored one', () => {
    const id = store.createSDKSession('cs4', 'outputs', 'x');
    expect(store.backfillProject('cs4', 'outputs')).toBe(false);
    expect(store.getSessionById(id)?.project).toBe('outputs');
  });

  it('refuses to overwrite a fallback with another fallback value', () => {
    const id = store.createSDKSession('cs5', 'outputs', 'x');
    expect(store.backfillProject('cs5', 'unknown-project')).toBe(false);
    expect(store.getSessionById(id)?.project).toBe('outputs');
  });

  it('is a no-op for an unknown session id', () => {
    expect(store.backfillProject('does-not-exist', 'whatever')).toBe(false);
  });
});
