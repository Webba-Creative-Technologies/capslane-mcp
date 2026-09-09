# Build a Capslane integration

The public API base is `https://capslane.com`. Send `x-api-key` from your server environment. Dashboard cookies do not authenticate API calls. See the [Markdown API reference](https://capslane.com/api-reference.md) and [OpenAPI schema](https://capslane.com/openapi.json) for the current contract.

For JavaScript and TypeScript, install `@webba_tech/capslane` and follow the [Node.js guide](https://capslane.com/guides/youtube-transcript-api-nodejs). For Python, install `capslane` and follow the [Python guide](https://capslane.com/guides/youtube-transcript-api-python). When Context7 is available, use `/webba-creative-technologies/capslane-js` or `/webba-creative-technologies/capslane-python`. Context7 supplies documentation; MCP and HTTP execute requests.

Submit `GET /v1/transcript` with `url`, an explicit `mode` and optional `lang` and `text`. The response is either HTTP 200 with `content`, or HTTP 202 with a `jobId`. Poll `GET /v1/transcript/{jobId}` with a delay and a shared deadline. A successful status request can describe a pending or failed job; check its body. Preserve an accepted job ID across timeouts and do not repeat submission to poll.

Cache lookup precedes mode selection. `native` never starts generation, `auto` generates after missing captions, and `generate` starts audio transcription on a cache miss. `source` describes the actual transcript source. `text=true` affects immediate results; completed jobs return segments. Offsets and durations use milliseconds.

Keep request and overall wait timeouts separate. Use at most 45 seconds per HTTP call and a bounded wait, such as twenty minutes, unless the application requires a shorter deadline. Return the job ID when a caller stops waiting. Handle authentication and allowance failures without automatic retry loops. Error responses may contain `error`, `message` and `requestId`; a failed job may only provide an error code.

Use synthetic responses for immediate content, accepted jobs, completed jobs, terminal failures and network timeouts in automated tests. Never commit real transcripts, keys or downloaded media. For tool configuration, use the [MCP guide](https://capslane.com/integrations/mcp).
