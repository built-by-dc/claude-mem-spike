import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { getProjectContext } from '../../src/utils/project-name.js';

/**
 * TEH-563 — cowork project name must be the SPACE display name (spaces.json),
 * not the selected-folder basename.
 *
 * The cowork space can be renamed/duplicated (e.g. "test my project bro 2")
 * while its folder keeps the original basename ("test my project bro"). The
 * project the user sees and expects is the space name, mapped by spaceId in the
 * sibling spaces.json. Fall back to the folder basename only when no space name
 * is available.
 */
describe('getProjectContext — cowork space name (spaces.json)', () => {
  let tmp: string;
  let outputsDir: string;
  let envRoot: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'cm-space-'));
    // …/local-agent-mode-sessions/u1/u2/local_u3/outputs ; spaces.json sits in u2
    envRoot = join(tmp, 'local-agent-mode-sessions', 'u1', 'u2');
    const localDir = join(envRoot, 'local_u3');
    outputsDir = join(localDir, 'outputs');
    mkdirSync(outputsDir, { recursive: true });
    mkdirSync(join(tmp, 'Projects', 'test my project bro'), { recursive: true });

    writeFileSync(
      join(envRoot, 'local_u3.json'),
      JSON.stringify({
        cliSessionId: 'sess-1',
        spaceId: 'space-abc',
        userSelectedFolders: [join(tmp, 'Projects', 'test my project bro')],
      })
    );
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function writeSpaces(content: unknown) {
    writeFileSync(join(envRoot, 'spaces.json'), JSON.stringify(content));
  }

  it('uses the space name from spaces.json, not the folder basename', () => {
    writeSpaces({
      spaces: [
        { id: 'space-abc', name: 'test my project bro 2', folders: [{ path: '/whatever' }] },
      ],
    });
    const ctx = getProjectContext(outputsDir);
    expect(ctx.primary).toBe('test my project bro 2');
    expect(ctx.primary).not.toBe('test my project bro');
  });

  it('handles a dict-keyed spaces.json shape', () => {
    writeSpaces({ 'space-abc': { id: 'space-abc', name: 'renamed space' } });
    expect(getProjectContext(outputsDir).primary).toBe('renamed space');
  });

  it('falls back to folder basename when spaces.json is missing', () => {
    // no spaces.json written
    expect(getProjectContext(outputsDir).primary).toBe('test my project bro');
  });

  it('falls back to folder basename when the spaceId is not in spaces.json', () => {
    writeSpaces({ spaces: [{ id: 'other-space', name: 'nope' }] });
    expect(getProjectContext(outputsDir).primary).toBe('test my project bro');
  });
});
