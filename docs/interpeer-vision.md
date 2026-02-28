# interpeer — Vision and Philosophy

**Version:** 0.1.0
**Last updated:** 2026-02-28

## What interpeer Is

interpeer is a cross-AI peer review plugin for Claude Code. It enables any AI agent to solicit a second opinion from a peer model — Claude to Codex, Codex to Claude, or either to GPT via Oracle — through four escalating modes: **quick** (live Claude↔Codex handoff in seconds), **deep** (structured Oracle query with human-reviewed prompt), **council** (multi-model synthesis with independent pre-read), and **mine** (disagreement extraction into tests, specs, and stakeholder questions). One skill, one command, four escalation modes.

The plugin is self-contained: it operates in read-only mode against the project under review, integrates with Oracle when available (requires `DISPLAY=:99`, `CHROME_PATH`), and falls back gracefully when external models are unavailable. It was extracted from Clavain because cross-AI review is a separable concern that should be composable with any host configuration.

## Why This Exists

Model agreement is cheap; model disagreement is expensive and therefore valuable. When two independently trained models converge on a finding, confidence rises. When they diverge, the gap is almost always a real ambiguity in the code, the spec, or the threat model — and that ambiguity would have caused a bug or a wrong decision if left unresolved. interpeer exists to make that disagreement legible, fast to surface, and convertible into durable artifacts. It is a peer review receipt machine.

## Design Principles

1. **Disagreement is the signal.** The goal of a peer review is not validation — it is divergence detection. Consensus between models is a noise floor; disagreement is the signal. Every mode is designed to surface, preserve, and exploit that signal rather than smooth it over.

2. **Escalation is a dial, not a gate.** quick, deep, council, and mine are ordered by cost and depth, not by correctness. quick is the right default for most decisions. Escalation is triggered by the user or by explicit cues ("go deeper", "get consensus") — never automatic, never forced.

3. **Form your own opinion first.** The council and mine modes require the host agent to produce an independent analysis before reading external responses. Anchoring bias is real. The value of a second opinion collapses if the first opinion was formed by reading the second opinion first.

4. **Receipts over narratives.** Every review produces a structured artifact: summary, peer findings, host analysis, disagreement table, recommended actions. This makes the review replayable and auditable. A review that left no artifact didn't happen.

5. **Polycentric evaluation.** No single model's judgment is final. quick mode routes to a peer. deep mode routes to a different architecture entirely. council mode requires explicit synthesis across members. The architecture treats multi-model disagreement as an epistemic hedge — different training runs produce different blind spots, and composition reduces the combined blind spot.

## Scope

**Does:**
- Route review requests between Claude Code and Codex CLI (quick mode)
- Build, review, and dispatch structured prompts to Oracle (deep mode)
- Synthesize multi-model council reviews with anti-anchoring protocol (council mode)
- Extract top 3-5 disagreements from any multi-model review and convert them into runnable tests, spec clarifications, or stakeholder questions (mine mode)
- Produce structured review artifacts at every escalation level

**Does not:**
- Modify files under review — read-only throughout all modes
- Make decisions autonomously — always presents findings for human resolution
- Call Oracle without user approval — deep mode's prompt-review step is mandatory
- Replace project-level testing or linting — it reviews judgment calls, not syntax

## Direction

- Add `SKILL-compact.md` once the skill stabilizes past its first real-world sessions
- Expand mine mode to emit machine-readable disagreement records (JSON or YAML) suitable for tracking across sessions and feeding into project metrics
- Explore a lightweight receipt format so interpeer outputs can be referenced from beads and project memory without manual copy-paste
