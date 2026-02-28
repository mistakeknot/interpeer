# interpeer (compact)

Cross-AI peer review with 4 escalation modes: quick, deep, council, mine.

## When to Invoke

Use when the user wants a second opinion from another AI model, cross-model consensus, or disagreement extraction from multi-model reviews.

## Modes

| Mode | What | Speed |
|------|------|-------|
| **quick** | Claude<->Codex auto-detect | Seconds |
| **deep** | Oracle with prompt review | Minutes |
| **council** | Multi-model synthesis | Slowest |
| **mine** | Extract disagreements -> artifacts | Post-review |

Default: `quick`. Escalation: "go deeper" -> deep, "council" -> council, "extract disagreements" -> mine.

## Quick Mode

1. Detect host agent (CLAUDECODE=1 or CODEX_SANDBOX env var)
2. Read 1-5 files, build review prompt with project context
3. Call peer via dispatch.sh (Claude->Codex) or claude -p (Codex->Claude)
4. Present: peer feedback + your own analysis + recommended actions

## Deep Mode

1. Gather context (primary files, imports, config, tests; ~200k token budget)
2. Build structured prompt (project briefing, current context, focused question)
3. **User review (CRITICAL)** -- show prompt, get explicit approval via AskUserQuestion
4. Execute via `oracle --wait --write-output` with approved prompt
5. Present findings with severity tiers + points of disagreement

## Council Mode

1. Claude forms independent opinion FIRST (avoid anchoring bias)
2. Query Oracle via deep mode pipeline (add "provide independent analysis" to prompt)
3. Synthesize: agreements (strong signal), disagreements (needs investigation), unique insights

## Mine Mode

1. Gather perspectives from prior council/deep output (or ask user to run/paste)
2. Structure top 3-5 disagreements: precise claims, core tension, resolving evidence
3. Generate artifacts: tests, spec clarifications, stakeholder questions
4. Minority Report Principle: never discard dissenting opinions without examination

## Key Rules

- NEVER call Oracle CLI directly -- always go through deep mode's prompt-optimization pipeline
- Never include secrets in prompts
- Always present your own analysis alongside peer feedback
- Form independent opinions before reading external responses

---
*For full prompt templates, error handling, and Oracle CLI reference, read SKILL.md.*
