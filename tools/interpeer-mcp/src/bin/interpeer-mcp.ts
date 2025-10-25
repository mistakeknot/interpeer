#!/usr/bin/env node
import { resolve } from 'node:path';
import bootstrapServer from '../index.js';

async function main(): Promise<void> {
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

main().catch((error) => {
  console.error('Interpeer MCP server failed to start:', error);
  process.exitCode = 1;
});
