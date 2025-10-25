#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import {
  __testUtils,
  setDefaultAgentOverride,
  setDefaultModelOverride
} from '../index.js';

const DEFAULT_CONFIG_PATH = '.taskmaster/interpeer.config.json';
const VALID_AGENTS = ['claude_code', 'codex_cli', 'factory_droid'];

interface CLIOptions {
  projectRoot: string;
  configPath?: string;
  agent?: string;
  model?: string;
}

function parseArgs(argv: string[]): { command: string; options: CLIOptions } {
  const options: CLIOptions = {
    projectRoot: process.cwd()
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const [flag, inline] = token.split('=');
    const nextValue = inline ?? argv[i + 1];

    switch (flag) {
      case '--project-root':
        if (nextValue) {
          options.projectRoot = resolve(nextValue);
          if (!inline) i += 1;
        }
        break;
      case '--config':
        if (nextValue) {
          options.configPath = nextValue;
          if (!inline) i += 1;
        }
        break;
      case '--agent':
        if (nextValue) {
          options.agent = nextValue;
          if (!inline) i += 1;
        }
        break;
      case '--model':
        if (nextValue) {
          options.model = nextValue;
          if (!inline) i += 1;
        }
        break;
      default:
        break;
    }
  }

  const command = positional.shift() ?? 'list';
  return { command, options };
}

function getConfigPath(projectRoot: string, override?: string): string {
  const relative = override && override.trim().length > 0 ? override.trim() : DEFAULT_CONFIG_PATH;
  return resolve(projectRoot, relative);
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

function listAction(projectRoot: string) {
  const config = __testUtils.loadConfig(projectRoot);

  console.log('Interpeer MCP configuration');
  console.log('----------------------------');
  console.log(`Project root: ${projectRoot}`);
  console.log(`Default agent: ${config.defaults?.agent ?? 'claude_code'}`);
  console.log(`Default model: ${config.defaults?.model ?? 'inherit (agent specific)'}`);
  console.log(`Configured agents: ${Object.keys(config.agents).join(', ')}`);
}

function setDefaultAction(projectRoot: string, configPath: string, options: CLIOptions) {
  if (!options.agent && !options.model) {
    throw new Error('Nothing to update. Provide --agent, --model, or both.');
  }

  const overrides = loadConfigFile(configPath);
  overrides.defaults = overrides.defaults ?? {};

  if (options.agent) {
    overrides.defaults.agent = options.agent;
    setDefaultAgentOverride(options.agent as never);
  }

  if (options.model !== undefined) {
    overrides.defaults.model = options.model;
    setDefaultModelOverride(options.model);
  }

  saveConfigFile(configPath, overrides);
  console.log(`Updated config at ${configPath}`);
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const configPath = getConfigPath(options.projectRoot, options.configPath);

  try {
    switch (command) {
      case 'list':
        listAction(options.projectRoot);
        break;
      case 'set-default':
        setDefaultAction(options.projectRoot, configPath, options);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error('Usage: interpeer-agents [list|set-default] [--project-root <path>] [--config <path>] [--agent <name>] [--model <model>]');
        process.exitCode = 1;
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

await main();
