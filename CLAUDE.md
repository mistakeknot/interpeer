# interpeer

Cross-AI peer review with 4 escalation modes.

## Overview

1 skill, 0 agents, 1 command, 0 hooks. Standalone plugin extracted from Clavain.

## Modes

- **quick** — Claude↔Codex second opinion (seconds)
- **deep** — Oracle analysis with prompt optimization (minutes)
- **council** — Full LLM Council multi-model consensus (slow)
- **mine** — Disagreement extraction into tests, specs, and questions

## Quick Commands

```bash
python3 -c "import json; json.load(open('.claude-plugin/plugin.json'))"  # Manifest check
ls skills/*/SKILL.md | wc -l  # Should be 1
```

## Design Decisions (Do Not Re-Ask)

- Oracle requires DISPLAY=:99 and CHROME_PATH — see skill references
- Extracted from Clavain — cross-AI review is a separable concern
