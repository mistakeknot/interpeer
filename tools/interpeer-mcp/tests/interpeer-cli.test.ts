import { describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';

import { buildCodexConfig } from '../src/bin/interpeer-cli.js';

describe('interpeer CLI helpers', () => {
  it('builds Codex config with defaults', () => {
    const projectRoot = '/tmp/interpeer-project';
    const config = buildCodexConfig({
      projectRoot,
      nodeCommand: 'node'
    });

    expect(config).toEqual({
      name: 'interpeer',
      command: 'node',
      args: [join(resolve(projectRoot), 'tools', 'interpeer-mcp', 'dist', 'bin', 'interpeer-mcp.js')],
      env: {
        INTERPEER_PROJECT_ROOT: resolve(projectRoot)
      }
    });
  });

  it('allows overriding server path and command', () => {
    const config = buildCodexConfig({
      projectRoot: '.',
      nodeCommand: '/usr/local/bin/node18',
      serverPath: '/opt/interpeer/bin/server.js'
    });

    expect(config.args).toEqual(['/opt/interpeer/bin/server.js']);
    expect(config.command).toBe('/usr/local/bin/node18');
    expect(config.env.INTERPEER_PROJECT_ROOT).toBe(resolve('.'));
  });
});
