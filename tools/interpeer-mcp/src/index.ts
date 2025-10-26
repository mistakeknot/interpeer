import { execFile, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { readFileSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { generateText } from 'ai';
import { claudeCode, type ClaudeCodeSettings } from 'ai-sdk-provider-claude-code';
import { codexCli, type CodexCliSettings } from 'ai-sdk-provider-codex-cli';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables before we do any other work.
loadEnv();

const MAX_CLI_BUFFER = 5 * 1024 * 1024;

type TargetAgent = string;
type SettingSource = 'user' | 'project' | 'local';

const DEFAULT_TARGET_AGENT: TargetAgent = 'claude_code';
const VALID_TARGET_AGENTS = ['claude_code', 'codex_cli', 'factory_droid'] as const;
const DEFAULT_CLAUDE_MODEL = 'sonnet';
const DEFAULT_CODEX_MODEL = 'gpt-5-codex';
const DEFAULT_FACTORY_COMMAND = 'factory';
const DEFAULT_FACTORY_MODEL = 'factory-droid';
const SEND_USAGE_METADATA = true;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 2000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CACHE_MAX_ENTRIES = 50;

const ALLOWED_SETTING_SOURCES = new Set<SettingSource>(['user', 'project', 'local']);

let server: McpServer | undefined;
let started = false;
let projectRootPath = __dirname;
let runtimeConfig: InterpeerConfig | undefined;

let defaultTargetAgent: TargetAgent = (() => {
  const envValue = process.env.INTERPEER_DEFAULT_AGENT?.trim();
  if (envValue && VALID_TARGET_AGENTS.includes(envValue as (typeof VALID_TARGET_AGENTS)[number])) {
    return envValue as TargetAgent;
  }
  return DEFAULT_TARGET_AGENT;
})();

let defaultModelOverride: string | undefined = process.env.INTERPEER_DEFAULT_MODEL?.trim() || undefined;

let claudeCliChecked = false;
let codexCliChecked = false;
let factoryCliChecked = false;
const resultCache = new Map<string, CachedEntry>();

const reviewInputSchema = z.object({
  content: z
    .string()
    .min(1, 'content must include text to review')
    .describe('Primary text (code, design doc, etc.) that the peer reviewer should analyze'),
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
    .describe('Optional time budget hint for downstream agents (currently informational only)'),
  review_type: z
    .enum([
      'general',
      'code',
      'design',
      'architecture',
      'security_audit',
      'brainstorm_alternatives'
    ])
    .optional()
    .describe('Template to apply (general default). Picks tailored guidance for the target agent.'),
  target_agent: z
    .enum(['claude_code', 'codex_cli', 'factory_droid'])
    .optional()
    .describe('Target agent that should produce the second opinion (defaults to Claude Code)'),
  target_model: z
    .string()
    .optional()
    .describe('Override the model identifier for the selected agent'),
  resource_paths: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional list of file paths (relative to project root) to include in the review content')
});

type ReviewInput = z.infer<typeof reviewInputSchema>;

interface AgentReviewResult {
  agent: TargetAgent;
  model: string;
  text: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  cacheStatus?: 'hit' | 'miss';
}

type ReviewTemplateId =
  | 'general'
  | 'code'
  | 'design'
  | 'architecture'
  | 'security_audit'
  | 'brainstorm_alternatives';

interface ReviewTemplate {
  id: ReviewTemplateId;
  title: string;
  description: string;
  guidance: string[];
}

const REVIEW_TEMPLATES: Record<ReviewTemplateId, ReviewTemplate> = {
  general: {
    id: 'general',
    title: 'General Review',
    description:
      'Provide a balanced critique that covers technical accuracy, clarity, and overall quality.',
    guidance: [
      'Call out any correctness issues or missing requirements.',
      'Highlight areas that work well or demonstrate strong craft.',
      'Note opportunities to improve maintainability or readability.'
    ]
  },
  code: {
    id: 'code',
    title: 'Code Review',
    description:
      'Assess code correctness, safety, and maintainability using interpeer review conventions.',
    guidance: [
      'Identify bugs, edge cases, or logic errors.',
      'Evaluate test coverage, error handling, and defensive coding.',
      'Recommend refactorings, abstractions, or style improvements where appropriate.'
    ]
  },
  design: {
    id: 'design',
    title: 'Design Review',
    description:
      'Review design documents for clarity, feasibility, and alignment with project objectives.',
    guidance: [
      'Assess whether requirements and constraints are addressed.',
      'Check for missing considerations (dependencies, risks, rollout plan).',
      'Suggest clarifications, diagrams, or follow-up questions that would de-risk the design.'
    ]
  },
  architecture: {
    id: 'architecture',
    title: 'Architecture Review',
    description:
      'Evaluate architectural choices for scalability, resilience, and alignment with best practices.',
    guidance: [
      'Identify bottlenecks, single points of failure, or unclear responsibilities.',
      'Consider scalability, observability, and operational readiness.',
      'Recommend patterns, tooling, or documentation that would strengthen the architecture.'
    ]
  },
  security_audit: {
    id: 'security_audit',
    title: 'Security Audit',
    description:
      'Inspect the artifact for vulnerabilities, insecure defaults, and missing hardening steps.',
    guidance: [
      'Highlight authentication, authorization, and input validation gaps.',
      'Check secrets handling, logging of sensitive data, and dependency risk.',
      'Recommend mitigations such as sanitization, rate limiting, or policy enforcement.'
    ]
  },
  brainstorm_alternatives: {
    id: 'brainstorm_alternatives',
    title: 'Brainstorm Alternatives',
    description:
      'Generate alternative approaches, trade-offs, and creative options for the problem at hand.',
    guidance: [
      'List at least two viable alternatives with pros and cons.',
      'Identify experiments or spikes that would de-risk the decision.',
      'Call out assumptions and suggest questions that should be answered next.'
    ]
  }
};

interface RetrySettings {
  maxAttempts: number;
  baseDelayMs: number;
}

interface ClaudeAgentConfig {
  model: string;
  settingSources?: SettingSource[];
  customSystemPrompt?: string;
  command?: string;
  retry: RetrySettings;
}

interface CodexAgentConfig {
  model: string;
  command: string;
  profile?: string;
  verbose: boolean;
  retry: RetrySettings;
}

interface FactoryAgentConfig {
  command: string;
  model: string;
  extraArgs: string[];
  format: string;
  retry: RetrySettings;
}

interface LoggingConfig {
  enabled: boolean;
  redactContent: boolean;
}

interface InterpeerConfig {
  agents: {
    claude: ClaudeAgentConfig;
    codex: CodexAgentConfig;
    factory: FactoryAgentConfig;
  };
  logging: LoggingConfig;
  cache: {
    enabled: boolean;
    ttlMs: number;
    maxEntries: number;
  };
  defaults?: {
    agent: TargetAgent;
    model?: string;
  };
}

interface CachedEntry {
  timestamp: number;
  agent: AgentReviewResult;
}

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
      'interpeer_review',
      {
        title: 'Request peer review through Interpeer',
        description:
          'Ask another agent (Claude Code, Codex CLI, Factory Droid) to review code, designs, or approaches using interpeer conventions',
        inputSchema: reviewInputSchema.shape
      },
      async (input) => {
        const targetAgent: TargetAgent = input.target_agent ?? DEFAULT_TARGET_AGENT;

        try {
          const result = await routeReview(input);

          await server?.sendLoggingMessage({
            level: 'info',
            message: `${result.agent} second opinion generated successfully.`,
            data: {
              agent: result.agent,
              model: result.model,
              usage: result.usage,
              cache: result.cacheStatus
            }
          });

          const outputContent = [{ type: 'text' as const, text: result.text }];

          if (SEND_USAGE_METADATA) {
            return {
              content: outputContent,
              _meta: {
                agent: result.agent,
                model: result.model,
                usage: result.usage,
                cache: result.cacheStatus
              }
            };
          }

          return {
            content: outputContent,
            _meta: {
              agent: result.agent,
              cache: result.cacheStatus
            }
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown error invoking peer review agent';

          await server?.sendLoggingMessage({
            level: 'error',
            message: 'Failed to generate peer review.',
            data: {
              agent: targetAgent,
              error: message
            }
          });

          return {
            content: [
              {
                type: 'text' as const,
                text: `Peer review failed: ${message}`
              }
            ],
            _meta: {
              agent: targetAgent,
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
  projectRootPath = projectRoot;
  runtimeConfig = loadConfig(projectRootPath);

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
      tools: ['interpeer_review']
    }
  });
}

export default bootstrapServer;

export const __testUtils = {
  buildPromptBundle,
  prepareInput,
  buildCacheKey,
  getCacheEntry,
  storeCacheEntry,
  ensureConfig,
  loadConfig,
  setProjectRoot(projectRoot: string) {
    projectRootPath = projectRoot;
    runtimeConfig = undefined;
    resultCache.clear();
  },
  setDefaultAgent(agent: TargetAgent) {
    setDefaultAgentOverride(agent);
  },
  setDefaultModel(model?: string) {
    setDefaultModelOverride(model);
  },
  clearCache() {
    resultCache.clear();
  }
};

export function setDefaultAgentOverride(agent: TargetAgent) {
  defaultTargetAgent = agent;
}

export function setDefaultModelOverride(model?: string) {
  defaultModelOverride = model?.trim() || undefined;
}

async function routeReview(input: ReviewInput): Promise<AgentReviewResult> {
  const config = ensureConfig();
  const agent = input.target_agent ?? defaultTargetAgent;
  const prepared = await prepareInput(input);

  const explicitModel = prepared.target_model?.trim();
  const defaultModelForAgent = !input.target_agent ? defaultModelOverride : undefined;
  const modelOverride = explicitModel ?? defaultModelForAgent;

  const cacheEnabled = config.cache.enabled;
  const cacheKey = buildCacheKey(prepared, agent, modelOverride);

  if (cacheEnabled) {
    const cached = getCacheEntry(cacheKey, config.cache.ttlMs);
    if (cached) {
      await logReviewMetrics(agent, cached.agent.model, 'hit', cached.agent.usage);
      return { ...cached.agent, cacheStatus: 'hit' };
    }
  }

  let result: AgentReviewResult;
  switch (agent) {
    case 'claude_code':
      result = await runClaudeCodeReview(prepared, config.agents.claude, modelOverride);
      break;
    case 'codex_cli':
      result = await runCodexReview(prepared, config.agents.codex, modelOverride);
      break;
    case 'factory_droid':
      result = await runFactoryReview(prepared, config.agents.factory, modelOverride);
      break;
    default:
      throw new Error(`Unsupported target agent: ${agent}`);
  }

  result.cacheStatus = 'miss';

  if (cacheEnabled) {
    storeCacheEntry(cacheKey, result, config.cache.maxEntries);
  }

  await logReviewMetrics(agent, result.model, result.cacheStatus, result.usage);

  return result;
}

async function runClaudeCodeReview(
  input: ReviewInput,
  config: ClaudeAgentConfig,
  modelOverride?: string
): Promise<AgentReviewResult> {
  ensureClaudeCliAvailable(config.command);
  const modelId = modelOverride ?? config.model;

  const settings: ClaudeCodeSettings = {
    cwd: projectRootPath
  };

  if (config.settingSources) {
    settings.settingSources = config.settingSources;
  }

  if (config.customSystemPrompt) {
    settings.customSystemPrompt = config.customSystemPrompt;
  }

  const { system, user } = buildPromptBundle(input);

  const result = await withRetries(
    async () =>
      generateText({
        model: claudeCode(modelId, settings),
        system,
        messages: [
          {
            role: 'user',
            content: user
          }
        ]
      }),
    config.retry,
    'Claude Code'
  );

  const usage = result.usage
    ? {
        input_tokens: result.usage.inputTokens ?? undefined,
        output_tokens: result.usage.outputTokens ?? undefined,
        total_tokens: result.usage.totalTokens ?? undefined
      }
    : undefined;

  return {
    agent: 'claude_code',
    model: modelId,
    text: result.text.trim() || 'Claude Code returned an empty response.',
    usage
  };
}

async function runCodexReview(
  input: ReviewInput,
  config: CodexAgentConfig,
  modelOverride?: string
): Promise<AgentReviewResult> {
  ensureCodexCliAvailable(config.command);

  const modelId = modelOverride ?? config.model;
  const settings: CodexCliSettings = {
    cwd: projectRootPath,
    profile: config.profile,
    verbose: config.verbose
  };

  const { system, user } = buildPromptBundle(input);

  const result = await withRetries(
    async () =>
      generateText({
        model: codexCli(modelId, settings),
        system,
        messages: [
          {
            role: 'user',
            content: user
          }
        ]
      }),
    config.retry,
    'Codex CLI'
  );

  const usage = result.usage
    ? {
        input_tokens: result.usage.inputTokens ?? undefined,
        output_tokens: result.usage.outputTokens ?? undefined,
        total_tokens: result.usage.totalTokens ?? undefined
      }
    : undefined;

  return {
    agent: 'codex_cli',
    model: modelId,
    text: result.text.trim() || 'Codex CLI returned an empty response.',
    usage
  };
}

async function runFactoryReview(
  input: ReviewInput,
  config: FactoryAgentConfig,
  modelOverride?: string
): Promise<AgentReviewResult> {
  ensureFactoryCliAvailable(config.command);

  const prompt = buildCrossAgentPrompt(input);
  const args = ['ask', '--format', config.format, ...config.extraArgs, prompt];

  const stdout = await withRetries(
    async () => runCliCommand(config.command, args, 'Factory CLI'),
    config.retry,
    'Factory CLI'
  );
  const text = stdout.trim();

  return {
    agent: 'factory_droid',
    model: modelOverride ?? config.model,
    text: text || 'Factory CLI returned an empty response.'
  };
}

function ensureClaudeCliAvailable(command?: string): void {
  if (claudeCliChecked) return;
  runCliCheck(command ?? process.env.INTERPEER_CLAUDE_COMMAND?.trim() ?? 'claude', 'Claude Code CLI');
  claudeCliChecked = true;
}

function ensureCodexCliAvailable(command?: string): void {
  if (codexCliChecked) return;
  runCliCheck(command ?? process.env.INTERPEER_CODEX_COMMAND?.trim() ?? 'codex', 'Codex CLI');
  codexCliChecked = true;
}

function ensureFactoryCliAvailable(command?: string): void {
  if (factoryCliChecked) return;
  runCliCheck(
    command ?? process.env.INTERPEER_FACTORY_COMMAND?.trim() ?? DEFAULT_FACTORY_COMMAND,
    'Factory CLI'
  );
  factoryCliChecked = true;
}

function runCliCheck(command: string, label: string): void {
  try {
    const result = spawnSync(command, ['--version'], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      throw result.error ?? new Error(result.stderr?.toString() || 'Unknown CLI error');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${label} not available. Ensure the CLI is installed and on your PATH. Underlying error: ${message}`
    );
  }
}

async function runCliCommand(command: string, args: string[], label: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      cwd: projectRootPath,
      maxBuffer: MAX_CLI_BUFFER,
      env: process.env
    });
    return stdout.toString();
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} command failed: ${stderr?.trim() || message}`);
  }
}

interface PromptBundle {
  system: string;
  user: string;
}

function buildPromptBundle(input: ReviewInput): PromptBundle {
  const { content, focus, style, review_type, time_budget_seconds: timeBudget } = input;

  const templateId: ReviewTemplateId = review_type ?? 'general';
  const template = REVIEW_TEMPLATES[templateId] ?? REVIEW_TEMPLATES.general;

  const focusSection =
    focus && focus.length
      ? [
          'Primary focus areas:',
          ...focus.map((item) => `- ${item}`),
          '',
          'Address these ahead of other observations when prioritizing your response.'
        ].join('\n')
      : 'Primary focus areas: General review (use judgment to highlight the most important themes).';

  const baseSystem = [
    'You are acting as an expert reviewer for Interpeer.',
    'Deliver actionable, empathetic, and technically precise feedback.',
    'Use the user’s preferred response style.',
    'Only comment on the provided content; do not assume file context beyond what is included.'
  ].join(' ');

  const templateGuidance = [
    `Review profile: ${template.title} — ${template.description}`,
    ...template.guidance.map((item) => `- ${item}`)
  ].join('\n');

  const timeBudgetGuidance = timeBudget
    ? `Aim to deliver the most critical insights within approximately ${timeBudget} seconds. Prefer concise, high-value observations over exhaustive analysis.`
    : 'Be concise but thorough, focusing on the highest-impact observations.';

  const structuredInstructions =
    style === 'freeform'
      ? 'Provide a concise narrative assessment with clear paragraphs and transitions.'
      : [
          'Respond using markdown sections with headings:',
          '## Strengths',
          '## Concerns',
          '## Recommendations',
          'Include short bullet points under each heading. If a category has no items, write "None noted."'
        ].join(' ');

  const system = [
    baseSystem,
    templateGuidance,
    timeBudgetGuidance,
    structuredInstructions
  ]
    .filter(Boolean)
    .join(' ');

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

function buildCrossAgentPrompt(input: ReviewInput): string {
  const { system, user } = buildPromptBundle(input);

  return [
    'Provide a second-opinion review following the instructions below.',
    '',
    system,
    '',
    user,
    '',
    'Return your findings now.'
  ].join('\n');
}

async function prepareInput(input: ReviewInput): Promise<ReviewInput> {
  if (!input.resource_paths || input.resource_paths.length === 0) {
    return input;
  }

  const resourceSections: string[] = [];
  for (const relativePath of input.resource_paths) {
    const fullPath = resolve(projectRootPath, relativePath);
    try {
      const data = await readFile(fullPath, 'utf8');
      resourceSections.push(
        [`# File: ${relativePath}`, '```', data, '```'].join('\n')
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read resource '${relativePath}': ${message}`);
    }
  }

  const combinedContent = [input.content, ...resourceSections].filter(Boolean).join('\n\n');

  return {
    ...input,
    content: combinedContent
  };
}

function buildCacheKey(input: ReviewInput, agent: TargetAgent, modelOverride?: string): string {
  return JSON.stringify({
    agent,
    content: input.content,
    focus: input.focus ?? [],
    style: input.style ?? 'structured',
    review_type: input.review_type ?? 'general',
    time_budget_seconds: input.time_budget_seconds ?? null,
    target_model: modelOverride ?? input.target_model ?? null
  });
}

function getCacheEntry(key: string, ttlMs: number): CachedEntry | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    resultCache.delete(key);
    return null;
  }
  return {
    timestamp: entry.timestamp,
    agent: { ...entry.agent }
  };
}

function storeCacheEntry(key: string, result: AgentReviewResult, maxEntries: number): void {
  const storedAgent: AgentReviewResult = { ...result, cacheStatus: undefined };
  resultCache.set(key, { timestamp: Date.now(), agent: storedAgent });

  while (resultCache.size > maxEntries) {
    const oldestKey = resultCache.keys().next().value;
    if (!oldestKey) break;
    resultCache.delete(oldestKey);
  }
}

async function logReviewMetrics(
  agent: TargetAgent,
  model: string,
  cacheStatus: 'hit' | 'miss',
  usage?: AgentReviewResult['usage']
): Promise<void> {
  const config = ensureConfig();
  if (!config.logging.enabled) return;

  const data: Record<string, unknown> = {
    agent,
    model,
    cache: cacheStatus
  };

  if (usage && !config.logging.redactContent) {
    data.usage = {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens
    };
  }

  await server?.sendLoggingMessage({
    level: 'info',
    message: 'interpeer.review.metrics',
    data
  });
}

function ensureConfig(): InterpeerConfig {
  if (!runtimeConfig) {
    runtimeConfig = loadConfig(projectRootPath);
  }
  return runtimeConfig;
}

function loadConfig(projectRoot: string): InterpeerConfig {
  const configPath = process.env.INTERPEER_CONFIG_PATH?.trim() || '.taskmaster/interpeer.config.json';
  let fileOverrides: Partial<InterpeerConfig> | null = null;

  const fullConfigPath = resolve(projectRoot, configPath);
  try {
    accessSync(fullConfigPath, constants.F_OK);
    const fileContents = readFileSync(fullConfigPath, 'utf8');
    fileOverrides = JSON.parse(fileContents) as Partial<InterpeerConfig>;
  } catch (error) {
    if (process.env.INTERPEER_CONFIG_PATH) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load interpeer config file at ${fullConfigPath}: ${message}`);
    }
  }

  const parseIntEnv = (value: string | undefined, fallback: number) => {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const parseBool = (value: string | undefined, fallback = false) => {
    if (!value) return fallback;
    return value.toLowerCase() === 'true';
  };

  const baseRetry: RetrySettings = {
    maxAttempts: parseIntEnv(process.env.INTERPEER_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    baseDelayMs: parseIntEnv(process.env.INTERPEER_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS)
  };

  const claudeSettingSources = parseSettingSources(process.env.INTERPEER_CLAUDE_SETTING_SOURCES);

  if (fileOverrides?.defaults?.agent) {
    setDefaultAgentOverride(fileOverrides.defaults.agent as TargetAgent);
  }

  if (fileOverrides?.defaults && 'model' in fileOverrides.defaults) {
    setDefaultModelOverride(fileOverrides.defaults.model as string | undefined);
  }

  const config: InterpeerConfig = {
    agents: {
      claude: {
        model: process.env.INTERPEER_CLAUDE_MODEL?.trim() || DEFAULT_CLAUDE_MODEL,
        settingSources: claudeSettingSources,
        customSystemPrompt: process.env.INTERPEER_CLAUDE_CUSTOM_SYSTEM_PROMPT?.trim(),
        command: process.env.INTERPEER_CLAUDE_COMMAND?.trim(),
        retry: {
          maxAttempts: parseIntEnv(
            process.env.INTERPEER_CLAUDE_MAX_RETRIES,
            baseRetry.maxAttempts
          ),
          baseDelayMs: parseIntEnv(
            process.env.INTERPEER_CLAUDE_RETRY_DELAY_MS,
            baseRetry.baseDelayMs
          )
        }
      },
      codex: {
        model: process.env.INTERPEER_CODEX_MODEL?.trim() || DEFAULT_CODEX_MODEL,
        command: process.env.INTERPEER_CODEX_COMMAND?.trim() || 'codex',
        profile: process.env.INTERPEER_CODEX_PROFILE?.trim(),
        verbose: parseBool(process.env.INTERPEER_CODEX_VERBOSE),
        retry: {
          maxAttempts: parseIntEnv(
            process.env.INTERPEER_CODEX_MAX_RETRIES,
            baseRetry.maxAttempts
          ),
          baseDelayMs: parseIntEnv(
            process.env.INTERPEER_CODEX_RETRY_DELAY_MS,
            baseRetry.baseDelayMs
          )
        }
      },
      factory: {
        command: process.env.INTERPEER_FACTORY_COMMAND?.trim() || DEFAULT_FACTORY_COMMAND,
        model: process.env.INTERPEER_FACTORY_MODEL?.trim() || DEFAULT_FACTORY_MODEL,
        extraArgs: parseExtraArgs(process.env.INTERPEER_FACTORY_EXTRA_ARGS),
        format: process.env.INTERPEER_FACTORY_FORMAT?.trim() || 'markdown',
        retry: {
          maxAttempts: parseIntEnv(
            process.env.INTERPEER_FACTORY_MAX_RETRIES,
            baseRetry.maxAttempts
          ),
          baseDelayMs: parseIntEnv(
            process.env.INTERPEER_FACTORY_RETRY_DELAY_MS,
            baseRetry.baseDelayMs
          )
        }
      }
    },
    logging: {
      enabled: parseBool(process.env.INTERPEER_LOGGING_ENABLED, true),
      redactContent: parseBool(process.env.INTERPEER_LOGGING_REDACT_CONTENT, true)
    },
    cache: {
      enabled: parseBool(process.env.INTERPEER_CACHE_ENABLED, true),
      ttlMs: parseIntEnv(process.env.INTERPEER_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS),
      maxEntries: parseIntEnv(
        process.env.INTERPEER_CACHE_MAX_ENTRIES,
        DEFAULT_CACHE_MAX_ENTRIES
      )
    },
    defaults: {
      agent: defaultTargetAgent,
      model: defaultModelOverride
    }
  };

  if (fileOverrides) {
    if (fileOverrides.agents?.claude) {
      config.agents.claude = {
        ...config.agents.claude,
        ...fileOverrides.agents.claude,
        retry: {
          ...config.agents.claude.retry,
          ...fileOverrides.agents.claude.retry
        }
      };
    }

    if (fileOverrides.agents?.codex) {
      config.agents.codex = {
        ...config.agents.codex,
        ...fileOverrides.agents.codex,
        retry: {
          ...config.agents.codex.retry,
          ...fileOverrides.agents.codex.retry
        }
      };
    }

    if (fileOverrides.agents?.factory) {
      config.agents.factory = {
        ...config.agents.factory,
        ...fileOverrides.agents.factory,
        retry: {
          ...config.agents.factory.retry,
          ...fileOverrides.agents.factory.retry
        }
      };
    }

    if (fileOverrides.agents) {
      const customEntries = Object.entries(fileOverrides.agents).filter(
        ([key]) => !['claude', 'codex', 'factory'].includes(key)
      );

      for (const [id, adapter] of customEntries) {
        if (adapter && typeof adapter === 'object') {
          config.agents[id as keyof typeof config.agents] = adapter as never;
        }
      }
    }

    if (fileOverrides.logging) {
      config.logging = {
        ...config.logging,
        ...fileOverrides.logging
      };
    }

    if (fileOverrides.cache) {
      config.cache = {
        ...config.cache,
        ...fileOverrides.cache
      };
    }
  }

  return config;
}

async function withRetries<T>(
  fn: () => Promise<T>,
  retry: RetrySettings,
  label: string
): Promise<T> {
  let attempt = 0;
  let delay = retry.baseDelayMs;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      attempt += 1;
      return await fn();
    } catch (error) {
      if (attempt >= retry.maxAttempts) {
        throw error;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function parseSettingSources(raw: string | undefined): SettingSource[] | undefined {
  if (!raw) return undefined;

  const sources = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is SettingSource => ALLOWED_SETTING_SOURCES.has(value as SettingSource));

  return sources.length ? sources : undefined;
}

function parseExtraArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}
