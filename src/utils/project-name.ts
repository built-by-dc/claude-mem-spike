import { homedir } from 'os'
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';
import { detectWorktree } from './worktree.js';

function expandTilde(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return p.replace(/^~/, homedir())
  }
  return p
}

export function getProjectName(cwd: string | null | undefined): string {
  if (!cwd || cwd.trim() === '') {
    logger.warn('PROJECT_NAME', 'Empty cwd provided, using fallback', { cwd });
    return 'unknown-project';
  }

  const expanded = expandTilde(cwd)

  const basename = path.basename(expanded);

  if (basename === '') {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const driveMatch = cwd.match(/^([A-Z]):\\/i);
      if (driveMatch) {
        const driveLetter = driveMatch[1].toUpperCase();
        const projectName = `drive-${driveLetter}`;
        logger.info('PROJECT_NAME', 'Drive root detected', { cwd, projectName });
        return projectName;
      }
    }
    logger.warn('PROJECT_NAME', 'Root directory detected, using fallback', { cwd });
    return 'unknown-project';
  }

  return basename;
}

/**
 * Cowork (local-agent-mode) sandbox detection.
 *
 * When Claude runs in cowork / local-agent mode the hook receives a cwd like:
 *   /Users/x/Library/Application Support/Claude/local-agent-mode-sessions/<u1>/<u2>/local_<u3>/outputs
 *
 * The sibling state file `local_<u3>.json` holds `userSelectedFolders` — the
 * real project folders the user opened. We derive the project name from there
 * rather than from the meaningless "outputs" basename.
 */
const COWORK_REGEX = /^(.*\/local-agent-mode-sessions\/.+\/local_[^/]+)\/outputs(?:\/.*)?$/;

interface CoworkResolution {
  projectName: string;
  stateFilePath: string;
}

/**
 * Look up a cowork space's display name by id in the sibling spaces.json.
 * The space name is what the user sees and may differ from the folder basename
 * (renamed/duplicated space, e.g. "test my project bro 2"). Tolerant of the
 * file's shape: array, {spaces:[...]}, or id-keyed dict — recursively finds an
 * object whose id/uuid === spaceId and returns its trimmed `name`.
 */
function lookupSpaceName(envDir: string, spaceId: string): string | undefined {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(envDir, 'spaces.json'), 'utf8'));
    let found: string | undefined;
    const visit = (o: unknown): void => {
      if (found || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(visit); return; }
      const rec = o as Record<string, unknown>;
      if ((rec.id === spaceId || rec.uuid === spaceId) && typeof rec.name === 'string' && rec.name.trim()) {
        found = rec.name.trim();
        return;
      }
      for (const v of Object.values(rec)) visit(v);
    };
    visit(data);
    return found;
  } catch {
    return undefined;
  }
}

function resolveCoworkProject(cwd: string): CoworkResolution | null {
  const match = cwd.match(COWORK_REGEX);
  if (!match) return null;

  const sessionPrefix = match[1]; // e.g. …/local_<u3>
  const stateFilePath = `${sessionPrefix}.json`;

  try {
    const raw = fs.readFileSync(stateFilePath, 'utf8');
    const state = JSON.parse(raw) as Record<string, unknown>;

    // Prefer the cowork space display name (spaces.json) — what the user sees,
    // and the source of truth when a space is renamed away from its folder name.
    const spaceId = typeof state['spaceId'] === 'string' ? (state['spaceId'] as string) : undefined;
    if (spaceId) {
      const spaceName = lookupSpaceName(path.dirname(stateFilePath), spaceId);
      if (spaceName) {
        logger.info('PROJECT_NAME', 'Resolved cowork project from spaces.json space name', {
          stateFilePath, spaceId, projectName: spaceName,
        });
        return { projectName: spaceName, stateFilePath };
      }
    }

    // Fallback: selected-folder basename.
    const folders = state['userSelectedFolders'];
    if (!Array.isArray(folders) || folders.length === 0) {
      logger.debug('PROJECT_NAME', 'Cowork state file has no space name or userSelectedFolders, falling back', { stateFilePath });
      return null;
    }

    const projectName = path.basename(String(folders[0]));
    logger.info('PROJECT_NAME', 'Resolved cowork project from userSelectedFolders (no space name)', {
      stateFilePath,
      folder: folders[0],
      projectName,
    });
    return { projectName, stateFilePath };
  } catch (err) {
    logger.debug('PROJECT_NAME', 'Could not read cowork state file, falling back', {
      stateFilePath,
      error: String(err),
    });
    return null;
  }
}

export interface ProjectContext {
  primary: string;
  parent: string | null;
  isWorktree: boolean;
  allProjects: string[];
}

export function getProjectContext(cwd: string | null | undefined): ProjectContext {
  // Cowork sandbox detection — must run before the regular basename/worktree path.
  if (cwd) {
    const expanded = expandTilde(cwd);
    const cowork = resolveCoworkProject(expanded);
    if (cowork) {
      const { projectName } = cowork;
      return { primary: projectName, parent: null, isWorktree: false, allProjects: [projectName] };
    }
  }

  const cwdProjectName = getProjectName(cwd);

  if (!cwd) {
    return { primary: cwdProjectName, parent: null, isWorktree: false, allProjects: [cwdProjectName] };
  }

  const expandedCwd = expandTilde(cwd);
  const worktreeInfo = detectWorktree(expandedCwd);

  if (worktreeInfo.isWorktree && worktreeInfo.parentProjectName) {
    const composite = `${worktreeInfo.parentProjectName}/${cwdProjectName}`;
    return {
      primary: composite,
      parent: worktreeInfo.parentProjectName,
      isWorktree: true,
      allProjects: [worktreeInfo.parentProjectName, composite]
    };
  }

  return { primary: cwdProjectName, parent: null, isWorktree: false, allProjects: [cwdProjectName] };
}
