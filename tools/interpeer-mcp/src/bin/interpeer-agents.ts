#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import {
  __testUtils,
  setDefaultAgentOverride,
  setDefaultModelOverride
} from '../index.js';

interface RetryCLISettings {
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_CONFIG_PATH = '.taskmaster/interpeer.config.json';
const VALID_AGENTS = ['claude_code', 'codex_cli', 'factory_droid'];
const RESERVED_AGENT_IDS = new Set(['claude', 'codex', 'factory']);
const AGENT_ID_PATTERN = /^[a-z0-9_-]+$/;

type FlagMap = Map<string, string>;

const GLOBAL_FLAGS = new Set(['--project-root', '--config']);
const HELP_FLAGS = new Set(['-h', '--help']);
const COMMAND_FLAG_SPEC: Record<
  string,
  {
    allowed: Set<string>;
    required?: Set<string>;
  }
> = {
  list: {
    allowed: new Set()
  },
  'list-agents': {
    allowed: new Set()
  },
  'set-default': {
    allowed: new Set(['--agent', '--model'])
  },
  'set-agent': {
    allowed: new Set(['--id', '--command', '--model']),
    required: new Set(['--id'])
  },
  'add-agent': {
    allowed: new Set(['--id', '--command', '--model', '--max-attempts', '--base-delay']),
    required: new Set(['--id', '--command', '--model'])
  },
  'remove-agent': {
    allowed: new Set(['--id']),
    required: new Set(['--id'])
  }
};

type Command =
  | { kind: 'list'; projectRoot: string; configPath?: string }
  | { kind: 'set-default'; projectRoot: string; configPath?: string; agent?: string; model?: string }
  | { kind: 'set-agent'; projectRoot: string; configPath?: string; agentId: string; command?: string; model?: string }
  | { kind: 'list-agents'; projectRoot: string; configPath?: string }
  | {
      kind: 'add-agent';
      projectRoot: string;
      configPath?: string;
      agentId: string;
      command: string;
      model: string;
      retry?: RetryCLISettings;
    }
  | { kind: 'remove-agent'; projectRoot: string; configPath?: string; agentId: string };

export function shouldShowHelp(argv: string[]): boolean {
  if (argv.length === 0) return false;
  if (argv[0] === 'help') return true;
  return argv.some((token) => HELP_FLAGS.has(token));
}

export function parseCliArgs(argv: string[]): Command {
  const positional: string[] = [];
  const flags: FlagMap = new Map();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const equalsIndex = token.indexOf('=');
    let flag = token;
    let value: string | undefined;

    if (equalsIndex !== -1) {
      flag = token.slice(0, equalsIndex);
      value = token.slice(equalsIndex + 1);
    } else {
      const nextValue = argv[i + 1];
      if (nextValue === undefined || nextValue.startsWith('--')) {
        throw new Error(`Flag ${flag} expects a value`);
      }
      value = nextValue;
      i += 1;
    }

    if (!flag) {
      throw new Error('Encountered malformed flag');
    }

    if (flags.has(flag)) {
      throw new Error(`Flag ${flag} specified multiple times`);
    }

    flags.set(flag, value ?? '');
  }

  const commandName = positional.shift() ?? 'list';
  if (positional.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positional.join(' ')}`);
  }

  const spec = COMMAND_FLAG_SPEC[commandName];
  if (!spec) {
    throw new Error(`Unknown command: ${commandName}`);
  }

  for (const flag of flags.keys()) {
    if (GLOBAL_FLAGS.has(flag)) continue;
    if (!spec.allowed.has(flag)) {
      throw new Error(`Flag ${flag} is not valid for command ${commandName}`);
    }
  }

  if (spec.required) {
    for (const requiredFlag of spec.required) {
      if (!flags.has(requiredFlag)) {
        throw new Error(`${commandName} requires ${requiredFlag}`);
      }
    }
  }

  const projectRootValue = flags.get('--project-root');
  const projectRoot = resolve(projectRootValue ?? process.cwd());
  if (projectRootValue !== undefined) {
    const trimmed = projectRootValue.trim();
    if (!trimmed) {
      throw new Error('--project-root cannot be empty');
    }
    if (!existsSync(projectRoot)) {
      throw new Error(`Project root '${projectRoot}' does not exist`);
    }
    try {
      const stats = statSync(projectRoot);
      if (!stats.isDirectory()) {
        throw new Error(`Project root '${projectRoot}' must be a directory`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to access project root '${projectRoot}': ${message}`);
    }
  }

  const configOverrideRaw = flags.get('--config');
  const configOverride = configOverrideRaw !== undefined ? configOverrideRaw.trim() : undefined;
  if (configOverride !== undefined && !configOverride) {
    throw new Error('--config cannot be empty');
  }

  switch (commandName) {
    case 'list':
      return { kind: 'list', projectRoot, configPath: configOverride };
    case 'list-agents':
      return { kind: 'list-agents', projectRoot, configPath: configOverride };
    case 'set-default': {
      const agent = flags.has('--agent')
        ? normalizeValue(flags.get('--agent'), '--agent')
        : undefined;
      const model = flags.has('--model')
        ? normalizeValue(flags.get('--model'), '--model', { allowEmpty: true })
        : undefined;

      if (!agent && model === undefined) {
        throw new Error('Nothing to update. Provide --agent, --model, or both.');
      }

      return {
        kind: 'set-default',
        projectRoot,
        configPath: configOverride,
        agent,
        model
      };
    }
    case 'set-agent': {
      const agentId = assertValidAgentId(flags.get('--id') ?? '', '--id');
      const commandValue = flags.has('--command')
        ? normalizeValue(flags.get('--command'), '--command')
        : undefined;
      const modelValue = flags.has('--model')
        ? normalizeValue(flags.get('--model'), '--model')
        : undefined;

      if (!commandValue && !modelValue) {
        throw new Error('set-agent requires at least one of --command or --model');
      }

      return {
        kind: 'set-agent',
        projectRoot,
        configPath: configOverride,
        agentId,
        command: commandValue,
        model: modelValue
      };
    }
    case 'add-agent': {
      const agentId = assertValidAgentId(flags.get('--id') ?? '', '--id');
      const commandValue = normalizeValue(flags.get('--command'), '--command');
      const modelValue = normalizeValue(flags.get('--model'), '--model');

      const retry: RetryCLISettings = {};
      if (flags.has('--max-attempts')) {
        retry.maxAttempts = parsePositiveInteger(flags.get('--max-attempts') ?? '', '--max-attempts', {
          min: 1
        });
      }
      if (flags.has('--base-delay')) {
        retry.baseDelayMs = parsePositiveInteger(flags.get('--base-delay') ?? '', '--base-delay', {
          min: 0
        });
      }

      return {
        kind: 'add-agent',
        projectRoot,
        configPath: configOverride,
        agentId,
        command: commandValue,
        model: modelValue,
        retry: Object.keys(retry).length ? retry : undefined
      };
    }
    case 'remove-agent': {
      const agentId = assertValidAgentId(flags.get('--id') ?? '', '--id');
      return { kind: 'remove-agent', projectRoot, configPath: configOverride, agentId };
    }
    default:
      throw new Error(`Unknown command: ${commandName}`);
  }
}

function getConfigPath(projectRoot: string, override?: string): string {
  const relative = override && override.trim().length > 0 ? override.trim() : DEFAULT_CONFIG_PATH;
  return resolve(projectRoot, relative);
}

function normalizeValue(value: string | undefined, flag: string, options?: { allowEmpty?: boolean }): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed && !options?.allowEmpty) {
    throw new Error(`${flag} cannot be empty`);
  }
  return trimmed;
}

function assertValidAgentId(value: string, flag: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${flag} cannot be empty`);
  }
  if (!AGENT_ID_PATTERN.test(trimmed)) {
    throw new Error(`${flag} must use lowercase letters, numbers, underscores, or hyphens`);
  }
  return trimmed;
}

function parsePositiveInteger(
  value: string,
  flag: string,
  options: { min?: number } = {}
): number {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${flag} cannot be empty`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be an integer`);
  }
  const min = options.min ?? 0;
  if (parsed < min) {
    throw new Error(`${flag} must be >= ${min}`);
  }
  return parsed;
}

function loadMergedConfig(projectRoot: string, configPath: string | undefined) {
  const previous = process.env.INTERPEER_CONFIG_PATH;

  try {
    if (configPath) {
      process.env.INTERPEER_CONFIG_PATH = configPath;
    } else {
      delete process.env.INTERPEER_CONFIG_PATH;
    }
    return __testUtils.loadConfig(projectRoot);
  } finally {
    if (previous === undefined) {
      delete process.env.INTERPEER_CONFIG_PATH;
    } else {
      process.env.INTERPEER_CONFIG_PATH = previous;
    }
  }
}

function loadConfigFile(path: string): any {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const raw = readFileSync(path, 'utf8');
    return raw.trim().length ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error(`Failed to read config file at ${path}: ${(error as Error).message}`);
  }
}

function saveConfigFile(path: string, config: any) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function printHelp(): void {
  const lines = [
    'Interpeer Agents CLI',
    '--------------------',
    'Manage interpeer agent defaults and adapter overrides.',
    '',
    'Usage:',
    '  interpeer-agents [command] [options]',
    '',
    'Commands:',
    '  list                         Show current defaults and available adapters',
    '  list-agents                  Show detailed adapter configuration',
    '  set-default                  Update default agent/model (writes config overrides)',
    '  set-agent                    Override a built-in adapter (claude/codex/factory)',
    '  add-agent                    Register a new custom adapter',
    '  remove-agent                 Delete an adapter override',
    '  help                         Display this help message',
    '',
    'Global options:',
    '  --project-root <path>        Resolve configuration relative to this project',
    '  --config <path>              Use a custom interpeer config file',
    '  -h, --help                   Show this help text',
    '',
    'Notes:',
    '  * Built-in adapter IDs (claude, codex, factory) are reserved. Use set-agent to modify them.',
    '  * Add custom adapters with unique IDs (e.g., openrouter, copilot).',
    '  * Provide an empty string to --model when using set-default to clear a default model.',
    '',
    'Examples:',
    '  interpeer-agents list',
    '  interpeer-agents set-default --agent codex_cli --model gpt-5-codex',
    '  interpeer-agents set-default --model ""',
    '  interpeer-agents set-agent --id claude --command claude --model claude-4.5-sonnet',
    '  interpeer-agents add-agent --id openrouter --command or --model anthropic/claude-4.5-sonnet'
  ];

  console.log(lines.join('\n'));
}

function listAction(projectRoot: string, configPath: string) {
  const config = loadMergedConfig(projectRoot, configPath);

  console.log('Interpeer MCP configuration');
  console.log('----------------------------');
  console.log(`Project root: ${projectRoot}`);
  console.log(`Config file: ${configPath}`);
  console.log(`Default agent: ${config.defaults?.agent ?? 'claude_code'}`);
  console.log(`Default model: ${config.defaults?.model ?? 'inherit (agent specific)'}`);
  console.log(`Configured agents: ${Object.keys(config.agents).join(', ')}`);
}

function listAgentsAction(projectRoot: string, configPath: string) {
  const config = loadMergedConfig(projectRoot, configPath);
  console.log('Configured agents');
  console.log('------------------');
  for (const [id, agent] of Object.entries(config.agents)) {
    console.log(`- ${id}`);
    for (const [key, value] of Object.entries(agent)) {
      if (typeof value === 'object' && value !== null) {
        console.log(`    ${key}: ${JSON.stringify(value)}`);
      } else {
        console.log(`    ${key}: ${value}`);
      }
    }
  }
}

function setDefaultAction(projectRoot: string, configPath: string, command: Command) {
  if (!('agent' in command) || (!command.agent && !command.model)) {
    throw new Error('Nothing to update. Provide --agent, --model, or both.');
  }

  const overrides = loadConfigFile(configPath);
  overrides.defaults = overrides.defaults ?? {};

  if (command.agent) {
    if (!VALID_AGENTS.includes(command.agent)) {
      throw new Error(
        `Unsupported agent '${command.agent}'. Valid agents: ${VALID_AGENTS.join(', ')}`
      );
    }
    overrides.defaults.agent = command.agent;
    setDefaultAgentOverride(command.agent as (typeof VALID_AGENTS)[number]);
  }

  if (command.model !== undefined) {
    const trimmed = command.model.trim();
    if (trimmed) {
      overrides.defaults.model = trimmed;
      setDefaultModelOverride(trimmed);
    } else {
      delete overrides.defaults.model;
      setDefaultModelOverride(undefined);
    }
  }

  saveConfigFile(configPath, overrides);
  console.log(`Updated config at ${configPath}`);
}

function setAgentAction(projectRoot: string, configPath: string, command: Command & { kind: 'set-agent' }) {
  const overrides = loadConfigFile(configPath);
  overrides.agents = overrides.agents ?? {};

  const currentConfig = loadMergedConfig(projectRoot, configPath);
  const availableAgents = currentConfig.agents as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(availableAgents, command.agentId)) {
    throw new Error(
      `Agent '${command.agentId}' is not defined. Use add-agent to register new agents first.`
    );
  }

  const target = overrides.agents[command.agentId] ?? {};
  if (command.command) target.command = command.command;
  if (command.model) target.model = command.model;

  overrides.agents[command.agentId] = target;
  saveConfigFile(configPath, overrides);
  console.log(`Updated agent '${command.agentId}' in ${configPath}`);
}

function addAgentAction(projectRoot: string, configPath: string, command: Command & { kind: 'add-agent' }) {
  const overrides = loadConfigFile(configPath);
  overrides.agents = overrides.agents ?? {};

  if (RESERVED_AGENT_IDS.has(command.agentId)) {
    throw new Error(
      `Agent id '${command.agentId}' is reserved. Use set-agent to customize built-in adapters.`
    );
  }

  const merged = loadMergedConfig(projectRoot, configPath);
  if (command.agentId in merged.agents || command.agentId in overrides.agents) {
    throw new Error(
      `Agent '${command.agentId}' already exists. Use set-agent to update it or remove-agent to delete the override.`
    );
  }

  const retrySettings =
    command.retry && Object.keys(command.retry).length
      ? {
          ...(command.retry.maxAttempts !== undefined
            ? { maxAttempts: command.retry.maxAttempts }
            : {}),
          ...(command.retry.baseDelayMs !== undefined
            ? { baseDelayMs: command.retry.baseDelayMs }
            : {})
        }
      : undefined;

  overrides.agents[command.agentId] = {
    command: command.command,
    model: command.model,
    ...(retrySettings ? { retry: retrySettings } : {})
  };

  saveConfigFile(configPath, overrides);
  console.log(`Added agent '${command.agentId}' to ${configPath}`);
}

function removeAgentAction(configPath: string, command: Command & { kind: 'remove-agent' }) {
  const overrides = loadConfigFile(configPath);
  if (!overrides.agents || !overrides.agents[command.agentId]) {
    throw new Error(`Agent '${command.agentId}' not found in config`);
  }

  delete overrides.agents[command.agentId];
  saveConfigFile(configPath, overrides);
  console.log(`Removed agent '${command.agentId}' from ${configPath}`);
}

async function main() {
  const argv = process.argv.slice(2);

  if (shouldShowHelp(argv)) {
    printHelp();
    return;
  }

  let parsed: Command;
  try {
    parsed = parseCliArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
    return;
  }

  const configPath = getConfigPath(parsed.projectRoot, parsed.configPath);

  try {
    switch (parsed.kind) {
      case 'list':
        listAction(parsed.projectRoot, configPath);
        break;
      case 'list-agents':
        listAgentsAction(parsed.projectRoot, configPath);
        break;
      case 'set-default':
        setDefaultAction(parsed.projectRoot, configPath, parsed);
        break;
      case 'set-agent':
        setAgentAction(parsed.projectRoot, configPath, parsed);
        break;
      case 'add-agent':
        addAgentAction(parsed.projectRoot, configPath, parsed);
        break;
      case 'remove-agent':
        removeAgentAction(configPath, parsed);
        break;
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  await main();
}
