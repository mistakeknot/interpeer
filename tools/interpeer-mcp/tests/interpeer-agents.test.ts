import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseCliArgs, shouldShowHelp } from '../src/bin/interpeer-agents.js';

describe('interpeer-agents CLI argument parsing', () => {
  it('detects help flags and commands', () => {
    expect(shouldShowHelp(['--help'])).toBe(true);
    expect(shouldShowHelp(['-h'])).toBe(true);
    expect(shouldShowHelp(['help'])).toBe(true);
    expect(shouldShowHelp(['list'])).toBe(false);
    expect(shouldShowHelp([])).toBe(false);
  });

  it('defaults to list command when none provided', () => {
    const parsed = parseCliArgs([]);
    expect(parsed.kind).toBe('list');
    expect(parsed.projectRoot).toBe(process.cwd());
    expect(parsed.configPath).toBeUndefined();
  });

  it('parses set-default with agent and model overrides', () => {
    const parsed = parseCliArgs([
      'set-default',
      '--agent',
      'codex_cli',
      '--model',
      'custom-model'
    ]);

    expect(parsed.kind).toBe('set-default');
    expect(parsed.projectRoot).toBe(process.cwd());
    expect(parsed).toMatchObject({
      agent: 'codex_cli',
      model: 'custom-model'
    });
  });

  it('allows clearing the configured model with an empty value', () => {
    const parsed = parseCliArgs(['set-default', '--model', '']);
    expect(parsed.kind).toBe('set-default');
    expect(parsed.model).toBe('');
  });

  it('requires at least one update when using set-agent', () => {
    expect(() => parseCliArgs(['set-agent', '--id', 'claude'])).toThrow(
      'set-agent requires at least one of --command or --model'
    );
  });

  it('rejects duplicate flags', () => {
    expect(() =>
      parseCliArgs(['set-default', '--agent', 'codex_cli', '--agent', 'claude_code'])
    ).toThrow('Flag --agent specified multiple times');
  });

  it('rejects unknown flags for a command', () => {
    expect(() => parseCliArgs(['list', '--unknown=foo'])).toThrow(
      'Flag --unknown is not valid for command list'
    );
  });

  it('validates project root existence', () => {
    const root = mkdtempSync(join(tmpdir(), 'interpeer-cli-'));
    const parsed = parseCliArgs(['list', '--project-root', root]);
    expect(parsed.projectRoot).toBe(root);

    expect(() => parseCliArgs(['list', '--project-root', '/definitely/missing/path'])).toThrow(
      "Project root '/definitely/missing/path'"
    );
  });
});
