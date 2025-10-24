# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Interpeer** is a Claude Code plugin that enables cross-AI peer review by integrating OpenAI's Codex CLI. It allows Claude to get expert feedback from Codex on designs, implementations, and architectural decisions, then collaboratively review that feedback with users.

**Plugin Type:** Claude Code skill plugin
**Version:** 2.0.0
**Plugin Namespace:** `interpeer` (from interagency-marketplace)

## Repository Structure

```
/
├── .claude-plugin/
│   └── plugin.json          # Plugin metadata and configuration
├── skills/
│   └── interpeer/
│       └── SKILL.md         # Core skill documentation and workflow
├── README.md                # User-facing documentation
└── LICENSE
```

## Key Architecture

### Plugin System Integration

This repository is a **skill-only plugin** - it contains no executable code, only documentation that guides Claude Code's behavior through the skill system.

**How it works:**
1. Plugin is installed via Claude Code's plugin system (`/plugin install interpeer`)
2. The skill is registered in `.claude-plugin/plugin.json` pointing to `./skills/interpeer`
3. Claude Code loads `skills/interpeer/SKILL.md` which contains the complete workflow
4. When triggered, Claude follows the documented workflow to call Codex CLI and present results

### Core Workflow (from SKILL.md)

The skill implements a 5-phase peer review workflow:

1. **Prepare for Review** (optional): Identify target and ask user for focus areas via `AskUserQuestion`
2. **Call Codex CLI**: Execute `codex exec --sandbox read-only` with structured prompts
3. **Present Feedback**: Format Codex output using standardized template (Strengths, Concerns, Recommendations)
4. **Collaborative Review**: Discuss each point with analysis and user input
5. **Action Planning**: Decide what to implement, defer, or reject

### External Dependencies

**Required:** [OpenAI Codex CLI](https://github.com/openai/codex-cli)
- Users must install and configure separately
- Accessed via shell command: `codex exec --sandbox read-only "..."`
- Claude Code invokes this via the Bash tool

**Optional:** `timeout` or `gtimeout` command
- Provides safety timeout for Codex calls (default: 180 seconds)
- Auto-detected at runtime; skill works without it
- Fallback: TIME BUDGET constraint in Codex prompts

## Development Notes

### This is Documentation-Driven

There is **no source code** to build or test in the traditional sense. The "implementation" is the skill documentation itself.

**To modify behavior:**
- Edit `skills/interpeer/SKILL.md` to change the workflow
- Update `README.md` for user-facing documentation
- Modify `.claude-plugin/plugin.json` for metadata changes

### Version Management

Version is declared in `.claude-plugin/plugin.json`. When making changes:
1. Update the version number following semantic versioning
2. Ensure README.md and SKILL.md remain synchronized
3. Test by installing plugin in Claude Code and triggering the skill

### No Traditional Commands

This repository has no build, test, or lint commands. Validation is behavioral:
- Install the plugin in Claude Code
- Trigger the skill (e.g., "Can you get Codex feedback on this file?")
- Verify Claude follows the documented workflow in SKILL.md

## Working with Skills

### Skill Anatomy

Skills are markdown files with YAML frontmatter:
```yaml
---
name: interpeer
description: Get expert feedback from OpenAI Codex CLI...
---
```

The frontmatter defines:
- `name`: Skill identifier for the skill system
- `description`: When/how Claude should use this skill

### Triggering Logic

Claude Code automatically uses this skill when:
- User explicitly mentions "Codex feedback" or "second opinion"
- Context suggests need for external review
- After completing a design (Claude may proactively offer)

See SKILL.md "When to Use This Skill" section for full trigger conditions.

## Important Constraints

### Sandbox Mode
Always use `--sandbox read-only` for safety. The skill documentation specifies this default. Other modes (`workspace-write`, `danger-full-access`) are documented but not recommended.

### Timeout Handling
The skill auto-detects timeout commands at runtime:
```bash
if command -v gtimeout >/dev/null 2>&1; then TIMEOUT_CMD="gtimeout 180"
elif command -v timeout >/dev/null 2>&1; then TIMEOUT_CMD="timeout 180"
else TIMEOUT_CMD=""
fi
```

If no timeout is available, rely on `TIME BUDGET` constraints in Codex prompts.

### Codex as Consultant, Not Authority
Critical principle: Codex provides expert input but Claude and the user make final decisions. Always provide contextual analysis alongside Codex feedback, never blindly implement suggestions.

## File-Specific Notes

### skills/interpeer/SKILL.md
- Primary reference for Claude Code behavior
- Contains complete workflow, prompts, templates, and best practices
- Changes here directly affect how Claude uses the skill
- ~650 lines; comprehensive reference for all scenarios

### README.md
- User-facing documentation (installation, usage, examples)
- Should align with SKILL.md but written for humans, not Claude
- Update when changing user-visible behavior

### .claude-plugin/plugin.json
- Plugin metadata (name, version, description, author)
- Registers skills via `"skills": ["./skills/interpeer"]`
- Version updates should be reflected here first

## Contributing to This Plugin

Since this is a skill plugin, contributions typically involve:
1. Improving the workflow in SKILL.md
2. Adding new review patterns or templates
3. Enhancing user documentation in README.md
4. Updating examples and best practices

Test changes by:
1. Installing locally in Claude Code
2. Triggering the skill in various scenarios
3. Verifying Claude follows updated documentation correctly
