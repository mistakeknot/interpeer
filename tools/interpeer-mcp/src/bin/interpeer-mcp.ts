#!/usr/bin/env node
import { resolve } from 'node:path';
import bootstrapServer from '../index.js';

async function main(): Promise<void> {
  const projectRoot = resolve(process.cwd());
  await bootstrapServer({ projectRoot });
}

main().catch((error) => {
  console.error('Interpeer MCP server failed to start:', error);
  process.exitCode = 1;
});
