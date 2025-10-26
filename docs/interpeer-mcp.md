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
          "enum": [
            "general",
            "code",
            "design",
            "architecture",
            "security_audit",
            "brainstorm_alternatives"
          ],
          "default": "general",
          "description": "Template that tailors the guidance to match the artifact"
        },
        "target_agent": {
          "type": "string",
          "enum": ["claude_code", "codex_cli", "factory_droid"],
          "default": "claude_code",
          "description": "Peer agent that should answer the request"
        },
        "target_model": {
          "type": "string",
          "description": "Override the model identifier for the selected agent (e.g. claude-4.5-sonnet)"
        },
        "resource_paths": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Optional list of project-relative file paths whose contents should be appended before review"
        }
      }
    }
  }
  ```

`target_model` is optional—provide it when you want to pin a specific model version for the selected agent without touching global config.
- **Response Shape**:
  ```json
  {
    "status": "ok",
    "analysis": "... Claude’s formatted answer ...",
    "model": "claude-4.5-sonnet"
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

## Client Integration Examples

### Codex CLI
1. Build the CLI (once per code change):
   ```bash
   pnpm --filter interpeer-mcp run build
   ```
2. Generate a configuration snippet tailored to your workspace:
   ```bash
   node tools/interpeer-mcp/dist/bin/interpeer-cli.js mcp config codex --project-root /path/to/interpeer
   ```
   Copy the JSON output into `~/.codex/mcp.json` (inside the `mcp_servers` array), or pipe it directly:
   ```bash
   node tools/interpeer-mcp/dist/bin/interpeer-cli.js mcp config codex --project-root /path/to/interpeer \
     | codex mcp add --from-stdin
   ```
   (Once the package is published to npm you will be able to run `interpeer mcp config codex ...` or `npx interpeer-mcp interpeer mcp config codex ...`.)
3. Start Codex and call the tool:
   ```bash
   codex mcp exec interpeer interpeer_review '{
     "content": "function add(a, b) { return a + b; }",
     "focus": ["correctness", "testing"],
     "review_type": "code",
     "target_agent": "codex_cli",
     "style": "structured"
   }'
   ```

### Factory CLI (Droid)
1. Register the server (once):
   ```bash
   node tools/interpeer-mcp/dist/bin/interpeer-cli.js mcp config codex --project-root /path/to/interpeer
   # Copy the command segment, or run:
   /mcp add interpeer "node /path/to/interpeer/tools/interpeer-mcp/dist/bin/interpeer-mcp.js" \
     -e INTERPEER_PROJECT_ROOT=/path/to/interpeer
   ```
2. Ask a droid to request a second opinion:
   ```bash
   /ask "Use interpeer:interpeer_review on docs/design.md with focus=['architecture'] target_agent='factory_droid'"
   ```

### MCP Inspector (Manual Testing)
1. Launch Inspector with stdio transport:
   - **Command**: `node`
   - **Arguments**: `/path/to/interpeer/tools/interpeer-mcp/dist/bin/interpeer-mcp.js`
   - **Working Directory**: `/path/to/interpeer`
2. Connect and call `interpeer_review` with different `target_agent` values to validate routing.

### CLI Flags
- `interpeer mcp serve --project-root <path>`: overrides `INTERPEER_PROJECT_ROOT`
- `interpeer mcp serve --config <path>`: load a custom JSON config file
- `interpeer agents set-default --agent <agent>`: default agent when `target_agent` omitted (`claude_code`, `codex_cli`, `factory_droid`)
- `interpeer agents set-default --model <model>`: default model for the default agent

### Managing Defaults via CLI

Use the helper command to inspect or update configuration without editing JSON by hand:

```bash
# From repo root
pnpm --filter interpeer-mcp run build

node tools/interpeer-mcp/dist/bin/interpeer-cli.js help

node tools/interpeer-mcp/dist/bin/interpeer-cli.js agents list

node tools/interpeer-mcp/dist/bin/interpeer-cli.js agents set-default --agent codex_cli --model gpt-5-codex

# Clear a default model (falls back to per-adapter defaults)
node tools/interpeer-mcp/dist/bin/interpeer-cli.js agents set-default --model ""

# Update a built-in adapter's command/model without redefining it
node tools/interpeer-mcp/dist/bin/interpeer-cli.js agents set-agent --id claude --command claude --model claude-4.5-sonnet

# Add a custom adapter (ids must not be claude/codex/factory)
node tools/interpeer-mcp/dist/bin/interpeer-cli.js agents add-agent --id openrouter --command or --model anthropic/claude-4.5-sonnet
```

## Environment Reference (`.env.example`)
```
# General retry controls
INTERPEER_MAX_RETRIES=3
INTERPEER_RETRY_DELAY_MS=2000

# Claude Code
INTERPEER_CLAUDE_MODEL=sonnet
INTERPEER_CLAUDE_COMMAND=claude
INTERPEER_CLAUDE_SETTING_SOURCES=user,project
INTERPEER_CLAUDE_CUSTOM_SYSTEM_PROMPT=
INTERPEER_CLAUDE_MAX_RETRIES=3
INTERPEER_CLAUDE_RETRY_DELAY_MS=2000

# Codex CLI
INTERPEER_CODEX_MODEL=gpt-5-codex
INTERPEER_CODEX_COMMAND=codex
INTERPEER_CODEX_PROFILE=
INTERPEER_CODEX_VERBOSE=false
INTERPEER_CODEX_MAX_RETRIES=3
INTERPEER_CODEX_RETRY_DELAY_MS=2000

# Factory CLI
INTERPEER_FACTORY_COMMAND=factory
INTERPEER_FACTORY_MODEL=factory-droid
INTERPEER_FACTORY_FORMAT=markdown
INTERPEER_FACTORY_EXTRA_ARGS=
INTERPEER_FACTORY_MAX_RETRIES=3
INTERPEER_FACTORY_RETRY_DELAY_MS=2000

# Defaults
INTERPEER_DEFAULT_AGENT=claude_code
INTERPEER_DEFAULT_MODEL=

# Caching
INTERPEER_CACHE_ENABLED=true
INTERPEER_CACHE_TTL_MS=300000
INTERPEER_CACHE_MAX_ENTRIES=50

# Logging
INTERPEER_LOGGING_ENABLED=true
INTERPEER_LOGGING_REDACT_CONTENT=true

# Optional config file location (defaults to .interpeer/interpeer.config.json)
INTERPEER_CONFIG_PATH=.interpeer/interpeer.config.json
```

## Troubleshooting
- **CLI not found**: ensure `INTERPEER_CLAUDE_COMMAND`, `INTERPEER_CODEX_COMMAND`, or `INTERPEER_FACTORY_COMMAND` point to installed binaries.
- **Permission denied**: run `chmod +x dist/bin/interpeer-mcp.js` after building.
- **Incorrect working directory**: set `INTERPEER_PROJECT_ROOT` so adapters can locate project files.
- **No response**: increase retry limits (`INTERPEER_*_MAX_RETRIES`) or inspect `sendLoggingMessage` output from the MCP client.
- **Custom adapters**: place a JSON config at `.interpeer/interpeer.config.json` (or set `INTERPEER_CONFIG_PATH`) to override agent definitions or add new ones. Legacy installs that still store overrides in `.taskmaster/interpeer.config.json` continue to work but will log a migration warning.

### Example `.interpeer/interpeer.config.json`

```json
{
  "agents": {
    "claude": {
      "model": "sonnet",
      "command": "claude",
      "retry": { "maxAttempts": 4, "baseDelayMs": 3000 }
    },
    "codex": {
      "model": "gpt-5-codex",
      "command": "codex",
      "verbose": true
    },
    "factory": {
      "command": "factory",
      "model": "factory-droid",
      "extraArgs": ["--profile", "prod"]
    },
    "openrouter": {
      "command": "or",
      "model": "openrouter/claude-4.5-sonnet"
    }
  }
}
```

Values supplied via environment variables always take precedence over the JSON file.

## Reference: Task Master MCP Patterns Worth Reusing
- **FastMCP scaffolding**: Task Master (`mcp-server/src/index.js`) wraps `FastMCP` with stdio transport, connect handlers, and 2-minute timeouts. We can copy this shape for quick bootstrapping instead of hand-rolling the server.
- **Session-aware provider**: Their `MCPProvider` stores the active session and validates `clientCapabilities.sampling` before handling calls—useful guard rails for our Claude bridge.
- **AI-SDK compatibility layer**: The `mcp-server/src/custom-sdk` folder shows how to translate between MCP’s sampling format and higher-level prompt abstractions, including structured outputs (`doGenerateObject`). Borrowing their schema-to-instructions + JSON extraction utilities would let interpeer request JSON-formatted critiques reliably.
- **Selective tool loading**: Task Master lets users pick tool subsets via env vars and config templates; we can mirror this to expose different Claude prompt templates (review vs brainstorm) without inflating the MCP manifest.
- **Editor configs**: README examples detail where MCP config files live for Cursor, Zed, etc.; reuse those paths/instructions when documenting how to register the interpeer MCP bridge.
- **Logging & safety**: They send `sendLoggingMessage` events on connect/disconnect and ensure retries/error mapping (see `custom-sdk/errors.js`). Adopt similar hooks so Codex users see clear telemetry when Claude calls fail.
