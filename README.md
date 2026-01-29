# Doc Detective Agent Tools

Agent tools for testing documentation procedures and validating that documented workflows match actual application behavior. Compatible with Claude Code, Cursor, Codex, OpenCode, GitHub Copilot, and other AI coding assistants that support plugins or skills.

## Features

- **Doc Testing Skill** - Full-featured skill for testing documentation procedures using Doc Detective framework
- **Inline Test Injection Skill** - Inject test specifications into documentation as inline comments
- **Generate Tests Command** - Convert documentation into executable test specifications
- **Inject Inline Tests Command** - Embed test steps close to associated documentation content
- **Validate Tests Command** - Validate test specifications before execution

## Installation

### Option 1: Claude Code Plugin

1. Open Claude Code:

   ```bash
   claude
   ```

2. Add the Doc Detective plugin to Claude Code's plugin marketplace:

   ```text
   /plugin marketplace add doc-detective/agent-tools
   ```

2. Then install specific skill sets via:

   ```text
   /plugin install doc-detective@doc-detective
   ```

### Option 2: Install with `npx skills`

> [!WARNING]
> `npx skills` only installs skills, not commands or other agent tools. For full functionality, consider [manual installation](#option-3-manual-installation).

Install these skills with the [`skills`](https://github.com/vercel-labs/skills) package from Vercel. This works with Claude Code, Cursor, Codex, OpenCode, and other AI coding tools.

```bash
npx skills add doc-detective/agent-tools
```

Follow the prompts. The CLI auto-detects which AI tools you have installed and places the skills in the appropriate directories.

### Option 3: Manual Installation

#### Clone to your skills directory

```bash
# For Claude Code
git clone https://github.com/doc-detective/agent-tools.git ~/.claude/skills/doc-detective

# Or for project-local installation
git clone https://github.com/doc-detective/agent-tools.git .claude/skills/doc-detective
```

> [!IMPORTANT]
> Adjust the path based on your AI tool's expected skill/plugin directory.

#### Load locally during development with Claude Code

```bash
git clone https://github.com/doc-detective/agent-tools.git
claude --plugin-dir ./doc-detective
```

Then use the plugin commands:

- `/doc-detective:doc-testing` - Main skill for testing workflows
- `/doc-detective:inject` - Inject test specs into documentation as inline comments
- `/doc-detective:generate` - Generate test specs from documentation
- `/doc-detective:test` - Quick command to test documentation files
- `/doc-detective:validate` - Validate test specifications

## Requirements

- Doc Detective installed globally, via Docker, or accessible via npx:
  - **Global**: `doc-detective` command available
  - **Docker**: Docker installed and `docdetective/docdetective` image available
  - **NPX**: npx available (included with Node.js 15.1.0+)

## Usage

### Convert Documentation to Tests

```bash
/doc-detective:test path/to/documentation.md
```

The skill will:

1. Extract step-by-step procedures from your documentation
2. Convert them to Doc Detective test specifications
3. Validate the test specs
4. Execute tests using Doc Detective
5. Report results with any failures mapped back to documentation sections

### Validate Test Specifications

```bash
/doc-detective:validate test-spec.json
```

Validates structure before execution:

- Required fields present
- Action types recognized
- Parameter types correct

### Use the Core Skill

```bash
/doc-detective:doc-testing <your request>
```

Full documentation testing workflow with complete control over interpretation, validation, and execution.

## Plugin Structure

```
doc-detective/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   ├── doc-testing/             # Core testing skill
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   └── actions.md       # Action reference
│   │   └── scripts/
│   │       └── validate-test.js # Validation script
│   └── inline-test-injection/   # Inline injection skill
│       ├── SKILL.md
│       ├── references/
│       │   └── markup-patterns.md
│       └── scripts/
│           ├── inject-inline.mjs
│           └── format-utils.mjs
├── commands/
│   ├── generate.md             # Generate tests command
│   ├── inject.md               # Inject inline tests command
│   ├── test.md                 # Test docs command
│   └── validate.md             # Validate command
└── README.md
```

## Doc Detective Actions Reference

The plugin includes complete documentation for Doc Detective actions:

| Action                    | Purpose                              |
| ------------------------- | ------------------------------------ |
| `goTo`                    | Navigate to a URL                    |
| `click`                   | Click an element (prefer text-based) |
| `find`                    | Verify an element exists             |
| `type`                    | Type text input                      |
| `httpRequest`             | Make HTTP requests                   |
| `runShell`                | Execute shell commands               |
| `screenshot`              | Capture screenshots                  |
| `wait`                    | Pause or wait for elements           |
| `checkLink`               | Verify URL returns OK                |
| `loadVariables`           | Load environment variables           |
| `saveCookie`/`loadCookie` | Manage session persistence           |
| `record`/`stopRecord`     | Video recording                      |

See `skills/doc-testing/references/actions.md` for detailed documentation.

## Inline Test Injection

Inject test steps from separate spec files directly into documentation as inline comments:

```
/doc-detective:inject tests/login.yaml docs/login.md --apply
```

**Before:**

```markdown
1. Go to [Login Page](https://example.com/login).
2. Click **Sign In**.
```

**After:**

```markdown
1. Go to [Login Page](https://example.com/login).
<!-- step {"goTo":"https://example.com/login"} -->
2. Click **Sign In**.
<!-- step {"click":"Sign In"} -->
```

Steps are matched to content using semantic patterns (links, bold text, action verbs) and placed close to their associated documentation.

## Examples

### Test a Login Procedure

Documentation:

```markdown
# Login Procedure

1. Navigate to https://example.com/login
2. Enter your username
3. Enter your password
4. Click "Sign In"
5. Verify you see the Dashboard
```

Use the skill:

```
/doc-detective-plugin:doc-testing
Test this login procedure from our docs to ensure it still works
```

### Test Multiple Workflows

Create a test specification file `workflows.json`:

```json
{
  "tests": [
    {
      "testId": "signup-flow",
      "description": "New user signup",
      "steps": [
        { "goTo": "https://example.com/signup" },
        { "find": "Create Account" },
        { "type": { "keys": "newuser@example.com", "selector": "#email" } },
        { "click": "Sign Up" },
        { "find": "Welcome" }
      ]
    },
    {
      "testId": "password-reset",
      "description": "Forgot password flow",
      "steps": [
        { "goTo": "https://example.com/login" },
        { "click": "Forgot Password" },
        { "type": { "keys": "user@example.com", "selector": "#email" } },
        { "click": "Reset" },
        { "find": "Check your email" }
      ]
    }
  ]
}
```

Then execute:

```
/doc-detective:test workflows.json
```

## Resources

- [Doc Detective Documentation](https://doc-detective.com)
- [Doc Detective GitHub](https://github.com/doc-detective/doc-detective)
- [Test Specification Format](https://doc-detective.com/docs/get-started/tests)
- [Actions Reference](https://doc-detective.com/docs/category/actions)

## License

MIT

## Contributing

To contribute improvements to this plugin, submit issues or pull requests to the repository.
