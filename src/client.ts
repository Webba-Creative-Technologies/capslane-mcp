import { CapslaneError, waitForTranscript, type TranscriptJob, type TranscriptResult } from '@webba_tech/capslane'
import type { TranscriptAccess } from '@webba_tech/capslane/workflows'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { transcriptResponseSchema } from './schema.js'

/** Adapt a connected MCP Client to the same durable import workflow as HTTP. */
export function createTranscriptAccess(client: Client): TranscriptAccess {
  async function call(name: string, args: Record<string, unknown>, signal?: AbortSignal, jobId?: string): Promise<TranscriptResult | TranscriptJob> {
    const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }, undefined, { signal, timeout: 45_000 }))
    const block = result.content.find(part => part.type === 'text')
    const data = result.structuredContent ?? (block?.type === 'text' ? JSON.parse(block.text) : undefined)
    if (result.isError) {
      throw new CapslaneError(typeof data?.status === 'number' ? data.status : 502,
        typeof data?.error === 'string' ? data.error : 'mcp_tool_error',
        typeof data?.requestId === 'string' ? data.requestId : undefined,
        typeof data?.message === 'string' ? data.message : 'Capslane MCP tool failed', jobId)
    }
    const parsed = transcriptResponseSchema.parse(data)
    if (parsed.content === undefined && !parsed.status) throw new TypeError('Expected transcript content or a job status')
    return parsed as TranscriptResult | TranscriptJob
  }
  const access: TranscriptAccess = {
    transcript: ({ url, lang, mode, text, signal }) => call('get_youtube_transcript', {
      url, ...(lang ? { lang } : {}), mode: mode ?? 'native', text: text ?? false, waitForCompletion: false,
    }, signal),
    transcriptJob: (jobId, signal) => call('get_transcript_status', { jobId }, signal, jobId),
    waitForTranscript: (job, options) => waitForTranscript(access, job, options),
  }
  return access
}
