#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

import { runAgentsCli } from './interpeer-agents.js';
import { runMcpCli } from './interpeer-mcp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadPackageVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')
    ) as { version?: string };
    return packageJson.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface CodexConfigOptions {
  projectRoot: string;
  nodeCommand: string;
  serverPath?: string;
}

export function buildCodexConfig(options: CodexConfigOptions) {
  const projectRoot = resolve(options.projectRoot);
  const nodeCommand = options.nodeCommand || 'node';
  const serverPath =
    options.serverPath ??
    join(projectRoot, 'tools', 'interpeer-mcp', 'dist', 'bin', 'interpeer-mcp.js');

  return {
    name: 'interpeer',
    command: nodeCommand,
    args: [serverPath],
    env: {
      INTERPEER_PROJECT_ROOT: projectRoot
    }
  };
}

function printRootHelp() {
  const version = loadPackageVersion();
  const lines = [
    `Interpeer CLI v${version}`,
    '---------------------',
    'Manage the Interpeer MCP server and configuration helpers.',
    '',
    'Usage:',
    '  interpeer <command> [options]',
    '',
    'Commands:',
    '  help                     Show this help text',
    '  version                  Print CLI version',
    '  agents <...>             Run interpeer-agents helper (see interpeer agents --help)',
    '  mcp serve [options]      Launch the MCP server (stdio)',
    '  mcp config codex [opts]  Print Codex MCP configuration JSON snippet',
    '',
    'Examples:',
    '  interpeer agents list',
    '  interpeer agents set-default --agent codex_cli',
    '  interpeer mcp serve --project-root /path/to/project',
    '  interpeer mcp config codex --project-root /path/to/project --node-command node',
    ''
  ];

  console.log(lines.join('\n'));
}

function printMcpHelp() {
  const lines = [
    'interpeer mcp commands',
    '----------------------',
    'Manage the Interpeer MCP server lifecycle and client configs.',
    '',
    'Usage:',
    '  interpeer mcp serve [options]',
    '  interpeer mcp config codex [options]',
    '',
    'Options recognised by serve:',
    '  --project-root <path>     Override INTERPEER_PROJECT_ROOT',
    '  --config <path>           Use alternate config file',
    '  --default-agent <agent>   Override default agent when none provided',
    '  --default-model <model>   Override default model when target agent omitted',
    '',
    'Options recognised by config codex:',
    '  --project-root <path>     Base path for INTERPEER_PROJECT_ROOT (defaults to cwd)',
    '  --node-command <command>  Node binary to launch MCP server (defaults to node)',
    '  --server-path <path>      Override MCP entrypoint path',
    '',
    'Examples:',
    '  interpeer mcp serve --project-root /workspace/interpeer',
    '  interpeer mcp config codex --project-root /workspace/interpeer',
    ''
  ];

  console.log(lines.join('\n'));
}

function parseConfigOptions(args: string[]) {
  let projectRoot = process.cwd();
  let nodeCommand = 'node';
  let serverPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const [flag, inline] = arg.split('=');
    const next = inline ?? args[i + 1];

    switch (flag) {
      case '--project-root':
        if (!next) throw new Error('--project-root requires a value');
        projectRoot = inline ? inline : next;
        if (!inline) i += 1;
        break;
      case '--node-command':
        if (!next) throw new Error('--node-command requires a value');
        nodeCommand = inline ? inline : next;
        if (!inline) i += 1;
        break;
      case '--server-path':
        if (!next) throw new Error('--server-path requires a value');
        serverPath = inline ? inline : next;
        if (!inline) i += 1;
        break;
      default:
        throw new Error(`Unknown option for config: ${flag}`);
    }
  }

  return { projectRoot, nodeCommand, serverPath };
}

async function handleMcpCommand(args: string[]): Promise<void> {
  const subcommand = args.shift();

  if (!subcommand || subcommand === 'help') {
    printMcpHelp();
    return;
  }

  switch (subcommand) {
    case 'serve':
      await runMcpCli(args);
      break;
    case 'config': {
      const target = args.shift();
      if (!target || target === 'help') {
        printMcpHelp();
        return;
      }

      if (target !== 'codex') {
        throw new Error(`Unknown mcp config target: ${target}`);
      }

      const options = parseConfigOptions(args);
      const snippet = buildCodexConfig(options);
      console.log(JSON.stringify(snippet, null, 2));
      break;
    }
    default:
      throw new Error(`Unknown mcp subcommand: ${subcommand}`);
  }
}

export async function runInterpeerCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printRootHelp();
    return;
  }

  switch (command) {
    case 'version':
      console.log(loadPackageVersion());
      break;
    case 'agents':
      await runAgentsCli(rest);
      break;
    case 'mcp':
      await handleMcpCommand(rest);
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

async function main(): Promise<void> {
  try {
    await runInterpeerCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
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
