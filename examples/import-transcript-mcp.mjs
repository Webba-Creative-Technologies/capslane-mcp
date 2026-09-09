import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createTranscriptAccess } from '@webba_tech/capslane-mcp/client'
import { importTranscript, resumeTranscript } from '@webba_tech/capslane/workflows'

// npm install @webba_tech/capslane@0.1.4 @webba_tech/capslane-mcp@0.1.8 @modelcontextprotocol/sdk@1.30.0
// Submit: node import-transcript-mcp.mjs dQw4w9WgXcQ
// Resume: node import-transcript-mcp.mjs --resume ./transcript-jobs/JOB_ID.json
const apiKey = process.env.CAPSLANE_API_KEY
if (!apiKey) throw new Error('Set CAPSLANE_API_KEY in your server environment')
const client = new Client({ name: 'youtube-import', version: '1.0.0' })
const transport = new StreamableHTTPClientTransport(new URL('https://capslane.com/mcp'), {
  requestInit: { headers: { 'x-api-key': apiKey } },
})
const saveJob = async job => {
  await mkdir('transcript-jobs', { recursive: true, mode: 0o700 })
  if (!/^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(job.jobId)) throw new Error('Invalid job ID')
  await writeFile(`transcript-jobs/${job.jobId}.json`, JSON.stringify(job), { mode: 0o600, flag: 'wx', flush: true })
}

try {
  await client.connect(transport, { timeout: 45_000 })
  const access = createTranscriptAccess(client)
  const imported = process.argv[2] === '--resume'
    ? await resumeTranscript(access, JSON.parse(await readFile(process.argv[3], 'utf8')))
    : await importTranscript(access, {
      url: process.argv[2], mode: 'native', saveJob, timeoutMs: 20 * 60_000, intervalMs: 2_000,
    })
  console.log(imported.url)
  console.log(imported.timestampedText)
} catch (error) {
  console.error(JSON.stringify({ error: error.code ?? error.name, jobId: error.jobId, requestId: error.requestId, url: error.url }))
  process.exitCode = 1
} finally {
  await client.close()
}
