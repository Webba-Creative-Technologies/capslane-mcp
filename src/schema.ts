import { z } from 'zod'

const segment = z.object({
  text: z.string(), offset: z.number().nonnegative().describe('Start offset in milliseconds'),
  duration: z.number().nonnegative().describe('Duration in milliseconds'), lang: z.string(),
})

// An object at the root keeps outputSchema compatible with MCP 2025-11-25.
export const transcriptResponseSchema = z.object({
  content: z.union([z.string(), z.array(segment)]).optional().describe('Transcript itself. Check this before jobId; it can coexist with a completed job ID.'),
  jobId: z.string().optional(),
  status: z.enum(['queued', 'downloading', 'processing', 'persisting', 'completed', 'failed', 'cancelled']).optional().describe('Job state, never an HTTP status. Completed without content means the stored result is unavailable or expired.'),
  progress: z.number().optional(), error: z.string().optional(), requestId: z.string().optional(),
  lang: z.string().optional(), availableLangs: z.array(z.string()).optional(),
  source: z.enum(['native', 'generated']).optional(), cached: z.boolean().optional(),
}).passthrough()

export const languageResponseSchema = z.object({
  availableLangs: z.array(z.string()).optional(), selectedLang: z.string().optional(), requestId: z.string().optional(),
  jobId: z.string().optional(), status: z.string().optional(),
}).passthrough()
