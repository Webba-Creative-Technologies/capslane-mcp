# Capslane MCP server

The Capslane MCP server retrieves timestamped YouTube transcripts from compatible assistants and developer tools. It exposes three read-only tools for requesting a transcript, checking a generated transcript job and listing the caption languages observed for a video.

## Remote server

- URL: `https://capslane.com/mcp`
- Transport: Streamable HTTP
- Authentication: `Authorization: Bearer YOUR_API_KEY`

Keep the API key in the client's secure connection settings. Do not include it in prompts.

## Local server

Node.js 20 or later is required.

```json
{
  "mcpServers": {
    "capslane": {
      "command": "npx",
      "args": [
        "--yes",
        "--package",
        "@webba_tech/capslane-mcp",
        "capslane-mcp"
      ],
      "env": {
        "CAPSLANE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

## Tools

### `get_youtube_transcript`

Retrieve existing YouTube captions or start and optionally wait for a generated transcript.

Inputs:

- `url`: public YouTube URL or 11-character video ID
- `lang`: optional preferred language code
- `mode`: `native`, `auto` or `generate`
- `text`: return one text string instead of timestamped segments
- `waitForCompletion`: wait for an accepted transcript job before returning

### `get_transcript_status`

Return the current state of a generated transcript job.

Input:

- `jobId`: job identifier returned by `get_youtube_transcript`

### `list_available_languages`

Return the caption languages observed for a public YouTube video. This consumes one transcript request.

Input:

- `url`: public YouTube URL or 11-character video ID

## Modes

- `native` returns existing captions and never starts speech transcription.
- `auto` uses existing captions first and generates a transcript only when needed.
- `generate` creates a transcript from the video audio.

## Security

Create a dedicated API key for each MCP client. Keep keys out of prompts, committed files and shared configuration.

## Links

- [MCP documentation](https://capslane.com/integrations/mcp)
- [API reference](https://capslane.com/api-reference)
- [Dashboard](https://capslane.com/dashboard)
- [GitHub](https://github.com/WebbaLuca/capslane-mcp)

## License

MIT
