# Capslane MCP server

Retrieve YouTube transcripts from ChatGPT, Claude, Cursor and other MCP clients through the Capslane API.

## Local stdio transport

```json
{
  "mcpServers": {
    "capslane": {
      "command": "npx",
      "args": ["--yes", "--package", "github:WebbaLuca/capslane-mcp#v0.1.3", "capslane-mcp"],
      "env": { "CAPSLANE_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Keep the key outside prompts and committed configuration. The package exposes three read-only tools:

- `get_youtube_transcript`
- `get_transcript_status`
- `list_available_languages`

Documentation: [capslane.com/integrations/mcp](https://capslane.com/integrations/mcp)
