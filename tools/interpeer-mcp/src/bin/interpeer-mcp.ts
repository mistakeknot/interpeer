#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bootstrapServer, {
  setDefaultAgentOverride,
  setDefaultModelOverride
} from '../index.js';

function applyFlag(flag: string, value?: string) {
  if (!value) return;
  switch (flag) {
    case '--default-agent':
      process.env.INTERPEER_DEFAULT_AGENT = value;
      setDefaultAgentOverride(value as never);
      break;
    case '--default-model':
      process.env.INTERPEER_DEFAULT_MODEL = value;
      setDefaultModelOverride(value);
      break;
    case '--config':
      process.env.INTERPEER_CONFIG_PATH = value;
      break;
    case '--project-root':
      process.env.INTERPEER_PROJECT_ROOT = value;
      break;
    default:
      break;
  }
}

function parseArgs(argv: string[]) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [flag, inline] = arg.split('=');
      if (inline !== undefined) {
        applyFlag(flag, inline);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          applyFlag(flag, next);
          i += 1;
        } else {
          applyFlag(flag, undefined);
        }
      }
    }
  }
}

export async function runMcpCli(argv: string[]): Promise<void> {
  parseArgs(argv);

  const projectRootCandidate =
    process.env.INTERPEER_PROJECT_ROOT && process.env.INTERPEER_PROJECT_ROOT.trim().length > 0
      ? process.env.INTERPEER_PROJECT_ROOT.trim()
      : process.cwd();

  const projectRoot = resolve(projectRootCandidate);
  await bootstrapServer({ projectRoot });

  const handleShutdown = (signal: NodeJS.Signals) => {
    console.error(`Interpeer MCP server received ${signal}. Shutting down.`);
    process.exit(0);
  };

  process.once('SIGINT', handleShutdown);
  process.once('SIGTERM', handleShutdown);
}

async function main(): Promise<void> {
  try {
    await runMcpCli(process.argv.slice(2));
  } catch (error) {
    console.error('Interpeer MCP server failed to start:', error);
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
