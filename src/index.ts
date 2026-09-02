import { CapslaneClient, CapslaneError, type TranscriptJob } from '@webba_tech/capslane'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

export interface CapslaneMcpOptions {
  apiKey: string
  baseUrl?: string
  fetch?: typeof fetch
}

export function createCapslaneMcpServer(options: CapslaneMcpOptions): McpServer {
  const client = new CapslaneClient(options)
  const server = new McpServer({ name: 'capslane', version: '0.1.4' }, {
    instructions: 'Use Capslane to retrieve timestamped transcripts from public YouTube videos. Only report a transcript after a tool returns it. Keep the request ID when reporting an error.',
  })

  server.registerTool('get_youtube_transcript', {
    title: 'Get YouTube transcript',
    description: 'Retrieve existing YouTube captions or start and optionally wait for a generated transcript.',
    inputSchema: {
      url: z.string().min(1).describe('Public YouTube URL or 11-character video ID'),
      lang: z.string().min(2).max(12).optional().describe('Preferred ISO language code'),
      mode: z.enum(['native', 'auto', 'generate']).default('auto').describe('native never starts speech transcription, auto falls back when needed, generate uses audio'),
      text: z.boolean().default(false).describe('Return one plain text string instead of timestamped segments'),
      waitForCompletion: z.boolean().default(true).describe('Wait for a generated job to finish before returning'),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ url, lang, mode, text, waitForCompletion }) => {
    try {
      let result = await client.transcript({ url, lang, mode, text })
      if (isTranscriptJob(result) && waitForCompletion) result = await client.waitForTranscript(result, { timeoutMs: 20 * 60_000 })
      return toolResult(result)
    } catch (error) {
      return toolError(error)
    }
  })

  server.registerTool('get_transcript_status', {
    title: 'Get transcript job status',
    description: 'Return the current state of a generated transcript job.',
    inputSchema: { jobId: z.string().regex(/^job_[0-9a-f-]{36}$/u).describe('Job identifier returned by get_youtube_transcript') },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ jobId }) => {
    try {
      return toolResult(await client.transcriptJob(jobId))
    } catch (error) {
      return toolError(error)
    }
  })

  server.registerTool('list_available_languages', {
    title: 'List transcript languages',
    description: 'Return the caption languages observed for a public YouTube video. This consumes one transcript request.',
    inputSchema: { url: z.string().min(1).describe('Public YouTube URL or 11-character video ID') },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ url }) => {
    try {
      const result = await client.transcript({ url, mode: 'native' })
      if ('jobId' in result) return toolResult(result)
      return toolResult({ availableLangs: result.availableLangs, selectedLang: result.lang, requestId: result.requestId })
    } catch (error) {
      return toolError(error)
    }
  })

  return server
}

function toolResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function toolError(error: unknown) {
  const value = error instanceof CapslaneError
    ? { error: error.code, message: error.message, status: error.status, requestId: error.requestId }
    : { error: 'request_failed', message: error instanceof Error ? error.message : 'Capslane request failed' }
  return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

export function isTranscriptJob(value: unknown): value is TranscriptJob {
  return Boolean(value && typeof value === 'object' && 'jobId' in value && typeof value.jobId === 'string' && !('content' in value))
}
