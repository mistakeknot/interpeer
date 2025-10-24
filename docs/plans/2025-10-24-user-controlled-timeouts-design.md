# User-Controlled Timeouts for Interpeer

**Date:** 2025-10-24
**Status:** Approved Design
**Author:** Claude Code (with user)

## Problem Statement

Current Interpeer implementation requires users to manually check when Codex finishes processing. The user must guess when Codex is done and explicitly prompt Claude to retrieve results. Additionally, there's no user control over how long Codex should take, making it difficult to balance speed vs thoroughness.

**User pain points:**
1. No automatic detection when Codex completes
2. No control over review duration
3. Default behavior allows Codex to run indefinitely

## Goals

1. **Automatic completion detection** - Claude automatically presents results when Codex finishes
2. **User-controlled timeouts** - Users specify review duration via natural language
3. **Sensible defaults** - Fast reviews by default (under 2 minutes)
4. **Maintain visibility** - Users can see Codex's progress via BashOutput

## Design Overview

### Core Pattern

**Existing behavior (KEEP):**
- Codex runs in background via `Bash(run_in_background: true)`
- Claude polls via `BashOutput` to show progress
- User sees incremental output as it arrives

**New behavior (ADD):**
- Claude detects timeout preference from user's natural language
- Claude polls until completion OR timeout
- On timeout, Claude kills process and presents partial results

### Timeout Detection (Phase 1.5)

Claude scans the user's request for timeout hints using pattern matching:

| Pattern | Timeout | Examples |
|---------|---------|----------|
| quick/fast/brief + interpeer/review | 60s | "quick interpeer", "fast review" |
| (no modifier) | **90s (DEFAULT)** | "interpeer", "get codex feedback" |
| thorough/comprehensive/detailed | 180s | "thorough interpeer", "detailed review" |
| deep/extensive | 300s | "deep interpeer", "extensive analysis" |
| "N minute(s)" or "N second(s)" | Parse | "2 minute interpeer", "take 5 minutes" |

**Implementation:**
- Scan request for keywords before launching Codex
- Store detected timeout value for Phase 2
- Default to 90s if no hint detected
- Support explicit time parsing: "5 minutes" → 300s

### Execution Flow (Phase 2 - Modified)

**Step 1: Construct command with detected timeout**
```bash
timeout_seconds = [60/90/180/300 based on detection]

prompt="Review the file: path/to/file.md
TIME BUDGET: {timeout_seconds/60} minutes maximum
..."
```

**Step 2: Launch in background**
```bash
# Use Bash tool with run_in_background: true
codex exec --sandbox read-only "$prompt"
# Returns: { bash_id: "abc123" }
```

**Step 3: Polling loop**
```
start_time = now()
while (elapsed < timeout_seconds):
  - Wait 10-15 seconds
  - Call BashOutput(bash_id)
  - If new output: user sees it automatically (Claude Code presents it)
  - If process completed: break loop, proceed to Phase 3
  - If no activity: continue polling
  - elapsed = now() - start_time

If timeout reached:
  - Call KillShell(bash_id) to terminate process
  - Call BashOutput(bash_id) one final time for partial results
  - Present partial output with timeout message
```

### Error Handling

**Timeout (process runs too long):**
```
Response: "Codex timed out after {N} seconds. Here's the partial output:
[Show whatever Codex produced]

This might mean the scope was too broad. Try:
- 'quick interpeer' for faster feedback
- Breaking into smaller focused reviews
- 'deep interpeer' if you need more time"
```

**Early failure (Codex crashes):**
```
Detection: BashOutput returns stderr with error
Response: "Codex encountered an error: [error message]
Would you like me to retry with a different prompt?"
```

**Empty output:**
```
Detection: Process exits, but no stdout
Response: "Codex completed but returned no output.
Here's what I asked: [show prompt]
Want to try a different approach?"
```

**Network/auth issues:**
```
Detection: stderr contains "authentication", "network", "API key"
Response: "Codex couldn't connect - looks like an auth/network issue.
Check: codex auth status
Need help troubleshooting?"
```

## Changes to SKILL.md

### 1. Add New Section (Phase 1.5)

Insert after Phase 1, before Phase 2:

```markdown
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
```

### 2. Modify Phase 2: Call Codex CLI

**Replace lines 188-252 with:**

```markdown
### Phase 2: Call Codex CLI

**Step 1: Construct the command with detected timeout**

Use timeout from Phase 1.5 (default: 90s if not detected).

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
```

### 3. Remove Obsolete Sections

**Delete lines 69-103** (old timeout command detection):
- Remove "Want extra safety? Add a timeout command..." section
- Remove "Note for Claude Code Agents" section with gtimeout/timeout detection
- Remove the TIMEOUT_CMD detection bash snippet

**Rationale:** Claude now handles timeouts via polling loop + KillShell, making external timeout commands unnecessary.

### 4. Update Quick Start (lines 44-60)

**Replace:**
```bash
codex exec --sandbox read-only "Review the file: path/to/file.md
TIME BUDGET: 2 minutes maximum
START RESPONSE NOW."
```

**With:**
```bash
codex exec --sandbox read-only "Review the file: path/to/file.md
TIME BUDGET: 90 seconds maximum
START RESPONSE NOW."
```

### 5. Update Common Patterns Table (lines 236-244)

Change all TIME BUDGET values from "2 min" to "90s":

```markdown
| Review Type | Command Template |
|------------|------------------|
| **Security Review** | `codex exec --sandbox read-only "Review FILE for security. Check: input validation, auth, injection risks. TIME BUDGET: 90s. START NOW."` |
| **Performance Review** | `codex exec --sandbox read-only "Review FILE for performance. Check: bottlenecks, N+1 queries, memory usage. TIME BUDGET: 90s. START NOW."` |
```

## User Experience Examples

### Fast Review (60s)
```
User: "Quick interpeer on auth.ts"

Claude: "Starting Codex review (60s timeout)..."
[Shows incremental output via BashOutput polling]
[45s later - completes]
Claude: "Review complete in 45s. Here's the feedback: [formatted output]"
```

### Default Review (90s)
```
User: "Get Codex feedback on the design doc"

Claude: "Starting Codex review..."
[Polls and shows progress]
[85s later - completes]
Claude: "Review complete. Here's Codex's analysis: [formatted output]"
```

### Deep Review (300s)
```
User: "Deep interpeer on the entire agent system"

Claude: "Starting comprehensive Codex review (5 minute timeout)..."
[Polls for several minutes]
[4m 30s later - completes]
Claude: "Review complete in 4m 30s. Here's the detailed analysis: [formatted output]"
```

### Timeout Scenario
```
User: "Quick interpeer on 20 files"

Claude: "Starting Codex review (60s timeout)..."
[Polls for 60 seconds]
Claude: "Codex timed out after 60s. Here's the partial output:
[Shows partial analysis]

This scope might be too broad for a quick review. Try:
- 'thorough interpeer' (3 minutes)
- 'deep interpeer' (5 minutes)
- Breaking into smaller focused reviews"
```

## Implementation Checklist

- [ ] Add Phase 1.5 section to SKILL.md (timeout detection)
- [ ] Update Phase 2 with new polling workflow
- [ ] Update all TIME BUDGET examples from 120s to 90s
- [ ] Remove old timeout command detection (lines 69-103)
- [ ] Update Quick Start section
- [ ] Update Common Patterns table
- [ ] Test pattern matching: "quick interpeer" → 60s
- [ ] Test pattern matching: "interpeer" → 90s (default)
- [ ] Test pattern matching: "thorough interpeer" → 180s
- [ ] Test pattern matching: "deep interpeer" → 300s
- [ ] Test explicit time: "5 minute interpeer" → 300s
- [ ] Test timeout behavior: verify KillShell terminates process
- [ ] Test error handling: verify partial results presented on timeout
- [ ] Update README.md if user-facing examples mention timeouts

## Benefits

1. **No more manual checking** - Users don't need to prompt Claude to check Codex status
2. **User control** - "quick" vs "deep" lets users balance speed and thoroughness
3. **Fast defaults** - 90s keeps most reviews quick
4. **Graceful degradation** - Timeouts present partial results, not failures
5. **No external dependencies** - Uses only Claude Code built-in tools (Bash, BashOutput, KillShell)
6. **Maintains visibility** - Users still see progress via BashOutput polling

## Trade-offs

**Polling overhead:** 10-15s polling intervals mean Claude continuously checks process status. This is acceptable since:
- Polling is lightweight (BashOutput is fast)
- Alternative (no polling) requires manual user intervention
- User sees progress, knows system is working

**Slight completion lag:** With 10-15s polling, there's a delay between Codex finishing and Claude noticing. For reviews taking 60-300s, this 10-15s lag is negligible (<10% overhead).

**No streaming output:** Unlike real-time streaming (character-by-character), BashOutput shows chunks every 10-15s. This is acceptable since:
- Codex doesn't stream - it typically returns complete responses
- Chunked updates are sufficient for user awareness
- Avoids complexity of true streaming implementation

## Future Enhancements (Not in Scope)

- **Adaptive polling:** Speed up polling as timeout approaches
- **Progress indicators:** Show "2m 30s elapsed..." messages
- **Resume capability:** Save partial results and offer to continue with longer timeout
- **Multiple concurrent reviews:** Run multiple Codex processes in parallel

## References

- Current SKILL.md: `/Users/sma/interpeer/skills/interpeer/SKILL.md`
- Claude Code Bash tool: Supports `run_in_background: true`
- Claude Code BashOutput tool: Retrieves output from background shells
- Claude Code KillShell tool: Terminates background processes
