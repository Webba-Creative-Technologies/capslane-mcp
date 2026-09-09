import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { importTranscript, resumeTranscript } from '@webba_tech/capslane/workflows'
import { createTranscriptAccess } from '../dist/client.js'
import { createCapslaneMcpServer } from '../dist/index.js'

const jobId = 'job_550e8400-e29b-41d4-a716-446655440000'
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const job = { jobId, url, requestId: 'req_accepted' }
const content = [{ text: 'Synthetic passage.', offset: 12500, duration: 2300, lang: 'fr' }]
const done = { content, jobId, status: 'completed', lang: 'fr', availableLangs: ['fr'], source: 'generated', cached: false, requestId: 'req_done' }
const wait = { intervalMs: 1, timeoutMs: 1000 }

async function connect(t, responses) {
  const calls = []
  const server = createCapslaneMcpServer({ apiKey: 'fixture-only', fetch: async input => {
    calls.push(new URL(input))
    assert.ok(responses.length, 'Unexpected request')
    const response = responses.shift()
    return response instanceof Response ? response : Response.json(response)
  } })
  const client = new Client({ name: 'import-fixture', version: '1.0.0' })
  t.after(async () => { await client.close(); await server.close() })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(b), client.connect(a)])
  return { client, calls, access: createTranscriptAccess(client) }
}

test('MCP catalog describes response fields and structured content matches legacy JSON', async t => {
  const { client } = await connect(t, [done])
  const catalog = await client.listTools()
  for (const tool of catalog.tools.slice(0, 2)) {
    assert.ok(tool.outputSchema.properties.content)
    assert.ok(tool.outputSchema.properties.status)
    assert.ok(!tool.outputSchema.properties.state)
  }
  const response = await client.callTool({ name: 'get_transcript_status', arguments: { jobId } })
  assert.deepEqual(response.structuredContent, done)
  assert.deepEqual(JSON.parse(response.content[0].text), done)
})

test('real MCP client completes the shared import with one submission and correct timestamps', async t => {
  const { access, calls } = await connect(t, [{ jobId, status: 'queued', requestId: 'req_accepted' }, { jobId, status: 'processing' }, done])
  let persisted = false
  const result = await importTranscript(access, { ...wait, url, mode: 'auto', saveJob: async saved => { assert.equal(calls.length, 1); assert.equal(saved.url, url); persisted = true } })
  assert.ok(persisted)
  assert.equal(result.timestampedText, '[00:00:12] Synthetic passage.')
  assert.deepEqual(result.transcript.content, content)
  assert.equal(calls.length, 3)
  assert.equal(calls[0].searchParams.get('text'), 'false')
  assert.equal(calls[1].pathname, `/v1/transcript/${jobId}`)
})

test('MCP resumption preserves context for failed, cancelled, expired and tool errors', async t => {
  for (const response of [{ jobId, status: 'failed' }, { jobId, status: 'cancelled' }, { jobId, status: 'completed' }, Response.json({ error: 'fixture_unavailable', requestId: 'req_failure' }, { status: 503 })]) {
    const { access, calls } = await connect(t, [response])
    await assert.rejects(resumeTranscript(access, job, wait), error => error.jobId === jobId && error.url === url && Boolean(error.requestId))
    assert.equal(calls.length, 1)
  }
})

test('MCP adapter reads legacy text JSON and checks isError before interpreting status', async () => {
  const access = createTranscriptAccess({ callTool: async () => ({ content: [{ type: 'text', text: JSON.stringify(done) }] }) })
  assert.equal((await resumeTranscript(access, job, wait)).timestampedText, '[00:00:12] Synthetic passage.')
  const failed = createTranscriptAccess({ callTool: async () => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'fixture_failure', status: 503 }) }] }) })
  await assert.rejects(resumeTranscript(failed, job, wait), error => error.jobId === jobId && error.code === 'fixture_failure' && error.status === 503)
})

test('MCP cancellation and JSON parsing failures retain the saved job', async () => {
  const access = createTranscriptAccess({ callTool: async (_args, _schema, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  }) })
  await assert.rejects(resumeTranscript(access, job, { intervalMs: 1, timeoutMs: 30 }), error => error.jobId === jobId && error.code === 'processing_timeout')
  const malformed = createTranscriptAccess({ callTool: async () => ({ content: [{ type: 'text', text: 'invalid JSON' }] }) })
  await assert.rejects(resumeTranscript(malformed, job, wait), error => error instanceof SyntaxError && error.jobId === jobId)
})
