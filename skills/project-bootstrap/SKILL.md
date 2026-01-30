---
name: project-bootstrap
description: Initialize Doc Detective in a repository by detecting documentation, generating minimal config, creating tests for procedures, and iteratively running/fixing them. Use when (1) setting up Doc Detective in a new project, (2) user asks to "init" or "bootstrap" doc testing, (3) creating initial test coverage for existing documentation, or (4) onboarding a project to Doc Detective workflows.
---

# Project Bootstrap

Initialize Doc Detective in a repository with documentation detection, minimal configuration, test generation, and iterative test execution with intelligent fix suggestions.

## When to Use This Skill

Use this skill when:

- Setting up Doc Detective in a new or existing project
- User mentions "init", "bootstrap", "setup", or "get started with Doc Detective"
- Creating initial test coverage for documentation
- Onboarding a codebase to documentation testing workflows

## Workflow Overview

```
┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
│ 1. Detect │─▶│2. Configure│─▶│3. Generate│─▶│ 4. Execute│─▶│ 5. Fix    │─▶│ 6. Inject │
│(scan docs)│  │(min config)│  │(create    │  │(run tests)│  │(iterative)│  │(to source)│
│           │  │            │  │ tests)    │  │           │  │           │  │           │
└───────────┘  └───────────┘  └───────────┘  └───────────┘  └───────────┘  └───────────┘
      │              │              │              │              │              │
      ▼              ▼              ▼              ▼              ▼              ▼
   Agent        Merge/Create   doc-testing    Doc Detective  Confidence   inline-test
   analysis     .doc-detective skill workflow CLI execution  threshold    -injection
```

## Modes of Operation

| Mode | Flag | Behavior |
|------|------|----------|
| Interactive | (default) | Guided prompts, user confirmation at key steps |
| CI/Headless | `--ci` | Non-interactive, sensible defaults, no prompts |
| Dry Run | `--dry-run` | Show planned changes without applying |

## Fix Loop Options

| Option | Default | Description |
|--------|---------|-------------|
| `--fix-threshold <0-100>` | 80 | Flag user when confidence below this percentage |
| `--auto-fix` | false | Apply all fixes automatically regardless of confidence |

## Phase 1: Detect Documentation

The agent scans the repository to understand documentation structure and gather context for subsequent phases. This is an agent-driven analysis, not a CLI tool invocation.

### What the Agent Looks For

1. **Documentation directories** - Common paths like `docs/`, `documentation/`, `content/`, `pages/`, `guides/`
2. **File types** - Identify supported formats and their locations
3. **Structure patterns** - How docs are organized (flat, nested, by feature, by audience)
4. **Existing configuration** - Check for `.doc-detective.json`, `doc-detective.config.js`, etc.
5. **Related tooling** - Look for existing test frameworks, CI configs, build systems

### Supported File Types

| Type | Extensions | Detection Signals |
|------|-----------|-------------------|
| Markdown | `.md`, `.markdown` | File extension, frontmatter patterns |
| MDX | `.mdx` | File extension, JSX import patterns |
| AsciiDoc | `.adoc`, `.asciidoc`, `.asc` | File extension, header patterns |
| reStructuredText | `.rst` | File extension, directive patterns |
| HTML | `.html`, `.htm` | File extension, semantic structure |

### Agent Gathers

- File counts by type and location
- Directory structure overview
- Sample files for pattern analysis
- Potential procedure-heavy files (tutorials, guides, how-tos)
- Any existing test specs or config files
- README and contributing guidelines

### Detection Output

Report identified documentation to user:

```
📁 Documentation detected:
   Markdown: 12 files (docs/, README.md)
   MDX: 3 files (pages/)
   AsciiDoc: 0 files
   
   Total: 15 documentation files
   Estimated procedures: 8-12 (based on heading analysis)
   
   Key directories: docs/, pages/
   Tutorials found: 3
   How-to guides: 5
```

## Phase 2: Configure

Generate minimal Doc Detective configuration following "smallest reasonable config" principle.

### Config Strategy

1. **Check for existing config** - Look for `.doc-detective.json`, `.doc-detective.yaml`, `doc-detective.config.js`
2. **If exists**: Merge new settings, **prompt user for confirmation** before writing
3. **If new**: Create file **without prompting** (silent creation)

### Minimal Config Template

Reference `doc-detective-common` schema. Generate only required fields:

```json
{
  "input": ["docs/**/*.md"],
  "output": ".doc-detective/results"
}
```

Add optional fields only when detected patterns require them:

```json
{
  "input": ["docs/**/*.md", "pages/**/*.mdx"],
  "output": ".doc-detective/results",
  "recursive": true,
  "runTests": {
    "headless": true
  }
}
```

### Config Merge Logic

When merging with existing config:

```
┌─────────────────┐
│ Load existing   │
│ config          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Detect new      │────▶│ Merge arrays    │
│ input paths     │     │ (deduplicate)   │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ PROMPT USER:    │
                        │ "Merge config?" │
                        │ Show diff       │
                        └────────┬────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
              ┌─────────┐               ┌─────────┐
              │ Accept  │               │ Reject  │
              │ Write   │               │ Keep    │
              └─────────┘               │ original│
                                        └─────────┘
```

### CI Mode Config Handling

In `--ci` mode:
- New config: Create silently
- Existing config: Skip merge, use existing as-is
- Report config status in output

## Phase 3: Generate Tests

Delegate to the `doc-testing` skill workflow for creating complete tests from source documentation.

### Procedure Identification

Analyze documentation to identify testable procedures:

1. **Heading patterns** - "How to...", "Getting Started", "Tutorial", numbered steps
2. **Action verbs** - "Click", "Navigate", "Enter", "Select", "Verify"
3. **Code blocks** - Commands, API calls, configuration snippets
4. **Ordered lists** - Step-by-step instructions

See `references/procedure-heuristics.md` for detailed LLM prompts.

### Test Generation Workflow

For each identified procedure:

1. Extract procedural content (steps, expected outcomes)
2. Map to Doc Detective actions per `doc-testing` skill rules
3. Generate test spec following validation requirements
4. **Validate before proceeding** (mandatory gate per doc-testing skill)

Validation uses the `doc-testing` skill's validation workflow to ensure each generated spec is valid before proceeding.

### Progress Tracking

Display generation progress:

```
📝 Generating tests...

| # | Source File | Procedure | Status |
|---|-------------|-----------|--------|
| 1 | docs/login.md | Login flow | ✅ Generated (6 steps) |
| 2 | docs/setup.md | Installation | ✅ Generated (4 steps) |
| 3 | docs/api.md | API auth | ⏳ Generating... |
| 4 | docs/deploy.md | Deployment | ⬜ Pending |
```

## Phase 4: Execute Tests

Run generated tests using Doc Detective CLI.

### Execution Command

```bash
# Primary - Global CLI
doc-detective run --input .doc-detective/tests/ --output .doc-detective/results/

# Secondary - Docker
docker run -v "$(pwd):/app" docdetective/doc-detective:latest run --input /app/.doc-detective/tests/

# Tertiary - NPX
npx doc-detective run --input .doc-detective/tests/
```

### Results Collection

Parse `testResults-<timestamp>.json` for pass/fail status:

```
🧪 Test Execution Results

Summary:
  Tests: 8 passed, 2 failed
  Steps: 45 passed, 5 failed
  
Failed Tests:
  ❌ docs/login.md#login-flow - Step 4: "Element 'Sign In' not found"
  ❌ docs/api.md#api-auth - Step 2: "Unexpected status code 401"
```

## Phase 5: Fix Loop

Iteratively analyze failures and propose fixes with confidence scoring using the `doc-testing` skill's fix-tests tool.

### Using the Fix Tool

```bash
# Analyze failures (dry-run to preview fixes)
node ./skills/doc-testing/scripts/dist/fix-tests.js results.json --spec test-spec.json --dry-run

# Apply fixes above threshold (default 80%)
node ./skills/doc-testing/scripts/dist/fix-tests.js results.json --spec test-spec.json

# Custom threshold
node ./skills/doc-testing/scripts/dist/fix-tests.js results.json --spec test-spec.json --threshold 70

# Auto-fix all regardless of confidence
node ./skills/doc-testing/scripts/dist/fix-tests.js results.json --spec test-spec.json --auto-fix
```

### Fix Loop Flow

```
┌─────────────────┐
│ Analyze failure │
│ (parse error)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate fix    │
│ + confidence %  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Confidence      │
│ >= threshold?   │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────────┐
│ Yes   │ │ No        │
│ Apply │ │ FLAG USER │
│ fix   │ │ for review│
└───┬───┘ └─────┬─────┘
    │           │
    └─────┬─────┘
          │
          ▼
┌─────────────────┐
│ Re-run test     │
│ (max 3 iters)   │
└─────────────────┘
```

### Confidence Scoring

| Score | Meaning | Action |
|-------|---------|--------|
| 90-100% | High confidence - clear fix | Auto-apply (unless below threshold) |
| 70-89% | Medium confidence - likely fix | Apply if above threshold |
| 50-69% | Low confidence - possible fix | Flag user by default |
| <50% | Very low - uncertain | Always flag user |

### Common Fix Patterns

| Error Pattern | Fix Strategy | Typical Confidence |
|---------------|--------------|-------------------|
| Element text changed | Update selector text | 85-95% |
| Timeout on find | Increase wait, add explicit wait | 70-85% |
| URL redirect | Update goTo URL | 80-90% |
| Element not found | Check alternative selectors | 50-70% |
| Auth required | Add login steps | 40-60% |

### User Flagging

When confidence is below threshold (default 80%):

```
⚠️ Low confidence fix (65%) for docs/login.md#login-flow step 4:

  Issue: Element 'Sign In' not found
  
  Proposed fix: 
    Before: { "find": "Sign In" }
    After:  { "find": "Log In" }
  
  Reason: Page may have changed button text from "Sign In" to "Log In"
  
  [A]pply fix  [S]kip  [E]dit manually  [Q]uit fix loop
```

### Fix Loop Limits

- Maximum 3 iterations per test
- Report "needs manual review" if fixes don't resolve after 3 attempts
- Track fix history in results output

## Phase 6: Inject Tests into Source Files

After tests pass (or fixes are applied), inject the verified tests back into the original documentation source files using the `inline-test-injection` skill.

### Injection Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Verified Tests  │────▶│ Match to Source │────▶│ Inject Inline   │
│ (passing specs) │     │ (track origin)  │     │ (preview+apply) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Source File Tracking

During test generation (Phase 3), track which source file each test was derived from:

```json
{
  "tests": [
    {
      "testId": "login-flow",
      "_sourceFile": "docs/login.md",
      "steps": [...]
    }
  ]
}
```

### Injection Options

| Option | Default | Description |
|--------|---------|-------------|
| `--skip-inject` | false | Skip injection phase entirely |
| `--inject-all` | false | Inject without per-file confirmation |

### Interactive Mode Injection

For each source file with passing tests:

1. **Preview changes** using `inline-test-injection` skill workflow

2. **Prompt user for confirmation**:
   ```
   📝 Inject tests into docs/login.md?
   
   Preview shows 6 inline comments will be added.
   
   [Y]es  [N]o  [A]ll remaining  [S]kip all
   ```

3. **Apply on confirmation** using the skill's apply mode

### CI Mode Injection

In `--ci` mode:
- Skip injection by default (tests remain as separate spec files)
- Use `--inject-all` to inject without prompts
- Report injection status in output

### Injection Result Tracking

```
💉 Injection Results

| Source File | Tests | Status |
|-------------|-------|--------|
| docs/login.md | 2 | ✅ Injected |
| docs/setup.md | 1 | ✅ Injected |
| docs/api.md | 1 | ⏭️ Skipped (user declined) |
```

### Comment Format by File Type

The injection tool automatically selects the correct comment format:

| File Type | Comment Syntax |
|-----------|----------------|
| Markdown | `<!-- step {...} -->` |
| MDX | `{/* step {...} */}` |
| HTML | `<!-- step {...} -->` |
| AsciiDoc | `// (step {...})` |
| DITA/XML | `<?doc-detective step {...} ?>` |

## Output Summary

After all phases complete:

```
✅ Doc Detective Bootstrap Complete

Configuration:
  📄 Created .doc-detective.json (minimal config)

Tests Generated:
  📝 8 test specs created in .doc-detective/tests/
  
Execution Results:
  ✅ 6 tests passed
  🔧 2 tests fixed (auto-applied)
  ❌ 0 tests need manual review

Injection:
  💉 6 source files updated with inline tests
  ⏭️ 2 files skipped (no changes needed)

Next Steps:
  • Run `doc-detective run` to execute tests
  • Add to CI: `doc-detective run --ci`
  • Inline tests will run when source files are tested
  • See .doc-detective/results/ for detailed reports
```

## External Resources

- Doc Detective Docs: https://doc-detective.com
- Config Schema: https://doc-detective.com/docs/references/config
- Test Structure: https://doc-detective.com/docs/get-started/tests
- Actions Reference: https://doc-detective.com/docs/category/actions
- doc-detective-common: https://github.com/doc-detective/doc-detective-common
