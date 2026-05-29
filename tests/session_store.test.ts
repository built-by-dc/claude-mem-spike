import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionStore } from '../src/services/sqlite/SessionStore.js';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('should correctly count user prompts', () => {
    const claudeId = 'claude-session-1';
    store.createSDKSession(claudeId, 'test-project', 'initial prompt');
    
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(0);

    store.saveUserPrompt(claudeId, 1, 'First prompt');
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(1);

    store.saveUserPrompt(claudeId, 2, 'Second prompt');
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(2);

    store.createSDKSession('claude-session-2', 'test-project', 'initial prompt');
    store.saveUserPrompt('claude-session-2', 1, 'Other prompt');
    expect(store.getPromptNumberFromUserPrompts(claudeId)).toBe(2);
  });

  it('should store observation with timestamp override', () => {
    const claudeId = 'claude-sess-obs';
    const memoryId = 'memory-sess-obs';
    const sdkId = store.createSDKSession(claudeId, 'test-project', 'initial prompt');

    store.updateMemorySessionId(sdkId, memoryId);

    const obs = {
      type: 'discovery',
      title: 'Test Obs',
      subtitle: null,
      facts: [],
      narrative: 'Testing',
      concepts: [],
      files_read: [],
      files_modified: []
    };

    const pastTimestamp = 1600000000000; 

    const result = store.storeObservation(
      memoryId, // Use memorySessionId for FK reference
      'test-project',
      obs,
      1,
      0,
      pastTimestamp
    );

    expect(result.createdAtEpoch).toBe(pastTimestamp);

    const stored = store.getObservationById(result.id);
    expect(stored).not.toBeNull();
    expect(stored?.created_at_epoch).toBe(pastTimestamp);

    expect(new Date(stored!.created_at).getTime()).toBe(pastTimestamp);
  });

  it('should store summary with timestamp override', () => {
    const claudeId = 'claude-sess-sum';
    const memoryId = 'memory-sess-sum';
    const sdkId = store.createSDKSession(claudeId, 'test-project', 'initial prompt');

    store.updateMemorySessionId(sdkId, memoryId);

    const summary = {
      request: 'Do something',
      investigated: 'Stuff',
      learned: 'Things',
      completed: 'Done',
      next_steps: 'More',
      notes: null
    };

    const pastTimestamp = 1650000000000;

    const result = store.storeSummary(
      memoryId, // Use memorySessionId for FK reference
      'test-project',
      summary,
      1,
      0,
      pastTimestamp
    );

    expect(result.createdAtEpoch).toBe(pastTimestamp);

    const stored = store.getSummaryForSession(memoryId);
    expect(stored).not.toBeNull();
    expect(stored?.created_at_epoch).toBe(pastTimestamp);
  });

  it('stamps content_session_id on observations and summaries (survives msid remap)', () => {
    const contentId = 'content-sess-stamp';
    const memoryId = 'memory-sess-stamp';
    const sdkId = store.createSDKSession(contentId, 'test-project', 'initial prompt');
    store.updateMemorySessionId(sdkId, memoryId);

    const obs = {
      type: 'discovery',
      title: 'Stamped Obs',
      subtitle: null,
      facts: [],
      narrative: 'Testing stamp',
      concepts: [],
      files_read: [],
      files_modified: []
    };
    const summary = {
      request: 'Req',
      investigated: 'Inv',
      learned: 'Learn',
      completed: 'Done',
      next_steps: 'Next',
      notes: null
    };

    const result = store.storeObservations(
      memoryId,
      contentId,
      'test-project',
      [obs],
      summary
    );

    // Access the underlying db to assert the column was populated.
    const db = (store as unknown as { db: { query: (sql: string) => { get: (...args: unknown[]) => unknown } } }).db;

    const obsRow = db
      .query('SELECT content_session_id FROM observations WHERE id = ?')
      .get(result.observationIds[0]) as { content_session_id: string } | null;
    expect(obsRow?.content_session_id).toBe(contentId);

    const sumRow = db
      .query('SELECT content_session_id FROM session_summaries WHERE id = ?')
      .get(result.summaryId) as { content_session_id: string } | null;
    expect(sumRow?.content_session_id).toBe(contentId);
  });
});
