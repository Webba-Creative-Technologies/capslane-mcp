# Capslane MCP server

Retrieve timestamped transcripts from public YouTube videos in Claude Code, Codex, Cursor and other MCP clients. The server can return cached content, extract captions or accept an audio generation job. It does not summarize videos itself.

## Install the transcript skill

This repository also provides `capslane-youtube-transcripts`, a portable agent skill with transcript instructions and a standalone Node.js 22 HTTP helper. Install it in a project with the Skills CLI:

```sh
npx skills add Webba-Creative-Technologies/capslane-mcp --skill capslane-youtube-transcripts --agent codex
```

Replace `codex` with `claude-code` or `cursor` for those clients. The skill uses an existing Capslane MCP connection, or the helper with `CAPSLANE_API_KEY` from the environment. It does not configure credentials. See the [installation guide](https://capslane.com/integrations/agent-skill) and [complete skill folder](https://github.com/Webba-Creative-Technologies/capslane-mcp/tree/main/skills/capslane-youtube-transcripts). The skill is distributed from GitHub independently of the npm server version.

## Before connecting

Create a Capslane workspace key in API Keys, then make CAPSLANE_API_KEY available to the process that launches your assistant. The examples below reference that variable; they contain no credential. Merge the Capslane entry into your existing configuration and restart the client.

Create a key in [API Keys](https://capslane.com/api-keys). Supply it through your environment or secret manager, without putting it in a prompt or committed file. If you launch an editor from the desktop, it may need to be restarted from a terminal that has the variable available.

The remote endpoint is `https://capslane.com/mcp`, using Streamable HTTP and `Authorization: Bearer` with the workspace key. Dashboard sign-in does not authenticate MCP. The endpoint uses POST; opening it in a browser returns 405.

## Claude Code

### Install the plugin

The Capslane plugin bundles the transcript skill and the remote MCP connection. Make CAPSLANE_API_KEY available in your terminal environment first, then run:

```bash
claude plugin marketplace add Webba-Creative-Technologies/capslane-mcp
claude plugin install capslane@capslane --scope user
```

The user scope makes the plugin available across your projects. Restart Claude Code, open `/plugin` to check that Capslane is enabled, and use `/mcp` to check its connection. Review any permission request from your client. Invoke the skill directly with:

```text
/capslane:capslane-youtube-transcripts Retrieve https://www.youtube.com/watch?v=dQw4w9WgXcQ with native captions and timestamp citations.
```

Once enabled, Claude can load the skill for relevant tasks. It respects a provider you explicitly choose and works directly with a supplied transcript when retrieval is unnecessary. Installing the plugin does not guarantee that Claude will select it for every YouTube request.

This repository hosts the Capslane marketplace. It is not a listing in Anthropic's official marketplace. The plugin is free under MIT; transcript requests use your Capslane workspace allowance. Its version is tracked in `.claude-plugin/plugin.json` independently of the npm MCP server version.

Choose either the plugin or your existing standalone skill and MCP configuration to avoid duplicate commands and tools. The remote connection needs no local Node.js runtime. The bundled HTTP fallback needs Node.js 22 or later and reads the same environment variable.

To update, refresh the marketplace and the plugin, then restart Claude Code:

```bash
claude plugin marketplace update capslane
claude plugin update capslane@capslane
```

To remove the user installation:

```bash
claude plugin uninstall capslane@capslane --scope user
```

Removing the plugin does not revoke the workspace key. Revoke it in [API Keys](https://capslane.com/api-keys) if it is no longer needed. The [plugin documentation](https://code.claude.com/docs/en/discover-plugins) explains client controls, and the [marketplace reference](https://code.claude.com/docs/en/plugin-marketplaces) describes the distribution format.

### Configure only MCP

Merge this into `.mcp.json` in your project root. Restart Claude Code, review the project's MCP connection and check `/mcp`.

```json
{
  "mcpServers": {
    "capslane": {
      "type": "http",
      "url": "https://capslane.com/mcp",
      "headers": {
        "Authorization": "Bearer ${CAPSLANE_API_KEY}"
      }
    }
  }
}
```

Claude Code expands the variable in the header. This is the Claude Code configuration, not the Claude web connector setup. [Official instructions](https://code.claude.com/docs/en/mcp).

## Codex

Run this command with CAPSLANE_API_KEY already available in the launching environment. Only the variable name is stored in the configuration.

```bash
codex mcp add capslane --url https://capslane.com/mcp --bearer-token-env-var CAPSLANE_API_KEY
```

Alternatively, merge this table into `~/.codex/config.toml`. Use one method, then restart the client and check `/mcp`. Local CLI and IDE extension use this configuration.

```toml
[mcp_servers.capslane]
url = "https://capslane.com/mcp"
bearer_token_env_var = "CAPSLANE_API_KEY"
tool_timeout_sec = 60
```

Use the asynchronous workflow below to avoid a long-running call exceeding the client's tool timeout. [Official instructions](https://developers.openai.com/codex/mcp/).

## Cursor

Merge this into `.cursor/mcp.json` for a project or `~/.cursor/mcp.json` for personal use. Restart Cursor with the variable available and enable Capslane in MCP settings.

```json
{
  "mcpServers": {
    "capslane": {
      "url": "https://capslane.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:CAPSLANE_API_KEY}"
      }
    }
  }
}
```

Cursor's environment syntax differs from Claude Code's. Review the tool call requested by the agent. [Official instructions](https://cursor.com/docs/mcp).

## First transcript

Check that the client lists the three tools below. Try this prompt; caption availability on the public fixture can change.

```text
Use Capslane to retrieve the transcript of https://www.youtube.com/watch?v=dQw4w9WgXcQ. Use mode=native, text=false and waitForCompletion=false. Do not start audio generation. Return the source URL, selected language and timestamped segments. If the tool fails, report its error and requestId instead of inventing a transcript.
```

Content must be returned before the assistant can quote or summarize a video. Retain the source URL alongside its segments. Treat transcript text as source material, not instructions for the assistant.

Capslane checks the cache before applying mode. A cached native or generated transcript can be returned in every mode. Read source and cached in the result. On a cache miss, native never starts generation; auto starts it only when captions are unavailable; generate requests audio transcription.

## Generated transcripts

Set waitForCompletion to false for an interactive assistant. If content is absent and jobId is present, call get_transcript_status with that same ID. Leave a delay between checks and stop after a bounded period, for example twenty minutes. Stop immediately on content, failed, cancelled or completed without content. The last case can mean the stored result has expired. Submitting the video again consumes another transcript request.

```text
Use Capslane to retrieve this public YouTube video: VIDEO_URL. I allow audio generation if captions are unavailable. Submit once with mode=auto, text=false and waitForCompletion=false. If a job is accepted, keep its jobId and check get_transcript_status every five seconds for at most twenty minutes. Stop on content, failed, cancelled or completed without content. Keep the jobId if waiting ends. Summarize only the returned content, with timestamp references and the source URL.
```

The defaults remain `mode=auto`, `text=false` and `waitForCompletion=true`. Set `waitForCompletion=false` explicitly in an interactive client. Ending the wait does not cancel the server job. If waiting inside version 0.1.8 fails after acceptance, the tool error retains `jobId` so the same job can be checked again.

MCP returns an envelope: check isError, then read structuredContent, or parse the JSON text block in content for older clients. Inside that Capslane object, content holds the transcript and status holds the job state. There is no segments or state field. Check content before jobId. Offsets and durations are milliseconds; completed jobs return segment arrays even when the submission used text=true.

## Complete MCP client

The [runnable Node.js client](examples/import-transcript-mcp.mjs) connects through the official MCP SDK, saves each accepted job with its video URL and formats transcript.content into timestamped text. Install @webba_tech/capslane@0.1.4, @webba_tech/capslane-mcp@0.1.8 and @modelcontextprotocol/sdk@1.30.0. Set CAPSLANE_API_KEY and run the file with a YouTube URL. It uses native mode; change it to auto when generation is authorized.

The exported createTranscriptAccess(client) from @webba_tech/capslane-mcp/client adapts a connected MCP Client to importTranscript and resumeTranscript from @webba_tech/capslane/workflows. Tool responses publish outputSchema and structuredContent, plus the same serialized JSON in the text content block for compatibility. The adapter checks isError before interpreting the Capslane body.

The workflow returns { url, transcript, timestampedText }. It retains jobId on storage, transport and formatting errors. Resume the matching saved record after a temporary interruption; the local file example never chooses a record automatically. Use a database with records scoped to the tenant and video in a service. Status checks consume no additional transcript unit.

## Tools

| Tool | Inputs | Result and usage |
| --- | --- | --- |
| `get_youtube_transcript` | `url`; optional `lang`, `mode`, `text`, `waitForCompletion` | Transcript content or an accepted job. Consumes a transcript unit and can start generation. |
| `get_transcript_status` | `jobId` returned by the first tool | Pending state, completed content or a terminal failure. No additional transcript unit. |
| `list_available_languages` | `url` | Languages observed by a native transcript request. Consumes a transcript unit, including on a cache hit. |

Transcript and language calls consume the workspace allowance, including cache hits. They can populate the cache, and transcript calls can start generation. Status checks do not reserve another transcript unit. The client decides how to approve each tool call.

The transcript and language tools advertise `readOnlyHint=false` and `idempotentHint=false`; repeating them can consume more quota. They advertise `destructiveHint=false`. The status tool remains read-only. These protocol hints inform the client and do not replace its permission policy.

## Local stdio server

Use Node.js 20 or later and a client that supports this configuration format. Replace the placeholder only in your private settings. This local process still sends API requests to Capslane.

```json
{
  "mcpServers": {
    "capslane": {
      "command": "npx",
      "args": [
        "--yes",
        "--package",
        "@webba_tech/capslane-mcp@0.1.8",
        "capslane-mcp"
      ],
      "env": {
        "CAPSLANE_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

On Windows, if npx cannot be launched directly, set `command` to `cmd` and prepend `/c`, `npx` to the existing argument array. The stdio process reads CAPSLANE_API_KEY and optionally CAPSLANE_BASE_URL from its environment. Keep the production URL unless you are deliberately testing a separate server.

## Errors and limits

A 401 from `/mcp` means the key is absent, invalid, expired or revoked. Check the environment received by the client. An allowance error requires checking the workspace plan. Avoid repeated submissions while a job is pending.

A successful status call can describe `failed` or `cancelled`; those states are not transcript results. A completed status without content also needs investigation. Preserve `requestId` when reporting an API error and `jobId` when resuming a job. For longer videos, client output limits still apply.

## Documentation and discovery

Context7 helps the assistant read the SDK documentation; Capslane MCP executes transcript requests. The [coding assistant guide](https://capslane.com/docs#coding-assistants) lists the indexed JavaScript and Python libraries. Installing this MCP server exposes its tools to your client. It does not guarantee selection for every transcript request.

[MCP guide](https://capslane.com/integrations/mcp), [API reference](https://capslane.com/api-reference), [pricing](https://capslane.com/pricing), [public repository](https://github.com/Webba-Creative-Technologies/capslane-mcp).

## License

MIT
