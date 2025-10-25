# Interpeer MCP Bridge

## Goal
- Give the Codex CLI agent a way to request a second opinion from Claude using the same “interpeer” concept.
- Provide a reversible bridge: Claude already calls Codex via the interpeer skill; we want Codex to call Claude without hand-copying prompts.

## High-Level Concept
- **MCP Server**: Build a local MCP server that exposes one or more tools (e.g. `interpeer_review`) capable of delegating reviews to different agents (Claude Code, Codex CLI, Factory Droid, etc.).
- **Agent Routing**: Clients specify a `target_agent`; the server executes the appropriate adapter (AI SDK for Claude/Codex, CLI bridge for Factory Droid) and normalizes the response.
- **Workflow**: Primary agent prepares context → calls `interpeer_review` via MCP → server relays prompt to the selected peer → returns structured feedback → primary agent reconciles or summarizes.

## Prerequisites
- Anthropic API key (or another provider that offers Claude models, e.g. OpenRouter).
- Node 18+ (or Python 3.10+) to implement the MCP server.
- `@modelcontextprotocol/sdk` (TypeScript SDK) or `mcp` Python package, depending on language choice.
- Network access from the machine running Codex CLI to Anthropic’s API.

## Architecture Outline
- **Transport**: Standard MCP over stdio or WebSocket. For local tooling, stdio (spawned process) is simplest.
- **Server Responsibilities**:
  - Validate incoming tool invocations and prompt parameters.
  - Construct Anthropic API requests (messages API with system/instruction prompts mirroring interpeer’s structure).
  - Stream or buffer Claude’s response and translate it back into MCP tool result payloads.
  - Enforce safety knobs (model selection, max tokens, rate limiting, redaction).
- **Tool Contract** (example):
  ```json
  {
    "name": "interpeer_review",
    "description": "Ask another agent for a second opinion on code or designs",
    "input_schema": {
      "type": "object",
      "required": ["content"],
      "properties": {
        "content": { "type": "string" },
        "focus": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Optional focus areas like security, architecture, performance"
        },
        "style": {
          "type": "string",
          "enum": ["structured", "freeform"],
          "default": "structured"
        },
        "time_budget_seconds": {
          "type": "integer",
          "minimum": 30,
          "maximum": 600,
          "default": 90,
          "description": "Hint telling the peer reviewer to keep the response concise"
        },
        "review_type": {
          "type": "string",
          "enum": ["general", "code", "design", "architecture"],
          "default": "general",
          "description": "Template that tailors the guidance to match the artifact"
        },
        "target_agent": {
          "type": "string",
          "enum": ["claude_code", "codex_cli", "factory_droid"],
          "default": "claude_code",
          "description": "Peer agent that should answer the request"
        }
      }
    }
  }
  ```
- **Response Shape**:
  ```json
  {
    "status": "ok",
    "analysis": "... Claude’s formatted answer ...",
    "model": "claude-3-5-sonnet-20241022"
  }
  ```

## Implementation Steps (TypeScript Example)
1. **Scaffold project**
   ```bash
   mkdir -p tools/claude-mcp && cd tools/claude-mcp
   npm init -y
   npm install @modelcontextprotocol/sdk anthopic dotenv
   ```
   - `anthropic` npm package provides Claude API helpers.
   - Add `.env` with `ANTHROPIC_API_KEY=...`.

2. **Create server entrypoint (`src/index.ts`)**
   - Import `createServer` from MCP SDK.
   - Register a single tool `interpeer_review`.
   - On invocation:
     - Parse and validate payload against schema.
     - Build interpeer prompt bundle using configurable templates (general/code/design/architecture).
     - Route to the desired agent adapter (Claude Code, Codex CLI, Factory CLI).
     - Normalize the response and surface Strengths/Concerns/Recommendations (or freeform narrative).

3. **Add CLI shim (`bin/claude-mcp`)** with shebang that runs the compiled JS and communicates over stdio (MCP standard).

4. **Build & package**
   ```bash
   npm run build
   chmod +x bin/claude-mcp
   ```
   - Set `"bin": "./bin/claude-mcp"` in `package.json`.

5. **Register server with Codex CLI**
   - Add to Codex config (assuming forthcoming MCP support):
     ```jsonc
     {
       "mcp_servers": [
         {
           "name": "interpeer",
           "command": "/absolute/path/to/node",
           "args": ["/absolute/path/to/interpeer/tools/interpeer-mcp/dist/bin/interpeer-mcp.js"],
           "env": { "INTERPEER_PROJECT_ROOT": "/absolute/path/to/interpeer" }
         }
       ]
     }
     ```
   - If Codex CLI lacks native MCP hooks, wrap the tool with a script: `codex exec "Use tool interpeer_review with input ..."` that spawns the MCP process, sends payload, and prints result.

6. **Usage Pattern**
   ```bash
   codex mcp exec interpeer interpeer_review '{
     "content": "Paste or read file content...",
     "focus": ["architecture", "security"],
     "review_type": "code",
     "target_agent": "codex_cli",
     "style": "structured",
     "time_budget_seconds": 120
   }'
   ```
   - The MCP server routes the request to the Codex CLI adapter, returns a normalized review, and the primary agent reconciles with its own summary (mirroring interpeer workflow).

7. **Optional Enhancements**
   - Stream results to Codex for incremental display.
   - Support file handles (MCP resources) so Codex can pass file references instead of raw text.
   - Support multiple prompt templates (`review_code`, `review_design`, `brainstorm_alternatives`).
   - Cache responses for repeatable prompts to save tokens.

## Security & Operational Considerations
- Store API keys outside repo (`.env`, keychain, parameter store).
- Implement request/response logging with redaction for sensitive data.
- Rate-limit or queue requests to respect Anthropic quotas.
- Add retries with exponential backoff.
- Provide configuration toggles for model, max tokens, temperature, top_k/p.

## Integrating with Interpeer Documentation
- Update `skills/interpeer/SKILL.md` with a new section “Reverse Second Opinion (Codex → Claude)” describing:
  - When to invoke the MCP tool.
  - Prompt templates aligning with interpeer review structure.
  - How to reconcile Claude’s feedback with Codex’s own analysis.
- Note any prerequisite commands (e.g. `codex mcp exec claude interpeer_review ...`).
- Optionally publish the MCP server as a separate package so others can reuse it.

## Alternative: Python Implementation
- Use `pip install mcp anthropic`.
- Define `Server` from the Python MCP SDK, register the same tool schema.
- Example entrypoint: `python -m claude_mcp.server`.
- Distribute via `pipx` for easy installation.

## Next Steps Checklist
1. Decide on implementation language (TypeScript vs Python).
2. Prototype MCP server that echoes predefined prompts to ensure wiring works.
3. Add Anthropic API integration and basic prompt template.
4. Document the workflow in this repository (SKILL.md, README).
5. Dogfood: run Codex CLI session, call `interpeer_review`, iterate on prompt quality.

## Reference: Task Master MCP Patterns Worth Reusing
- **FastMCP scaffolding**: Task Master (`mcp-server/src/index.js`) wraps `FastMCP` with stdio transport, connect handlers, and 2-minute timeouts. We can copy this shape for quick bootstrapping instead of hand-rolling the server.
- **Session-aware provider**: Their `MCPProvider` stores the active session and validates `clientCapabilities.sampling` before handling calls—useful guard rails for our Claude bridge.
- **AI-SDK compatibility layer**: The `mcp-server/src/custom-sdk` folder shows how to translate between MCP’s sampling format and higher-level prompt abstractions, including structured outputs (`doGenerateObject`). Borrowing their schema-to-instructions + JSON extraction utilities would let interpeer request JSON-formatted critiques reliably.
- **Selective tool loading**: Task Master lets users pick tool subsets via env vars and config templates; we can mirror this to expose different Claude prompt templates (review vs brainstorm) without inflating the MCP manifest.
- **Editor configs**: README examples detail where MCP config files live for Cursor, Zed, etc.; reuse those paths/instructions when documenting how to register the interpeer MCP bridge.
- **Logging & safety**: They send `sendLoggingMessage` events on connect/disconnect and ensure retries/error mapping (see `custom-sdk/errors.js`). Adopt similar hooks so Codex users see clear telemetry when Claude calls fail.
