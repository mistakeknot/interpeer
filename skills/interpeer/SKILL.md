---
name: interpeer
description: Get expert feedback from OpenAI Codex CLI on designs, implementations, or approaches, then review and discuss that feedback with the user. Use when you want a second opinion on architecture, code quality, or technical decisions.
---

# Interpeer: Cross-AI Peer Review

## Purpose

Get expert technical feedback from OpenAI Codex CLI and collaboratively review it with the user. This provides a "second pair of eyes" on:
- Technical design documents
- Implementation approaches
- Code architecture
- System designs
- Code quality and best practices

## When to Use This Skill

**Use this skill when:**
- You've completed a design document and want expert validation
- You're unsure about a technical approach and want a second opinion
- You want to validate architectural decisions before implementation
- The user asks for external review of work
- You want to catch potential issues early

**Examples:**
- "Can you get Codex feedback on this design doc?"
- "Let's validate this approach with Codex"
- "I want a second opinion on this architecture"
- After completing a design: proactively offer "Would you like me to get Codex feedback on this design?"

## TL;DR

**The entire workflow in 30 seconds:**

1. **Install**: Ensure [OpenAI Codex CLI](https://github.com/openai/codex-cli) is installed
2. **Run**: `codex exec --sandbox read-only "Review FILE focusing on X, Y, Z. TIME BUDGET: 90s. START NOW."`
3. **Discuss**: Present Codex's feedback to user, analyze together, make informed decisions

**Default time**: 90 seconds (configurable via "quick interpeer" = 60s, "deep interpeer" = 300s)
**Key principle**: Codex is an expert consultant, not an authority. You and the user make final decisions.

## Quick Start

**Simplest review (90 seconds):**

```bash
codex exec --sandbox read-only "Review the file: path/to/file.md

Focus on: architecture, performance, security

Provide:
- Top 3 strengths
- Top 3 concerns
- Top 3 recommendations

TIME BUDGET: 90 seconds maximum
START RESPONSE NOW."
```

**That's it!** Codex will:
1. Read the file you specified
2. Analyze it based on your focus areas
3. Return structured feedback in ~90 seconds

The `TIME BUDGET` in the prompt keeps reviews fast by default.

**Note for Claude Code:** When using this skill, use the Bash tool with `run_in_background: true` to launch Codex, then poll with BashOutput to automatically detect completion. See Phase 2 for details.

## Choosing Your Review Mode

**Decision tree for picking the right approach:**

```
What are you reviewing?
│
├─ Single file, obvious focus (e.g., "review for security")
│  → Use: Quick Command (30 seconds)
│  → Skip: AskUserQuestion phase
│  → Example: codex exec "Review FILE focusing on security..."
│
├─ Single file, need to ask user what to focus on
│  → Use: Interactive Workflow (3-5 minutes)
│  → Include: Phase 1 (AskUserQuestion) for focus areas
│  → Then: Run Codex with selected focus
│
├─ Multiple related files (2-5 files)
│  → Use: Multi-file command
│  → Example: codex exec "Review files: file1.ts, file2.ts, file3.ts..."
│
├─ Abstract concept (no file exists)
│  → Use: Concept review (see Advanced)
│  → Need to embed description in prompt
│
└─ Complex project (>5 files, unclear scope)
   → Use: Comprehensive mode (see Advanced)
   → May need multiple focused review calls
```

**Default: Start with Quick Command.** Only use full workflow when you need user interaction to determine focus.

## Workflow

### Phase 1: Prepare for Review (Optional - skip if focus is clear)

**1. Identify the Review Target**

Determine what needs review:
- Specific file path (e.g., `docs/technical/design.md`)
- Code implementation (e.g., `src/auth/handler.ts`)
- Multiple related files
- Abstract concept (no file)

**2. Ask User for Review Scope (when focus is unclear)**

**Note for manual users:** If you're running `codex exec` commands yourself (not using Claude Code), just decide on your focus areas (e.g., "security, performance") and skip to Phase 2. This step is for Claude Code agents.

**If you're Claude Code using this skill:** Use the AskUserQuestion tool to let users select focus areas:

```json
{
  "questions": [{
    "question": "What aspects should Codex review?",
    "header": "Review Focus",
    "multiSelect": true,
    "options": [
      {
        "label": "Architecture & Design",
        "description": "Component structure, design patterns, separation of concerns"
      },
      {
        "label": "Performance",
        "description": "Bottlenecks, optimization opportunities, scalability"
      },
      {
        "label": "Security",
        "description": "Vulnerabilities, input validation, authentication/authorization"
      },
      {
        "label": "Best Practices",
        "description": "Code quality, maintainability, language-specific patterns"
      }
    ]
  }]
}
```

**When to skip this phase:**
- User already specified focus ("review this for security")
- Obvious focus based on context (e.g., performance optimization PR)
- Quick validation where general feedback is fine
- Running commands manually (just pick your own focus areas)

### Phase 1.5: Detect Timeout Preference

**Scan user request for timeout hints:**

| Pattern | Timeout | Examples |
|---------|---------|----------|
| quick/fast/brief + interpeer/review | 60s | "quick interpeer", "fast review" |
| (no modifier) | 90s | "interpeer", "get codex feedback" |
| thorough/comprehensive/detailed | 180s | "thorough interpeer", "detailed review" |
| deep/extensive | 300s | "deep interpeer", "extensive analysis" |
| "N minute(s)" or "N second(s)" | Parse | "2 minute interpeer", "take 5 minutes" |

**Store detected timeout for use in Phase 2.**

### Phase 2: Call Codex CLI

**Step 1: Construct the command with detected timeout**

Use timeout from Phase 1.5 (default: 90s if not detected).

**Default: Single File Review**

```bash
# timeout_seconds determined from Phase 1.5
prompt="Review the file: path/to/file.md

TIME BUDGET: {timeout_seconds/60} minutes maximum
OUTPUT REQUIRED: Start response immediately

Focus on: [aspects from Phase 1 or user request]

Provide:
## Strengths
- [strength 1]
- [strength 2]

## Critical Concerns
- [concern 1] - Severity: [High/Medium/Low]
- [concern 2] - Severity: [High/Medium/Low]

## Recommendations
1. [recommendation 1]
2. [recommendation 2]

START RESPONSE NOW."
```

**Multi-File Review (2-5 files)**

```bash
# Adjust timeout for multi-file: typically 180s or 300s
prompt="Review these files:
- path/to/file1.ts
- path/to/file2.ts
- path/to/file3.ts

TIME BUDGET: {timeout_seconds/60} minutes maximum
OUTPUT REQUIRED: Start response immediately

Focus on: [aspects]

For each file, provide:
- Key findings
- Cross-file issues or inconsistencies

START RESPONSE NOW."
```

**Step 2: Launch in background**

```bash
# Use Bash tool with run_in_background: true
codex exec --sandbox read-only "$prompt"
```

This returns a `bash_id` that identifies the running process.

**Step 3: Poll for results**

```
start_time = current_time
while (elapsed_time < timeout_seconds):
  - Wait 10-15 seconds
  - Call BashOutput(bash_id)
  - User automatically sees any new output (Claude Code presents it)
  - If process completed: break loop, proceed to Phase 3
  - If no new activity: continue polling
  - Update elapsed_time

If timeout reached without completion:
  - Call KillShell(bash_id) to terminate the process
  - Call BashOutput(bash_id) one final time to retrieve partial results
  - Present: "Codex timed out after {timeout_seconds}s. [Partial output]
             Try 'quick interpeer' for faster feedback or 'deep interpeer' for more time."
```

**Common Patterns**

| Review Type | Command Template |
|------------|------------------|
| **Security Review** | `codex exec --sandbox read-only "Review FILE for security. Check: input validation, auth, injection risks. TIME BUDGET: 90s. START NOW."` |
| **Performance Review** | `codex exec --sandbox read-only "Review FILE for performance. Check: bottlenecks, N+1 queries, memory usage. TIME BUDGET: 90s. START NOW."` |
| **Code Quality** | `codex exec --sandbox read-only "Review FILE for best practices. Check: maintainability, error handling, patterns. TIME BUDGET: 90s. START NOW."` |
| **Architecture** | `codex exec --sandbox read-only "Review FILE for architecture. Check: separation of concerns, coupling, scalability. TIME BUDGET: 90s. START NOW."` |

### Phase 3: Present Feedback to User

**Use this template for presenting feedback:**

```markdown
# Interpeer Review: [File/Project Name]

## Executive Summary

[Codex's 2-3 sentence overall assessment]

## Strengths ✅

- [Strength 1 with file:line reference if available]
- [Strength 2]
- [Strength 3]

## Concerns ⚠️

### Critical
[Issues that must be addressed - bugs, security, performance blockers]

- **[Finding name]** ([file:line])
  - [Description]
  - Impact: [explain severity]

### Important
[Should be addressed - architecture, maintainability, scalability]

- **[Finding name]** ([file:line])
  - [Description]

### Minor
[Nice-to-have improvements]

- [Suggestion 1]

## Recommendations 💡

### 1. [Top Priority Recommendation]

**Codex's recommendation:** "[Direct quote from Codex]"

**My analysis:** [Your interpretation with project context]

**Impact if addressed:** [What improves]

**Your take?** [Question to user]

### 2. [Second Priority]

**Codex's recommendation:** "[Quote]"

**My analysis:** [Your take]

**Trade-offs:** [Pros/cons of implementing]

### 3. [Third Priority]

**Codex's recommendation:** "[Quote]"

**My analysis:** [Your take]

## Discussion

What do you think about these findings? Should we:
- [Specific action 1 based on feedback]
- [Specific action 2]
- [Alternative approach 3]

Which would you like to tackle first?
```

**Key principles:**
- Start with Codex's executive summary verbatim
- Organize concerns by severity (Critical/Important/Minor)
- For each recommendation, provide BOTH Codex's view AND your analysis
- Always include file:line references when available
- Ask specific questions to guide discussion
- Propose concrete next steps

### Phase 4: Collaborative Review

**Discuss each point with the user:**

For each piece of feedback:

1. **Present the feedback point**
   ```
   Codex raised this concern: "[feedback quote]"
   ```

2. **Provide your analysis**
   ```
   I think this is [valid/questionable/contextual] because [reasoning]
   ```

3. **Ask user for input**
   ```
   What do you think about this feedback? Should we:
   - Address it now
   - Note it for later
   - Disagree and explain why
   ```

4. **Discuss implications**
   - How would addressing this change the design?
   - What's the trade-off?
   - Is it worth the complexity?

### Phase 5: Action Planning

**After reviewing all feedback:**

```
Based on Codex's feedback and our discussion, here's what I recommend:

Immediate Changes:
1. [Critical fix 1]
2. [Critical fix 2]

Future Enhancements:
1. [Nice to have 1]
2. [Nice to have 2]

Disagreements (with reasoning):
1. [Feedback we decided not to follow and why]

Would you like me to:
- Update the design document with these changes?
- Create a task list for addressing the feedback?
- Implement the critical changes now?
```

## Advanced Scenarios

### Conceptual/Abstract Reviews (No File)

When reviewing an approach or concept that doesn't exist as a file:

```bash
cat <<'EOF' | codex exec --sandbox read-only -
Review this technical approach:

## Context
[Background and constraints]

## Proposed Solution
[Your approach]

## Alternatives Considered
[Other options]

## Questions
[Specific questions for review]

TIME BUDGET: 90 seconds
OUTPUT REQUIRED: Start immediately with trade-offs and recommendations
START RESPONSE NOW.
EOF
```

### Complex Projects (>5 files)

For large reviews, use focused multiple calls rather than one comprehensive call:

**Phase 1: Architecture Overview (90s)**
```bash
codex exec --sandbox read-only "Quick architecture scan of:
- src/main.rs
- src/lib.rs
- src/config.rs

TIME BUDGET: 90 seconds
Provide: Top 3 architectural strengths, top 3 concerns
START NOW."
```

**Phase 2: Deep Dive on Concerns (180s, only if Phase 1 found issues)**
```bash
codex exec --sandbox read-only "Deep dive on [specific concern from Phase 1].

Focus on file: [file identified in Phase 1]

TIME BUDGET: 180 seconds
Provide: Root cause, location, fix recommendation
START NOW."
```

### Monitoring for Long-Running Reviews

**For Claude Code agents using background execution:**

Automatic timeout handling is built into Phase 2. If Codex exceeds the timeout (60s/90s/180s/300s based on user request), Claude will:
1. Call `KillShell(bash_id)` to terminate the process
2. Retrieve partial results via `BashOutput(bash_id)`
3. Present what was completed and suggest adjustments

**Manual recovery if needed:**
```bash
# If manually running Codex and it seems stuck:
# Kill the process
pkill -f "codex exec"

# Or Ctrl+C if running in foreground

# Restart with narrower scope or shorter timeout
codex exec --sandbox read-only "Quick review of FILE.
Focus only on: [one specific aspect]
TIME: 60 seconds
START NOW."
```

## Reverse Second Opinion (Codex → Claude)

Interpeer can also gather feedback from other agents using the `interpeer_review` MCP tool. Reach for this after sharing Codex’s results when the user asks “what would Claude say?” or when you want confirmation from another reviewer.

**Offer this when:**
- The user explicitly requests Claude’s take or mentions the reverse workflow.
- You see a high-risk concern and want a second perspective before acting.
- You’re presenting trade-offs and multiple opinions would help the decision.

**Prerequisites:**
- `tools/interpeer-mcp/dist/bin/interpeer-mcp.js` exists (`pnpm run build`) and is executable (`chmod +x`).
- `INTERPEER_PROJECT_ROOT` is set for sessions launched outside the repo root.
- Backend agents are configured; default `target_agent` is `claude_code`.

**Claude Code usage:**
```json
{
  "tool": "interpeer:interpeer_review",
  "input": {
    "content": "<summary or snippet>",
    "focus": ["security", "maintainability"],
    "review_type": "code",
    "style": "structured",
    "time_budget_seconds": 120,
    "target_agent": "claude_code"
  }
}
```
- Reuse focus areas/time budget from Phase 1 or ask the user to adjust.
- For alternative reviewers set `target_agent` to `codex_cli` or `factory_droid`.

**Handling the response:**
1. Wait for the MCP tool output (includes responding agent + usage).
2. Present Claude’s findings in the same Strengths/Concerns/Recommendations structure.
3. Compare with Codex’s assessment: highlight agreements, new insights, and conflicts.

**Troubleshooting:**
- If the tool fails, confirm the CLI exists (`which claude`, `which codex`, `which factory`).
- Ensure `INTERPEER_PROJECT_ROOT` is exported in the MCP server environment.
- Increase retry limits with env vars (e.g., `INTERPEER_CLAUDE_MAX_RETRIES=5`).

**Discussion pattern:**
```markdown
## Claude’s Second Opinion (via interpeer)
- Agent: Claude Code
- Template: Code Review
- Time Budget: 120s

### Strengths
...

### Concerns
...

### Recommendations
...

Comparison with Codex:
- Agreement: …
- New insights: …
- Conflicts: … (decide together)
```

## Critical Review Principles

### 1. Codex as Expert Consultant, Not Authority

**Remember:**
- Codex provides valuable input but doesn't know your full context
- You and the user make the final decisions
- Some feedback may not apply to your specific use case

**Pattern:**
```
Codex suggests: [feedback]

My analysis: [your interpretation with context]

Recommendation: [what you think should be done and why]

What do you think?
```

### 2. Balance Feedback with Project Constraints

**Consider:**
- Performance requirements
- Existing architecture decisions
- Project scope (YAGNI vs future-proofing)
- Team expertise and maintainability

**Pattern:**
```
Codex recommends [X], which would improve [Y].

However, given our constraints:
- [Constraint 1]
- [Constraint 2]

I suggest [modified approach] instead because [reasoning].
```

### 3. Separate Categories of Feedback

**Critical (Must Address):**
- Correctness issues (bugs, logic errors)
- Security vulnerabilities
- Performance blockers
- Data loss risks

**Important (Should Address):**
- Architectural improvements
- Maintainability concerns
- Missing error handling
- Scalability issues

**Nice-to-Have (Consider):**
- Code style suggestions
- Alternative approaches
- Future optimizations
- Documentation improvements

## Example Usage Patterns

### Pattern 1: Quick File Review

```
User: "Can you get Codex feedback on the auth handler?"

You:
1. codex exec --sandbox read-only "Review src/auth/handler.ts
   Focus: security, error handling
   TIME BUDGET: 90s
   START NOW."
2. Present feedback using template
3. Discuss findings with user
4. Update code if needed
```

### Pattern 2: Design Document with User Input

```
User: "Review the agent system design"

You:
1. Use AskUserQuestion to get focus areas
2. codex exec with selected focus areas
3. Present organized feedback
4. Discuss each recommendation
5. Update design document with agreed changes
```

### Pattern 3: Pre-Implementation Validation

```
After completing design:

You: "I've completed the design. Would you like me to get Codex feedback before implementation?"

User: "Yes"

You:
1. Quick review: codex exec with architecture/performance focus
2. Present findings
3. Discuss and resolve concerns
4. Update design if needed
5. Proceed to implementation with validated design
```

## Best Practices

**DO:**
- Start with simple commands, add complexity only when needed
- Always provide your own analysis alongside Codex feedback
- Organize feedback by priority/severity
- Discuss trade-offs for each suggestion
- Make final decisions collaboratively
- Use timeout hints: "quick interpeer" for fast feedback, "deep interpeer" for thorough analysis
- Launch Codex in background (Claude Code) and poll for automatic completion

**DON'T:**
- Blindly implement all Codex suggestions without discussion
- Present feedback without context or analysis
- Skip discussing feedback that seems wrong
- Assume Codex knows your project constraints
- Use Codex as the sole decision-maker
- Over-complicate the review process

## Quick Reference

**Timeout patterns for users:**
- "quick interpeer" → 60s
- "interpeer" (default) → 90s
- "thorough interpeer" → 180s
- "deep interpeer" → 300s

**Command templates:**

```bash
# Standard file review (90s default)
codex exec --sandbox read-only "Review FILE focusing on ASPECTS. TIME: 90s. START NOW."

# Multi-file (adjust timeout: 180s or 300s)
codex exec --sandbox read-only "Review files: FILE1, FILE2, FILE3 focusing on ASPECTS. TIME: 180s. START NOW."

# Security focused
codex exec --sandbox read-only "Review FILE for security vulnerabilities. Check: injection, auth, validation. TIME: 90s. START NOW."

# Performance focused
codex exec --sandbox read-only "Review FILE for performance issues. Check: bottlenecks, memory, algorithms. TIME: 90s. START NOW."

# Architecture focused
codex exec --sandbox read-only "Review FILE for architecture. Check: coupling, patterns, scalability. TIME: 90s. START NOW."
```

## Remember

This skill is about **collaborative review**, not automated acceptance:
1. Get Codex's expert perspective
2. Add your contextual analysis
3. Discuss with user
4. Make informed decisions together
5. Document reasoning for accepted/rejected feedback

The goal is **better decisions through multiple perspectives**, not replacing human judgment.
