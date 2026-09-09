import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createCapslaneMcpServer } from '../dist/index.js'

const jobId = 'job_550e8400-e29b-41d4-a716-446655440000'
const transcript = { content: [{ text: 'Synthetic transcript.', offset: 1000, duration: 2000, lang: 'en' }], lang: 'en', availableLangs: ['en', 'fr'], source: 'generated', cached: true, requestId: 'req_fixture', jobId, status: 'completed' }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const value = (result) => JSON.parse(result.content[0].text)

async function connect(t, fetcher) {
  const server = createCapslaneMcpServer({ apiKey: 'fixture-key-only', fetch: fetcher })
  const client = new Client({ name: 'workflow-fixture', version: '1.0.0' })
  t.after(async () => { await client.close(); await server.close() })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(b), client.connect(a)])
  return client
}

test('catalog exposes quota effects and keeps credentials out of tool inputs', async (t) => {
  const client = await connect(t, async () => { throw new Error('Catalog must not call the API') })
  const { tools } = await client.listTools()
  assert.equal(client.getServerVersion().version, '0.1.7')
  assert.match(client.getInstructions(), /npx -y @webba_tech\/capslane-mcp/u)
  assert.match(client.getInstructions(), /await durable storage/u)
  assert.match(client.getInstructions(), /completed without content/u)
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, tool.name === 'get_transcript_status')
    assert.equal(tool.annotations.idempotentHint, tool.name === 'get_transcript_status')
    assert.equal(tool.annotations.destructiveHint, false)
    assert.ok(!Object.hasOwn(tool.inputSchema.properties, 'apiKey'))
  }
  assert.equal(tools[0].inputSchema.properties.waitForCompletion.default, true)
})

test('expired blocking jobs stop and failed status reads preserve the saved ID', async (t) => {
  let calls = 0
  const client = await connect(t, async () => {
    calls++
    if (calls === 1) return json({ jobId, status: 'queued', requestId: 'req_accepted' }, 202)
    if (calls === 2) return json({ jobId, status: 'completed', requestId: 'req_expired' })
    return json({ error: 'upstream_unavailable', requestId: 'req_http' }, 503)
  })
  const expired = await client.callTool({ name: 'get_youtube_transcript', arguments: { url: 'dQw4w9WgXcQ' } })
  assert.equal(expired.isError, true)
  assert.equal(value(expired).error, 'transcript_expired')
  assert.equal(value(expired).status, 410)
  assert.equal(value(expired).jobId, jobId)
  assert.equal(value(expired).requestId, 'req_expired')
  assert.equal(calls, 2)
  const failed = await client.callTool({ name: 'get_transcript_status', arguments: { jobId } })
  assert.equal(failed.isError, true)
  assert.equal(value(failed).jobId, jobId)
  assert.equal(value(failed).requestId, 'req_http')
  assert.equal(calls, 3)
})

test('interactive workflow submits once and polls the same job to content', async (t) => {
  const requests = []
  const client = await connect(t, async (input, init) => {
    const url = new URL(input)
    requests.push(url)
    assert.equal(init.headers['x-api-key'], 'fixture-key-only')
    assert.ok(!url.toString().includes('fixture-key-only'))
    if (url.pathname === '/v1/transcript') return json({ jobId, status: 'queued', requestId: 'req_accepted' }, 202)
    assert.equal(url.pathname, `/v1/transcript/${jobId}`)
    return json(requests.length === 2 ? { jobId, status: 'processing' } : transcript)
  })
  const accepted = value(await client.callTool({ name: 'get_youtube_transcript', arguments: { url: 'dQw4w9WgXcQ', mode: 'auto', text: true, waitForCompletion: false } }))
  assert.equal(accepted.jobId, jobId)
  assert.equal(requests.length, 1)
  assert.equal(value(await client.callTool({ name: 'get_transcript_status', arguments: { jobId } })).status, 'processing')
  assert.deepEqual(value(await client.callTool({ name: 'get_transcript_status', arguments: { jobId } })), transcript)
  assert.equal(requests.filter((url) => url.pathname === '/v1/transcript').length, 1)
})

test('completed content with a job ID never triggers another wait', async (t) => {
  let calls = 0
  const client = await connect(t, async () => { calls += 1; return json(transcript) })
  assert.deepEqual(value(await client.callTool({ name: 'get_youtube_transcript', arguments: { url: 'dQw4w9WgXcQ' } })), transcript)
  assert.equal(calls, 1)
  assert.deepEqual(value(await client.callTool({ name: 'list_available_languages', arguments: { url: 'dQw4w9WgXcQ' } })), { availableLangs: ['en', 'fr'], selectedLang: 'en', requestId: 'req_fixture' })
})

test('a failed wait retains the accepted job ID and request ID', async (t) => {
  let calls = 0
  const client = await connect(t, async () => {
    calls += 1
    return calls === 1 ? json({ jobId, status: 'queued' }, 202) : json({ error: 'upstream_unavailable', message: 'Fixture failure', requestId: 'req_failure' }, 503)
  })
  const result = await client.callTool({ name: 'get_youtube_transcript', arguments: { url: 'dQw4w9WgXcQ' } })
  assert.equal(result.isError, true)
  assert.deepEqual(value(result), { error: 'upstream_unavailable', message: 'Fixture failure', status: 503, requestId: 'req_failure', jobId })
  assert.equal(calls, 2)
})

test('status retains terminal failures and quota errors stay explicit', async (t) => {
  const client = await connect(t, async (input) => new URL(input).pathname.endsWith(jobId)
    ? json({ jobId, status: 'failed', error: 'transcript_unavailable' })
    : json({ error: 'monthly_limit_exceeded', message: 'Fixture quota exceeded', requestId: 'req_quota' }, 429))
  const failed = await client.callTool({ name: 'get_transcript_status', arguments: { jobId } })
  assert.equal(value(failed).status, 'failed')
  assert.equal(value(failed).content, undefined)
  const quota = await client.callTool({ name: 'get_youtube_transcript', arguments: { url: 'dQw4w9WgXcQ', waitForCompletion: false } })
  assert.equal(quota.isError, true)
  assert.equal(value(quota).error, 'monthly_limit_exceeded')
  assert.equal(value(quota).requestId, 'req_quota')
})
