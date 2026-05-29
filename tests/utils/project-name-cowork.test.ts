import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getProjectContext } from '../../src/utils/project-name.js';

/**
 * Tests for the cowork (local-agent-mode) sandbox project resolution fix.
 *
 * Bug: getProjectContext() was returning "outputs" for every cowork session
 * because the hook cwd is a sandbox path ending in `/local_<uuid>/outputs`.
 *
 * Fix: detect the cowork pattern, read the sibling `local_<uuid>.json` state
 * file, and extract the project name from `userSelectedFolders[0]`.
 */
describe('getProjectContext — cowork sandbox resolution', () => {
  let tempDir: string;

  // Construct a realistic cowork-shaped session path inside our temp dir.
  // We embed the `local-agent-mode-sessions` segment so the regex matches.
  const u1 = 'aaaabbbb-1111-2222-3333-ccccddddeeee';
  const u2 = 'ffffgggg-4444-5555-6666-hhhhiiiijjjj';
  const u3 = '86e0a395-0000-1111-2222-333344445555';

  let sessionDir: string;   // …/local_<u3>
  let outputsDir: string;   // …/local_<u3>/outputs
  let stateFile: string;    // …/local_<u3>.json

  beforeEach(() => {
    tempDir = join(
      tmpdir(),
      `cowork-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    // Build the full sandbox directory tree inside temp.
    sessionDir = join(
      tempDir,
      'Library', 'Application Support', 'Claude',
      'local-agent-mode-sessions', u1, u2,
      `local_${u3}`
    );
    outputsDir = join(sessionDir, 'outputs');
    stateFile  = `${sessionDir}.json`;

    mkdirSync(outputsDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('resolves primary to basename(userSelectedFolders[0]) — not "outputs"', () => {
    writeFileSync(stateFile, JSON.stringify({
      sessionId: `local_${u3}`,
      cliSessionId: 'fa87748b-0000-1111-2222-333344445555',
      title: 'Fix the bug',
      cwd: outputsDir,
      userSelectedFolders: ['/Users/davidcarling/Documents/built by dc/projects/teho-platform'],
      spaceId: 'space-abc',
    }));

    const ctx = getProjectContext(outputsDir);

    expect(ctx.primary).toBe('teho-platform');
    expect(ctx.primary).not.toBe('outputs');
    expect(ctx.isWorktree).toBe(false);
    expect(ctx.parent).toBeNull();
    expect(ctx.allProjects).toEqual(['teho-platform']);
  });

  it('resolves correctly when cwd is a subdirectory of outputs', () => {
    writeFileSync(stateFile, JSON.stringify({
      sessionId: `local_${u3}`,
      userSelectedFolders: ['/x/y/my-repo'],
    }));

    const subdir = join(outputsDir, 'some', 'deep', 'path');
    mkdirSync(subdir, { recursive: true });

    const ctx = getProjectContext(subdir);

    expect(ctx.primary).toBe('my-repo');
  });

  it('falls back to basename(cwd) when the state file is missing', () => {
    // Do NOT write the state file — it simply does not exist.

    const ctx = getProjectContext(outputsDir);

    expect(ctx.primary).toBe('outputs');
    // Must not throw — verify the test itself completes cleanly.
  });

  it('falls back to basename(cwd) when the state file is malformed JSON', () => {
    writeFileSync(stateFile, '{ this is not valid JSON ');

    const ctx = getProjectContext(outputsDir);

    expect(ctx.primary).toBe('outputs');
  });

  it('falls back to basename(cwd) when userSelectedFolders is an empty array', () => {
    writeFileSync(stateFile, JSON.stringify({
      sessionId: `local_${u3}`,
      userSelectedFolders: [],
    }));

    const ctx = getProjectContext(outputsDir);

    expect(ctx.primary).toBe('outputs');
  });

  it('falls back to basename(cwd) when userSelectedFolders is missing', () => {
    writeFileSync(stateFile, JSON.stringify({
      sessionId: `local_${u3}`,
    }));

    const ctx = getProjectContext(outputsDir);

    expect(ctx.primary).toBe('outputs');
  });
});

describe('getProjectContext — native cwd (must be unaffected)', () => {
  it('returns basename for a plain native cwd', () => {
    const ctx = getProjectContext('/Users/foo/Documents/myrepo');
    expect(ctx.primary).toBe('myrepo');
    expect(ctx.isWorktree).toBe(false);
    expect(ctx.parent).toBeNull();
    expect(ctx.allProjects).toEqual(['myrepo']);
  });

  it('path containing local-agent-mode-sessions but not matching pattern is unaffected', () => {
    // Path mentions the segment but does NOT end in /local_xxx/outputs
    const ctx = getProjectContext('/some/local-agent-mode-sessions/myproject');
    expect(ctx.primary).toBe('myproject');
  });
});
