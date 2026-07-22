# interpeer

Cross-AI peer review for Claude Code, Codex, and Kimi Code.

## What this does

Single-model review catches a lot, but models have blind spots: and they tend to have the *same* blind spots consistently. interpeer sends your code or documents to a different model for a second opinion, with four escalation modes depending on how much scrutiny you need.

**Quick** (`qinterpeer`): sends to Codex CLI for fast Claude↔GPT feedback. Takes seconds, catches surface-level disagreements.

**Deep** (`interpeer`): sends to Oracle (ChatGPT 5.2 Pro) with prompt optimization and large context support (~200k tokens). Takes minutes, catches architectural and design issues.

**Council** (`winterpeer`): full LLM Council with multi-model consensus. Slow, but useful for critical decisions where you want genuine multi-perspective analysis.

**Mine** (`splinterpeer`): the interesting one. Instead of just getting a second opinion, this mode extracts the *disagreements* between models and converts them into actionable artifacts: tests for disputed behavior, specs for ambiguous requirements, and questions for genuinely unclear design choices. Models disagree about interesting things.

## Installation

First, add the [interagency marketplace](https://github.com/mistakeknot/interagency-marketplace) (one-time setup):

```bash
/plugin marketplace add mistakeknot/interagency-marketplace
```

Then install the plugin:

```bash
/plugin install interpeer
```

Requires [Codex CLI](https://github.com/openai/codex) for quick mode and [Oracle CLI](https://github.com/steipete/oracle) for deep mode.

## Usage

```
/interpeer
```

Auto-detects which AI tools are available and offers the appropriate modes.
