import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync } from 'fs';

import { __testUtils } from '../src/index.js';

describe('interpeer-mcp internals', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    __testUtils.setProjectRoot(process.cwd());
    __testUtils.clearCache();
  });

  afterEach(() => {
    Object.keys(process.env)
      .filter((key) => !(key in originalEnv))
      .forEach((key) => delete process.env[key]);
    Object.assign(process.env, originalEnv);
  });

  it('builds prompt bundle for security audit template', () => {
    const bundle = __testUtils.buildPromptBundle({
      content: 'console.log("hello")',
      focus: ['authentication'],
      review_type: 'security_audit',
      style: 'structured'
    });

    expect(bundle.system).toContain('Security Audit');
    expect(bundle.system).toContain('authentication');
    expect(bundle.system).toContain('Highlight authentication, authorization');
  });

  it('includes resource file contents when preparing input', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'interpeer-test-'));
    await fs.writeFile(join(tempDir, 'example.txt'), 'sample content');

    __testUtils.setProjectRoot(tempDir);

    const prepared = await __testUtils.prepareInput({
      content: 'Base content',
      resource_paths: ['example.txt']
    });

    expect(prepared.content).toContain('Base content');
    expect(prepared.content).toContain('sample content');
    expect(prepared.content).toContain('# File: example.txt');
  });

  it('loads config defaults and respects overrides', () => {
    delete process.env.INTERPEER_CLAUDE_MODEL;
    delete process.env.INTERPEER_CACHE_ENABLED;

    let config = __testUtils.loadConfig(process.cwd());
    expect(config.agents.claude.model).toBe('sonnet');
    expect(config.cache.enabled).toBe(true);

    process.env.INTERPEER_CLAUDE_MODEL = 'opus';
    process.env.INTERPEER_CACHE_ENABLED = 'false';
    process.env.INTERPEER_CACHE_TTL_MS = '1000';
    process.env.INTERPEER_CACHE_MAX_ENTRIES = '5';

    config = __testUtils.loadConfig(process.cwd());

    expect(config.agents.claude.model).toBe('opus');
    expect(config.cache.enabled).toBe(false);
    expect(config.cache.ttlMs).toBe(1000);
    expect(config.cache.maxEntries).toBe(5);
  });

  it('stores and retrieves cached entries with TTL enforcement', () => {
    const key = __testUtils.buildCacheKey(
      {
        content: 'hello',
        focus: ['testing'],
        style: 'structured'
      },
      'claude_code'
    );

    expect(__testUtils.getCacheEntry(key, 1000)).toBeNull();

    __testUtils.storeCacheEntry(
      key,
      {
        agent: 'claude_code',
        model: 'sonnet',
        text: 'review text'
      },
      10
    );

    const cached = __testUtils.getCacheEntry(key, 1000);
    expect(cached).not.toBeNull();
    expect(cached?.agent.text).toBe('review text');

    const expired = __testUtils.getCacheEntry(key, -1);
    expect(expired).toBeNull();
  });
});
