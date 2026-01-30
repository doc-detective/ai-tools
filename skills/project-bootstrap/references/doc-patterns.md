# Documentation Detection Patterns

Reference for identifying documentation files and their formats. Use with `doc-detective-resolver` for canonical detection or fall back to pattern matching.

## Supported File Types

| Type | Extensions | Primary Indicators |
|------|------------|-------------------|
| Markdown | `.md`, `.markdown` | Frontmatter, headings, links |
| MDX | `.mdx` | JSX imports, frontmatter |
| AsciiDoc | `.adoc`, `.asciidoc`, `.asc` | `=` headers, `include::`, `:attributes:` |
| reStructuredText | `.rst` | `.. directive::`, underline headers |
| HTML | `.html`, `.htm` | `<article>`, `<main>`, `<section>` |
| DITA | `.dita`, `.ditamap`, `.xml` | `<!DOCTYPE topic`, `<task>`, `<concept>` |

## Using doc-detective-resolver

The `doc-detective-resolver` package provides canonical detection logic:

```bash
# Install
npm install doc-detective-resolver

# Detect documentation in a directory
npx doc-detective-resolver detect --path . --output report.json
```

**Report structure:**
```json
{
  "files": [
    {
      "path": "docs/setup.md",
      "type": "markdown",
      "hasFrontmatter": true,
      "procedureCount": 3
    }
  ],
  "summary": {
    "markdown": 12,
    "mdx": 3,
    "asciidoc": 0,
    "rst": 0,
    "html": 2,
    "dita": 0,
    "total": 17
  }
}
```

## Fallback Detection Patterns

When `doc-detective-resolver` is unavailable, use these patterns:

### Glob Patterns by Type

```bash
# Markdown
**/*.md
**/*.markdown
!**/node_modules/**
!**/dist/**
!**/build/**
!**/.git/**
!**/CHANGELOG.md

# MDX
**/*.mdx

# AsciiDoc
**/*.adoc
**/*.asciidoc
**/*.asc

# reStructuredText
**/*.rst

# HTML (documentation only)
**/docs/**/*.html
**/documentation/**/*.html
!**/node_modules/**
```

### Content-Based Detection

When extension is ambiguous, check content:

**Markdown indicators:**
- Line starting with `# ` (heading)
- `[text](url)` patterns
- `**bold**` or `*italic*`
- Frontmatter: `---` at start followed by YAML

**MDX indicators:**
- `import` statements at top
- JSX syntax: `<Component />`
- `export` statements

**AsciiDoc indicators:**
- `= Title` (document title)
- `== Heading` (sections)
- `include::file.adoc[]`
- `:attribute: value`

**reStructuredText indicators:**
- Title underlined with `===`
- `.. directive::` patterns
- `:role:`text`` inline markup

**DITA indicators:**
- `<!DOCTYPE task` or `<!DOCTYPE topic`
- `<task>`, `<concept>`, `<reference>` elements
- `<?xml version="1.0"?>` header

## Common Documentation Directories

Prioritize scanning these directories:

```
docs/
documentation/
doc/
guides/
tutorials/
pages/        # Common in Next.js/MDX projects
content/      # Common in static site generators
src/docs/
src/pages/
```

## Exclusion Patterns

Always exclude:

```
node_modules/
dist/
build/
.git/
.next/
.nuxt/
coverage/
vendor/
__pycache__/
*.min.*
```

## Detection Output Format

Report detection results in a structured format:

```
📁 Documentation detected:

Type        | Count | Locations
------------|-------|---------------------------
Markdown    | 12    | docs/, README.md
MDX         | 3     | pages/
AsciiDoc    | 0     | —
RST         | 0     | —
HTML        | 2     | documentation/
DITA        | 0     | —
------------|-------|---------------------------
Total       | 17    | 

Estimated testable procedures: 8-15
```

## Integration with Doc Detective Config

Map detected file types to Doc Detective `fileTypes` config:

| Detected Type | Config Value |
|---------------|--------------|
| Markdown | `"markdown"` |
| MDX | `"markdown"` (same patterns) |
| AsciiDoc | `"asciidoc"` |
| HTML | `"html"` |
| DITA | `"dita"` |

Example generated config segment:

```json
{
  "fileTypes": ["markdown", "html"]
}
```

## Related Resources

- Doc Detective resolver: https://github.com/doc-detective/doc-detective-resolver
- File type configuration: https://doc-detective.com/docs/references/schemas/config
- Markup patterns: https://doc-detective.com/docs/get-started/tests#detected-tests
