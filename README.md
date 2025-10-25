# Interpeer Plugin

Get expert feedback from OpenAI Codex CLI on designs, implementations, or approaches, then review and discuss that feedback with the user.

## Overview

The Interpeer plugin provides a "second pair of eyes" by integrating OpenAI's Codex CLI into Claude Code's workflow. It enables collaborative peer review where Claude gets expert feedback from Codex and then discusses that feedback with you to make informed decisions.

## Features

- **Design Document Review**: Validate technical designs before implementation
- **Code Review**: Get expert feedback on code quality, performance, and best practices
- **Architecture Validation**: Verify architectural decisions and explore alternatives
- **Collaborative Discussion**: Review and discuss Codex feedback together
- **Multi-Perspective Analysis**: Combine Claude's contextual knowledge with Codex's expertise

## Prerequisites

### 1. Claude Code

This is a Claude Code plugin. You'll need:
- [Claude Code](https://claude.com/code) installed and running
- Access to the `/plugin` commands in Claude Code

To verify plugin support is available, type `/plugin` in Claude Code - you should see available plugin commands.

### 2. OpenAI Codex CLI

Install and configure the [OpenAI Codex CLI](https://github.com/openai/codex-cli):

```bash
# Install Codex CLI (example - check official docs for current method)
npm install -g @openai/codex-cli

# Configure with your API key
codex config set api-key YOUR_API_KEY

# Verify installation
codex --version
```

## Installation

Once prerequisites are met, install the plugin:

```bash
# Add the interagency marketplace (if not already added)
/plugin marketplace add mistakeknot/interagency-marketplace

# Install the interpeer plugin
/plugin install interpeer
```

After installation, Claude Code will automatically load the interpeer skill.

### (Optional) Install the Interpeer MCP Server for Reverse Reviews

To let Codex (or other agents) ask **Claude** for a second opinion, install the local MCP server included in this repo:

```bash
# From the repo root
cd tools/interpeer-mcp

# Install dependencies and build
pnpm install
pnpm run build

# Ensure the CLI entrypoint is executable
chmod +x dist/bin/interpeer-mcp.js

# (Optional) run tests
pnpm run test

# (Optional) create a distributable tarball
pnpm pack
```

The CLI can be launched manually:

```bash
INTERPEER_PROJECT_ROOT=/path/to/interpeer \
  node /path/to/interpeer/tools/interpeer-mcp/dist/bin/interpeer-mcp.js
```

Codex, Factory CLI droids, or any MCP-capable client can register this binary. See [docs/interpeer-mcp.md](docs/interpeer-mcp.md) for detailed integration instructions (Codex CLI, Factory CLI, MCP Inspector), environment variables, caching, and troubleshooting.

## Usage

Once installed, Claude will automatically use the interpeer skill when appropriate. You can also explicitly request it:

**Quick Start:** For command-line usage with constraints and examples, see the [Quick Start](skills/interpeer/SKILL.md#quick-start) and [Quick Reference](skills/interpeer/SKILL.md#quick-reference) sections in SKILL.md.

### Example: Design Document Review

```
You: "Can you get Codex feedback on this design document?"
```

Claude will:
1. Read the design document
2. Send it to Codex CLI for review
3. Present the feedback organized by strengths, concerns, and recommendations
4. Discuss each point with you
5. Help you decide which feedback to act on

### Example: Code Review

```
You: "Let's validate this implementation with Codex"
```

Claude will:
1. Review the code with Codex
2. Get feedback on performance, best practices, and maintainability
3. Present the analysis
4. Discuss improvements together

### Example: Architecture Decision

```
You: "I want a second opinion on this architectural approach"
```

Claude will:
1. Prepare a summary of the approach
2. Get Codex's analysis of trade-offs and alternatives
3. Present multiple perspectives
4. Help you make an informed decision

## What Gets Reviewed

- Technical design documents (`.md` files)
- Source code files (any language)
- Architectural approaches (described concepts)
- System designs
- Implementation patterns

## Review Workflow

1. **Prepare**: Identify what needs review, then Claude asks you to select focus areas (Architecture, Performance, Security, etc.) via an interactive picker
2. **Execute**: Send content to Codex CLI with appropriate prompts and constraints
3. **Present**: Organize feedback by priority and category
4. **Discuss**: Collaboratively analyze each point
5. **Action**: Decide what to implement, defer, or reject

## Review Categories

Feedback is organized into:
- **Strengths**: What's working well
- **Critical Concerns**: Must-address issues (bugs, security, performance blockers)
- **Important Concerns**: Should-address issues (architecture, maintainability)
- **Recommendations**: Nice-to-have improvements

## Integration with Other Skills

Works well with:
- **brainstorming**: Create design → validate with interpeer → implement
- **writing-plans**: Validate plan with interpeer before execution
- **systematic-debugging**: Get external perspective on complex bugs

## Best Practices

**DO:**
- Use for important architectural decisions
- Review designs before major implementations
- Discuss and evaluate all feedback
- Make final decisions collaboratively

**DON'T:**
- Blindly implement all suggestions
- Skip discussing feedback that seems wrong
- Use as the sole decision-maker
- Forget to consider your specific context

## Sandbox Modes

Codex CLI executes with these sandbox options:
- `read-only` (default): Safe for reviews, no file modifications
- `workspace-write`: Allow file changes (use cautiously)
- `danger-full-access`: Full system access (not recommended)

Interpeer uses `read-only` mode by default for safety.

## Example Output

```markdown
# Interpeer Review: Authentication System Design

## Executive Summary
Codex reviewed the authentication design and identified strong security
practices but raised concerns about session management scalability.

## Strengths ✅
- JWT implementation follows best practices
- Proper password hashing with bcrypt
- Clear separation of concerns

## Concerns ⚠️
### Critical
- Session storage could become a bottleneck at scale

### Important
- Missing rate limiting on auth endpoints
- No refresh token rotation strategy

## Recommendations 💡
1. Consider Redis for session storage
2. Implement token rotation
3. Add rate limiting middleware

## Discussion
[Claude's analysis of whether these apply to your context]

## Action Items
- [ ] Evaluate Redis for session management
- [ ] Design token rotation strategy
```

## Troubleshooting

**Codex CLI not found:**
```bash
# Check if Codex CLI is installed
which codex

# Install if missing
npm install -g @openai/codex-cli
```

**API errors:**
- Check your OpenAI API key is configured
- Verify you have API credits available
- Check network connectivity

**Unexpected responses:**
- Provide more context in the review prompt
- Specify focus areas explicitly
- Break complex reviews into smaller parts

## Learn More

- [Codex CLI Documentation](https://github.com/openai/codex-cli)
- [Claude Code Plugin Guide](https://docs.claude.com/en/docs/claude-code/plugins)
- [Agent Skills Documentation](https://docs.claude.com/en/docs/claude-code/skills)

## Contributing

Found a bug or have a suggestion? Please open an issue or pull request in the [interagency-marketplace repository](https://github.com/mistakeknot/interagency-marketplace).

## License

This plugin is provided as-is for use with Claude Code. Please refer to the marketplace repository for license details.
