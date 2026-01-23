---
description: Interpret documentation procedures into Doc Detective test specifications without executing
---

# Generate Tests Command

Convert documented procedures into Doc Detective test specifications. This command interprets documentation, generates a spec, validates it, and outputs the result—without executing the tests.

## Usage

```
/doc-detective:generate <file-path> [options]
```

**Options:**
- `--output <path>` - Write spec to file instead of stdout
- `--merge <existing-spec>` - Augment an existing spec file with new tests

## Examples

Generate spec to stdout:

```
/doc-detective:generate docs/getting-started.md
```

Save to file:

```
/doc-detective:generate docs/login.md --output tests/login-spec.json
```

Merge into existing spec:

```
/doc-detective:generate docs/new-feature.md --merge tests/existing-spec.json
```

## Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 1. Parse     │────▶│ 2. Interpret │────▶│ 3. Validate  │────▶│ 4. Output    │
│ (read docs)  │     │ (map actions)│     │ (fix errors) │     │ (spec JSON)  │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### Step 1: Parse Documentation

Read the source file and identify all step-by-step procedures. Look for:

- Numbered lists (1. 2. 3.)
- Bullet lists describing sequential actions
- Prose with action verbs (navigate, click, enter, verify)
- Code blocks with commands to execute
- API endpoint descriptions

Each distinct procedure becomes a separate test within the spec.

### Step 2: Interpret to Actions

Map documentation language to Doc Detective actions:

| Documentation describes | Action | Example |
|---|---|---|
| Navigate/go to URL | `goTo` | `{ "goTo": "https://example.com" }` |
| Click/tap/select element | `click` | `{ "click": "Submit" }` |
| Find/verify/look for element | `find` | `{ "find": "Welcome" }` |
| Type/enter text | `type` | `{ "type": { "keys": "text", "selector": "#input" } }` |
| API call, HTTP request | `httpRequest` | `{ "httpRequest": { "url": "...", "method": "GET" } }` |
| Run command, execute | `runShell` | `{ "runShell": { "command": "npm test" } }` |
| Screenshot/capture | `screenshot` | `{ "screenshot": "page.png" }` |
| Wait/pause/delay | `wait` | `{ "wait": 2000 }` |
| Check link/verify URL | `checkLink` | `{ "checkLink": "https://example.com" }` |
| Load environment vars | `loadVariables` | `{ "loadVariables": ".env" }` |

**Prefer text over selectors.** When docs say "Click Submit", use:

```json
{ "click": "Submit" }
```

Not:

```json
{ "click": { "selector": "button.submit" } }
```

Use selectors only when:
- Documentation explicitly provides them
- Multiple elements share the same text
- Element has no visible text (icon buttons)

### Step 3: Validate and Correct

After generating the spec, validate it:

```bash
echo '<generated-spec>' | node skills/doc-testing/scripts/validate-test.js --stdin
```

If validation fails:
1. Read the error messages
2. Identify which steps have invalid structure
3. Re-interpret those steps with correct action format
4. Re-validate until all checks pass

**Common validation fixes:**

| Error | Fix |
|---|---|
| "No recognized action" | Ensure step has exactly one action property |
| "type must be object with keys" | Change `"type": "text"` to `{ "type": { "keys": "text", "selector": "..." } }` |
| "goTo must be string or object with url" | Ensure URL is provided |
| "tests array required" | Wrap tests in `{ "tests": [...] }` |

### Step 4: Output

**Default (stdout):** Print the validated JSON spec.

**With `--output`:** Write to the specified file path.

**With `--merge`:**
1. Load the existing spec file
2. Compare test IDs to avoid duplicates
3. Add new tests from the documentation
4. Preserve existing tests unchanged
5. Output the merged spec

## Output Format

```json
{
  "tests": [
    {
      "testId": "procedure-name",
      "description": "Description from documentation",
      "steps": [
        {
          "stepId": "step-1",
          "description": "What this step does",
          "goTo": "https://example.com"
        },
        {
          "description": "Click the sign in button",
          "click": "Sign In"
        },
        {
          "description": "Enter email address",
          "type": {
            "keys": "user@example.com",
            "selector": "#email"
          }
        },
        {
          "description": "Verify dashboard loads",
          "find": "Dashboard"
        }
      ]
    }
  ]
}
```

## Full Example

**Input documentation (`docs/login.md`):**

```markdown
# Login Guide

To log into the application:

1. Navigate to https://app.example.com/login
2. Enter your email in the email field
3. Enter your password
4. Click the "Sign In" button
5. You should see the Dashboard page
```

**Generated spec:**

```json
{
  "tests": [
    {
      "testId": "login-guide",
      "description": "Login Guide - To log into the application",
      "steps": [
        {
          "stepId": "navigate-login",
          "description": "Navigate to https://app.example.com/login",
          "goTo": "https://app.example.com/login"
        },
        {
          "stepId": "enter-email",
          "description": "Enter your email in the email field",
          "type": {
            "keys": "$EMAIL$",
            "selector": "[type='email'], #email, [name='email']"
          }
        },
        {
          "stepId": "enter-password",
          "description": "Enter your password",
          "type": {
            "keys": "$PASSWORD$",
            "selector": "[type='password'], #password, [name='password']"
          }
        },
        {
          "stepId": "click-sign-in",
          "description": "Click the Sign In button",
          "click": "Sign In"
        },
        {
          "stepId": "verify-dashboard",
          "description": "You should see the Dashboard page",
          "find": "Dashboard"
        }
      ]
    }
  ]
}
```

## Actions Reference

For complete action documentation, see:
- `skills/doc-testing/references/actions.md`
- https://doc-detective.com/docs/category/actions

### Available Actions

| Action | Purpose |
|---|---|
| `goTo` | Navigate to URL |
| `click` | Click element (prefer text) |
| `find` | Verify element exists (prefer text) |
| `type` | Type keys into field |
| `httpRequest` | HTTP API call |
| `runShell` | Execute shell command |
| `runCode` | Execute code snippet |
| `screenshot` | Capture PNG |
| `wait` | Pause or wait for element |
| `checkLink` | Verify URL returns OK status |
| `loadVariables` | Load .env file |
| `saveCookie` | Save browser cookies |
| `loadCookie` | Load browser cookies |
| `record` | Start video recording |
| `stopRecord` | Stop video recording |
| `dragAndDrop` | Drag element to target |

## Notes

- This command does NOT execute tests—use `/doc-detective:test` for execution
- Use `/doc-detective:validate` to re-validate an existing spec
- Variable placeholders like `$EMAIL$` should be replaced with actual values or loaded via `loadVariables`
