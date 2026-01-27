# doc-detective-mcp

MCP (Model Context Protocol) server that exposes Doc Detective functionality for AI assistants.

## Overview

This MCP server enables AI assistants (like Claude) to:
- **Generate** test specifications from documentation
- **Validate** test specification structure
- **Execute** tests against live applications
- **Inject** test specs into documentation as inline comments
- **Analyze** test results with plaintext reports

## Installation

### Via npx (Recommended)

```bash
npx doc-detective-mcp
```

### Local Installation

```bash
npm install -g doc-detective-mcp
doc-detective-mcp
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "doc-detective": {
      "command": "npx",
      "args": ["doc-detective-mcp"]
    }
  }
}
```

### Other MCP Clients

Configure your MCP client to run `npx doc-detective-mcp` as a stdio server.

## Available Tools

### `doc_detective_generate`

Generate Doc Detective test specifications from documentation files.

**Parameters:**
- `source_file` (required): Path to the documentation file
- `output_file` (optional): Path to write the generated spec
- `merge_existing` (optional): Path to existing spec to merge with

**Example:**
```json
{
  "source_file": "docs/getting-started.md",
  "output_file": "tests/getting-started-spec.json"
}
```

### `doc_detective_validate`

Validate a Doc Detective test specification.

**Parameters:**
- `spec_input` (required): JSON/YAML string or file path
- `strict` (optional): Enable strict validation mode

**Example:**
```json
{
  "spec_input": "tests/login-spec.json"
}
```

### `doc_detective_execute`

Execute Doc Detective tests against a live application.

**Parameters:**
- `spec_input` (required): JSON string or file path
- `headless` (optional): Run browser headlessly (default: true)
- `timeout` (optional): Test timeout in ms (default: 30000)
- `config_file` (optional): Path to .doc-detective.json

**Example:**
```json
{
  "spec_input": "tests/login-spec.json",
  "headless": true,
  "timeout": 60000
}
```

### `doc_detective_inject`

Inject test specifications into documentation as inline comments.

**Parameters:**
- `spec_file` (required): Path to test spec file
- `source_file` (required): Path to documentation file
- `apply` (optional): Apply changes (default: false for preview)
- `syntax` (optional): Comment syntax: json, yaml, or xml

**Example:**
```json
{
  "spec_file": "tests/search-spec.json",
  "source_file": "docs/search-guide.md",
  "apply": false
}
```

### `doc_detective_analyze`

Analyze test execution results and generate a plaintext report.

**Parameters:**
- `results_input` (required): JSON string or file path
- `detailed` (optional): Include detailed breakdown
- `focus` (optional): Focus on: failures, performance, or coverage

**Example:**
```json
{
  "results_input": "test-results/run-123.json",
  "detailed": true,
  "focus": "failures"
}
```

## Development

### Setup

```bash
cd mcp-servers/doc-detective-mcp
npm install
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Run with Coverage

```bash
npm run test:coverage
```

## License

MIT - See [LICENSE](../../LICENSE)
