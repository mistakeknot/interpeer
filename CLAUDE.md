# interpeer

Model-diversity layer — the canonical path for non-Claude perspectives across the Demarch stack.

## Overview

1 skill, 0 agents, 1 command, 0 hooks. Standalone plugin.

## Modes

- **quick** — Claude↔Codex second opinion (seconds)
- **deep** — Oracle/GPT analysis with prompt optimization (minutes). Supports API mode (`-e api`) when OPENAI_API_KEY is set, or browser mode via Oracle.
- **mine** — Disagreement extraction into tests, specs, and questions

## When to Use

- Quality gates produce P0/P1 findings on security-sensitive code → interpeer for model-diverse validation
- Flux-drive agents disagree → interpeer for an outside opinion
- Any time you want a genuinely different model's perspective

## Quick Commands

```bash
python3 -c "import json; json.load(open('.claude-plugin/plugin.json'))"  # Manifest check
ls skills/*/SKILL.md | wc -l  # Should be 1
```

## Design Decisions (Do Not Re-Ask)

- Oracle requires DISPLAY=:99 and CHROME_PATH for browser mode; API mode (`-e api`) works without display
- Council mode removed — flux-drive + intersynth handles multi-agent consensus better
- Extracted from Clavain — cross-AI review is a separable concern
- Positioned as the model-diversity layer, not just a review tool
