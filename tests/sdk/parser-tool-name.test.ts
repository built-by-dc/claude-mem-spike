import { describe, it, expect, mock } from 'bun:test';

mock.module('../../src/services/domain/ModeManager.js', () => ({
  ModeManager: {
    getInstance: () => ({
      getActiveMode: () => ({
        observation_types: [{ id: 'change' }, { id: 'discovery' }, { id: 'refactor' }],
      }),
    }),
  },
}));

import { parseAgentXml } from '../../src/sdk/parser.js';

describe('parseObservationBlocks tool_name', () => {
  it('extracts <tool_name> from an observation block', () => {
    const xml = `<observation><type>change</type><tool_name>mcp__linear__get_issue</tool_name>` +
      `<title>t</title><narrative>n</narrative></observation>`;
    const r = parseAgentXml(xml) as any;
    expect(r.valid).toBe(true);
    expect(r.observations[0].tool_name).toBe('mcp__linear__get_issue');
  });

  it('tool_name is null when the tag is absent', () => {
    const xml = `<observation><type>change</type><title>t</title><narrative>n</narrative></observation>`;
    const r = parseAgentXml(xml) as any;
    expect(r.observations[0].tool_name).toBeNull();
  });
});
