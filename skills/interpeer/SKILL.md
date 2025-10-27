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

## The Entire Workflow (TL;DR)

1. **Run Codex**: `codex exec --sandbox read-only "Review FILE focusing on X, Y, Z..."`
2. **Present**: Format and share Codex's feedback with the user
3. **Discuss**: Analyze together, adding your contextual knowledge
4. **Decide**: Choose what to implement, defer, or reject (together)

**Key principle**: Codex is an expert consultant, not an authority. You and the user make final decisions.

## Workflow

### Step 1: Identify What to Review

Determine the review target:
- Specific file path (e.g., `docs/design.md`, `src/auth.ts`)
- Multiple files (2-5 files)
- Abstract concept (described in the prompt)

### Step 2: (Optional) Ask User for Focus Areas

If the user hasn't specified what to focus on, you can ask:

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

**Skip this step if:**
- User already specified focus ("review this for security")
- Context makes focus obvious (e.g., performance optimization)
- General feedback is fine

### Step 3: Call Codex CLI

Use the Bash tool to run `codex exec` synchronously:

```bash
codex exec --sandbox read-only "Review the file: path/to/file.md

Focus on: [architecture, performance, security, etc.]

Provide:
## Strengths
- [strength 1]
- [strength 2]
- [strength 3]

## Concerns
- [concern 1] - Severity: [High/Medium/Low]
- [concern 2] - Severity: [High/Medium/Low]
- [concern 3] - Severity: [High/Medium/Low]

## Recommendations
1. [recommendation 1]
2. [recommendation 2]
3. [recommendation 3]

Be concise and specific."
```

**Important parameters:**
- `--sandbox read-only` - Safe mode (no file modifications)
- `timeout` parameter on Bash tool - Use 120000ms (2 minutes) for most reviews, 180000ms (3 minutes) for complex/multi-file reviews

**For multiple files:**
```bash
codex exec --sandbox read-only "Review these files:
- path/to/file1.ts
- path/to/file2.ts
- path/to/file3.ts

Focus on: [aspects]

Provide strengths, concerns (by severity), and recommendations.
Be concise and specific."
```

**For abstract concepts:**
```bash
cat <<'EOF' | codex exec --sandbox read-only -
Review this technical approach:

## Context
[Background and constraints]

## Proposed Solution
[Your approach]

## Alternatives Considered
[Other options]

Focus on: trade-offs, risks, scalability

Provide: strengths, concerns (by severity), recommendations.
Be concise and specific.
EOF
```

### Step 4: Present Feedback to User

Use this template to organize and present Codex's feedback:

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

**Trade-offs:** [Pros/cons of implementing this]

**Your take?** [Question to user]

### 2. [Second Priority]

**Codex's recommendation:** "[Quote]"

**My analysis:** [Your take]

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
- Organize concerns by severity (Critical/Important/Minor)
- For each recommendation, provide BOTH Codex's view AND your analysis
- Include file:line references when available
- Ask specific questions to guide discussion
- Propose concrete next steps

### Step 5: Discuss Each Point

For each piece of feedback:

1. **Present the finding**: "[Codex's observation]"
2. **Add your analysis**: "I think this is [valid/contextual/questionable] because [reasoning]"
3. **Discuss trade-offs**: What would change if we addressed this? Is it worth the complexity?
4. **Get user input**: What do you think? Should we address it now, note for later, or disagree?

### Step 6: Action Planning

After discussing all feedback:

```markdown
Based on Codex's feedback and our discussion, here's what I recommend:

## Immediate Changes
1. [Critical fix 1]
2. [Critical fix 2]

## Future Enhancements
1. [Nice to have 1]
2. [Nice to have 2]

## Disagreements (with reasoning)
1. [Feedback we decided not to follow and why]

Would you like me to:
- Update the design document with these changes?
- Create a task list for addressing the feedback?
- Implement the critical changes now?
```

## Error Handling

If `codex exec` fails, the error will appear in stderr. Common issues:

| Error Message | Likely Cause | Solution |
|--------------|-------------|----------|
| "command not found: codex" | Codex CLI not installed | Install from https://github.com/openai/codex-cli |
| "authentication failed" | API key not configured | Run `codex config set api_key YOUR_KEY` |
| "network error" / "connection refused" | Network/internet issue | Check internet connection, retry |
| "file not found" | Invalid file path | Verify file path is correct |
| "rate limit" / "quota exceeded" | API rate limiting | Wait a moment, try again |

For most errors, simply present the error message to the user and suggest the appropriate solution.

## Example Usage

### Pattern 1: Quick File Review

```
User: "Can you get Codex feedback on the auth handler?"

You:
1. Run: codex exec --sandbox read-only "Review src/auth/handler.ts
   Focus: security, error handling..."
2. Present feedback using template
3. Discuss findings with user
4. Update code if needed
```

### Pattern 2: Design Document Review

```
User: "Review the agent system design"

You:
1. Ask user for focus areas (if not specified)
2. Run: codex exec with selected focus
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
1. Run: codex exec with architecture/scalability focus
2. Present findings
3. Discuss and resolve concerns
4. Update design if needed
5. Proceed to implementation with validated design
```

## Best Practices

**DO:**
- Use for important architectural decisions
- Review designs before major implementations
- Provide your own analysis alongside Codex feedback
- Discuss and evaluate all feedback collaboratively
- Organize by priority (Critical > Important > Minor)
- Make final decisions with the user

**DON'T:**
- Blindly implement all Codex suggestions
- Skip discussing feedback that seems wrong
- Use Codex as the sole decision-maker
- Forget to consider project-specific context
- Over-complicate the review process

## Remember

This skill is about **collaborative review**, not automated acceptance:
1. Get Codex's expert perspective
2. Add your contextual analysis
3. Discuss with user
4. Make informed decisions together
5. Document reasoning for accepted/rejected feedback

The goal is **better decisions through multiple perspectives**, not replacing human judgment.

Codex is an expert consultant. You and the user are the decision-makers.
