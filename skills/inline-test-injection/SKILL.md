---
name: inline-test-injection
description: Inject Doc Detective test specs into documentation source files as inline comments. Use when (1) you have a valid test spec (JSON/YAML) with steps and need to embed them in a source file, (2) the user asks to add inline tests to documentation, (3) converting separate test files to inline format, or (4) placing test steps close to their associated content in Markdown, MDX, HTML, AsciiDoc, or XML/DITA files.
---

# Inline Test Injection

Inject test steps from Doc Detective specs into documentation source files as inline comments, placing each step close to its associated content using semantic pattern matching.

## Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ 1. Parse Spec   │────▶│ 2. Read Source  │────▶│ 3. Match Steps  │
│    (JSON/YAML)  │     │    + Detect Type│     │    Semantically │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
                        ┌─────────────────┐     ┌────────▼────────┐
                        │ 5. Apply/Preview│◀────│ 4. Generate     │
                        │    Changes      │     │    Inline Cmts  │
                        └─────────────────┘     └─────────────────┘
```

## Comment Formats by File Type

| File Type | Extensions | Comment Syntax |
|-----------|------------|----------------|
| Markdown | `.md`, `.markdown` | `<!-- step {...} -->` |
| MDX | `.mdx` | `{/* step {...} */}` |
| HTML | `.html`, `.htm` | `<!-- step {...} -->` |
| XML/DITA | `.xml`, `.dita`, `.ditamap` | `<?doc-detective step {...} ?>` |
| AsciiDoc | `.adoc`, `.asciidoc`, `.asc` | `// (step {...})` |

## Usage

### Using the Script

```bash
# Preview mode (default) - shows diff of planned changes
./scripts/dist/inline-test-injection <spec-file> <source-file>

# Apply mode - writes changes to file
./scripts/dist/inline-test-injection <spec-file> <source-file> --apply

# Specify syntax format for inline content
./scripts/dist/inline-test-injection spec.yaml doc.md --syntax yaml
```

### Manual Injection

When the script cannot run or finer control is needed:

1. **Read the test spec** and identify each step's action and value
2. **Scan the source file** for content matching the step (links, bold text, action verbs)
3. **Insert inline comment** immediately after the matching content
4. **Use appropriate comment format** based on file type

## Semantic Matching

Steps are matched to content based on action type and value similarity:

| Step Action | Matches Content Pattern | Example Match |
|-------------|------------------------|---------------|
| `goTo` | Links with navigation verbs | `Go to [Example](https://...)` |
| `checkLink` | Any hyperlink | `[Link](https://...)` |
| `click` | Bold text after action verb | `Click **Submit**` |
| `find` | Bold/emphasized text | `**Welcome**` |
| `type` | Text in quotes after type verb | `Type "hello"` |

**Matching priority:**
1. Exact value match (1.0 score)
2. Contains match (0.8 score)
3. Action type match (0.3 score)
4. Sequential order bonus (+0.2) or penalty (-0.1)

Unmatched steps are flagged and placed after the last matched step.

## Example

**Test spec (search.yaml):**
```yaml
tests:
  - testId: search-kittens
    steps:
      - goTo: https://duckduckgo.com
      - type:
          keys: American Shorthair kittens
          selector: "#search_form_input_homepage"
      - type:
          keys: $ENTER$
```

**Source file (guide.md) before:**
```markdown
## Search Guide

1. Go to [DuckDuckGo](https://duckduckgo.com).
2. In the search bar, type "American Shorthair kittens".
3. Press **Enter**.
```

**After injection:**
```markdown
<!-- test {"testId":"search-kittens"} -->
## Search Guide

1. Go to [DuckDuckGo](https://duckduckgo.com).
<!-- step {"goTo":"https://duckduckgo.com"} -->
2. In the search bar, type "American Shorthair kittens".
<!-- step {"type":{"keys":"American Shorthair kittens","selector":"#search_form_input_homepage"}} -->
3. Press **Enter**.
<!-- step {"type":{"keys":"$ENTER$"}} -->
<!-- test end -->
```

## Configuration Integration

If `.doc-detective.json` or `.doc-detective.yaml` exists, custom markup patterns are loaded. See [references/markup-patterns.md](references/markup-patterns.md) for pattern customization.

## Handling Edge Cases

**No matching content found:**
- Step is flagged as "unmatched" in preview
- Inserted after last matched step or at document start
- User should review and manually reposition if needed

**Multiple potential matches:**
- Highest similarity score wins
- Sequential ordering breaks ties
- Earlier document position preferred for equal scores

**Nested content (lists, blockquotes):**
- Indentation is preserved from the matched line
- Comment inserted at same indentation level
