# Procedure Identification Heuristics

Guidelines and prompts for identifying testable procedures in documentation. Use these patterns to analyze docs and determine what can be converted to Doc Detective tests.

## What Makes a Testable Procedure?

A testable procedure has:

1. **Sequential steps** - Ordered actions that build on each other
2. **Observable actions** - Things that can be automated (click, navigate, verify)
3. **Defined outcomes** - Expected results that can be verified
4. **Reproducible context** - Clear starting point and requirements

## Structural Indicators

### High-Confidence Patterns

These patterns strongly indicate testable procedures:

| Pattern | Example | Confidence |
|---------|---------|------------|
| Numbered lists | `1. Click... 2. Enter... 3. Verify...` | 90% |
| Heading with "How to" | `## How to Configure SSO` | 85% |
| Heading with "Getting Started" | `# Getting Started` | 80% |
| Task-oriented heading | `## Create a New Project` | 80% |
| Heading with action verb | `## Install the Package` | 75% |

### Medium-Confidence Patterns

| Pattern | Example | Confidence |
|---------|---------|------------|
| Bullet lists with actions | `- Click Settings` | 60% |
| Sequential prose | `First, navigate to... Then, click...` | 55% |
| Code blocks with commands | ` ```bash npm install``` ` | 50% |

### Low-Confidence Patterns

| Pattern | Example | Confidence |
|---------|---------|------------|
| Conceptual explanations | `OAuth works by...` | 20% |
| Reference tables | `| Option | Description |` | 15% |
| FAQs | `Q: How does it work?` | 10% |

## Action Verb Detection

### Navigation Verbs → `goTo` action

```
navigate (to), go to, open, visit, access, browse to, proceed to, launch
```

Examples:
- "Navigate to the **Settings** page" → `{ "goTo": "..." }` or `{ "click": "Settings" }`
- "Open https://example.com" → `{ "goTo": "https://example.com" }`

### Click Verbs → `click` action

```
click, tap, select, press, choose, check (checkbox), toggle
```

Examples:
- "Click **Submit**" → `{ "click": "Submit" }`
- "Select the **Advanced** option" → `{ "click": "Advanced" }`

### Input Verbs → `type` action

```
type, enter, input, fill in, provide, specify, write
```

Examples:
- "Enter your email address" → `{ "type": { "keys": "...", "selector": "..." } }`
- "Type 'hello world' in the search box" → `{ "type": { "keys": "hello world", "selector": "..." } }`

### Verification Verbs → `find` action

```
verify, check (that), confirm, ensure, see, should see, look for, expect, appears
```

Examples:
- "Verify the **Dashboard** appears" → `{ "find": "Dashboard" }`
- "You should see a success message" → `{ "find": "..." }`

### Execution Verbs → `runShell` action

```
run, execute, run command, type in terminal, enter in terminal
```

Examples:
- "Run `npm install`" → `{ "runShell": { "command": "npm install" } }`

## LLM Prompts for Procedure Extraction

### Initial Scan Prompt

```
Analyze the following documentation and identify all procedural content.
For each procedure found, extract:

1. Procedure name (from heading or context)
2. Starting requirements (prerequisites)
3. List of steps in order
4. Expected outcome

Focus on:
- Numbered or bulleted step lists
- "How to" sections
- Task-oriented content
- Getting started guides
- Tutorials

Ignore:
- Conceptual explanations
- Reference documentation
- API specifications (unless they show example workflows)
- Changelog entries

Documentation:
---
{DOCUMENTATION_CONTENT}
---
```

### Step Extraction Prompt

```
For the following procedure, extract each individual step and categorize it:

Procedure: {PROCEDURE_NAME}
Content:
---
{PROCEDURE_CONTENT}
---

For each step, provide:
1. Step number
2. Action type: navigation | click | type | verify | execute | wait | other
3. Target: URL, element text, selector, or command
4. Notes: Any special requirements or conditions

Format as JSON:
{
  "steps": [
    {
      "number": 1,
      "action": "navigation",
      "target": "https://example.com",
      "notes": "Starting point"
    }
  ]
}
```

### Action Mapping Prompt

```
Convert the following step to a Doc Detective action.

Step: {STEP_DESCRIPTION}
Context: {SURROUNDING_CONTEXT}

Rules:
- Prefer text-based matching over selectors
- Use the simplest action format that works
- Include description for clarity

Available actions:
- goTo: Navigate to URL
- click: Click element by text
- find: Verify element exists
- type: Type text (requires keys and selector)
- httpRequest: API calls
- runShell: Shell commands
- screenshot: Capture image
- wait: Pause execution
- checkLink: Verify URL is accessible

Output valid JSON for one Doc Detective step.
```

## Procedure Scoring Matrix

Use this matrix to prioritize which procedures to generate tests for:

| Factor | Weight | Score 1-5 |
|--------|--------|-----------|
| Clear steps | 30% | Number of explicit steps |
| Action verbs | 25% | Presence of testable verbs |
| URL references | 15% | Has URLs to navigate |
| UI elements | 15% | References buttons, fields, etc. |
| Defined outcome | 15% | Has clear success criteria |

**Priority thresholds:**
- Score ≥ 4.0: High priority - generate test immediately
- Score 3.0-3.9: Medium priority - generate test
- Score 2.0-2.9: Low priority - flag for review
- Score < 2.0: Skip - likely not testable

## Mapping to Doc Detective Actions

### From Documentation Elements

| Documentation Element | Doc Detective Action |
|-----------------------|---------------------|
| `[Link](url)` after "Go to" | `{ "goTo": "url" }` |
| `**Bold text**` after click verb | `{ "click": "Bold text" }` |
| `**Bold text**` standalone | `{ "find": "Bold text" }` |
| `"quoted text"` after type verb | `{ "type": { "keys": "quoted text", "selector": "..." } }` |
| Code block with shell command | `{ "runShell": { "command": "..." } }` |
| Image with `.screenshot` class | `{ "screenshot": "path.png" }` |
| Hyperlink | `{ "checkLink": "url" }` |

### Special Cases

**Environment variables:**
When docs mention "enter your API key" or similar:
```json
{ "type": { "keys": "$API_KEY$", "selector": "..." } }
```

**Wait conditions:**
When docs say "wait for" or "until":
```json
{ "wait": { "selector": ".loading", "state": "hidden" } }
```

**Form submissions:**
When docs describe submitting forms:
```json
{ "type": { "keys": "$ENTER$", "selector": "..." } }
// or
{ "click": "Submit" }
```

## Related Resources

- Doc Detective actions: ../../../doc-testing/references/actions.md
- Test structure: https://doc-detective.com/docs/get-started/tests
- Detected tests: https://doc-detective.com/docs/get-started/tests#detected-tests
