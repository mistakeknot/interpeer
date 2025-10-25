import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { generateText } from 'ai';
import { claudeCode, type ClaudeCodeSettings } from 'ai-sdk-provider-claude-code';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables before we do any other work.
loadEnv();

let server: McpServer | undefined;
let started = false;
let claudeCliChecked = false;

const claudeReviewInputSchema = z.object({
  content: z
    .string()
    .min(1, 'content must include text to review')
    .describe('Primary text (code, design doc, etc.) that Claude should analyze'),
  focus: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional list of focus areas like security, architecture, performance'),
  style: z
    .enum(['structured', 'freeform'])
    .optional()
    .describe('Controls whether the response should follow the interpeer structure'),
  time_budget_seconds: z
    .number()
    .int()
    .min(30)
    .max(600)
    .optional()
    .describe('Optional time budget hint for downstream agents (currently informational only)')
});

type ClaudeReviewInput = z.infer<typeof claudeReviewInputSchema>;

const DEFAULT_MODEL = 'sonnet';
const SEND_USAGE_METADATA = true;
type SettingSource = 'user' | 'project' | 'local';
const ALLOWED_SETTING_SOURCES = new Set<SettingSource>(['user', 'project', 'local']);

async function loadPackageVersion(): Promise<string> {
  try {
    const packagePath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { version?: string };
    return packageJson.version ?? '0.0.0';
  } catch (error) {
    console.warn('Unable to read package version, defaulting to 0.0.0', error);
    return '0.0.0';
  }
}

function ensureServerInstance(version: string): McpServer {
  if (!server) {
    server = new McpServer({
      name: 'interpeer-mcp',
      version
    });

    server.registerTool(
      'claude_review',
      {
        title: 'Request Claude review',
        description: 'Ask Claude to review code, designs, or approaches using interpeer conventions',
        inputSchema: claudeReviewInputSchema.shape
      },
      async (input) => {
        try {
          const result = await handleClaudeReview(input);

          await server?.sendLoggingMessage({
            level: 'info',
            message: 'Claude review generated successfully.',
            data: {
              model: result.model,
              usage: result.usage
            }
          });

          const outputContent = [{ type: 'text' as const, text: result.text }];

          if (SEND_USAGE_METADATA && result.usage) {
            return {
              content: outputContent,
              _meta: {
                model: result.model,
                usage: result.usage
              }
            };
          }

          return { content: outputContent };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error invoking Claude Code';

          await server?.sendLoggingMessage({
            level: 'error',
            message: 'Failed to generate Claude review.',
            data: {
              error: message
            }
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: `Claude review failed: ${message}`
              }
            ],
            _meta: {
              error: true
            }
          };
        }
      }
    );
  }

  return server;
}

export interface ServerBootstrapOptions {
  /**
   * Absolute path to the project root. Defaults to the directory containing the compiled entry point.
   */
  projectRoot?: string;
}

export async function bootstrapServer(options: ServerBootstrapOptions = {}): Promise<void> {
  if (started) {
    await server?.sendLoggingMessage({
      level: 'info',
      message: 'Interpeer MCP server already running.',
      data: { projectRoot: options.projectRoot }
    });
    return;
  }

  const projectRoot = options.projectRoot ? resolve(options.projectRoot) : __dirname;
  const version = await loadPackageVersion();
  const instance = ensureServerInstance(version);

  const transport = new StdioServerTransport();

  await instance.connect(transport);

  started = true;

  await instance.sendLoggingMessage({
    level: 'info',
    message: 'Interpeer MCP server started.',
    data: {
      projectRoot,
      tools: ['claude_review']
    }
  });
}

export default bootstrapServer;

function ensureClaudeCliAvailable(): void {
  if (claudeCliChecked) return;

  try {
    const result = spawnSync('claude', ['--version'], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      throw result.error ?? new Error(result.stderr?.toString() || 'Unknown CLI error');
    }
    claudeCliChecked = true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Claude Code CLI could not be detected.';
    throw new Error(
      [
        'Claude Code CLI not available.',
        'Install it with `npm install -g @anthropic-ai/claude-code` and authenticate via `claude login`.',
        `Underlying error: ${message}`
      ].join(' ')
    );
  }
}

function isSettingSource(value: string): value is SettingSource {
  return ALLOWED_SETTING_SOURCES.has(value as SettingSource);
}

function parseSettingSources(): SettingSource[] | undefined {
  const raw = process.env.INTERPEER_CLAUDE_SETTING_SOURCES;
  if (!raw) return undefined;

  const sources = raw
    .split(',')
    .map((value) => value.trim())
    .filter(isSettingSource);

  return sources.length ? sources : undefined;
}

interface ClaudeReviewResult {
  text: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

function buildClaudePrompts(input: ClaudeReviewInput): { system: string; user: string } {
  const { content, focus, style } = input;

  const focusSection =
    focus && focus.length
      ? `Primary focus areas:\n${focus.map((item) => `- ${item}`).join('\n')}`
      : 'Primary focus areas: General review.';

  const baseSystem = [
    'You are acting as an expert reviewer for Interpeer.',
    'Deliver actionable, empathetic, and technically precise feedback.',
    'Use the users preferred response style.',
    'Only comment on the provided content; do not assume file context beyond what is included.'
  ].join(' ');

  const structuredInstructions =
    style === 'freeform'
      ? 'Provide a concise narrative assessment.'
      : [
          'Respond using markdown sections with headings:',
          '## Strengths',
          '## Concerns',
          '## Recommendations',
          'Include short bullet points under each heading. If a category has no items, write "None noted."'
        ].join(' ');

  const system = `${baseSystem} ${structuredInstructions}`;

  const user = [
    focusSection,
    '',
    'Content to review:',
    '```',
    content.trim(),
    '```'
  ].join('\n');

  return { system, user };
}

async function handleClaudeReview(input: ClaudeReviewInput): Promise<ClaudeReviewResult> {
  ensureClaudeCliAvailable();

  const modelId = (process.env.INTERPEER_CLAUDE_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const settingSources = parseSettingSources();
  const modelSettings: ClaudeCodeSettings | undefined = settingSources
    ? { settingSources }
    : undefined;

  const { system, user } = buildClaudePrompts(input);

  const result = await generateText({
    model: claudeCode(modelId, modelSettings),
    system,
    messages: [
      {
        role: 'user',
        content: user
      }
    ]
  });

  const text = result.text.trim();

  const usage = result.usage
    ? {
        input_tokens: result.usage.inputTokens ?? undefined,
        output_tokens: result.usage.outputTokens ?? undefined,
        total_tokens: result.usage.totalTokens ?? undefined
      }
    : undefined;

  return {
    text: text || 'Claude Code returned an empty response.',
    model: modelId,
    usage
  };
}
