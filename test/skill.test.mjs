import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { runTranscript } from '../skills/capslane-youtube-transcripts/scripts/transcript.mjs'

const jobId = 'job_' + randomUUID()
const content = [{ text: 'A public example.', offset: 1250, duration: 2000, lang: 'en' }]
const ready = { content, lang: 'en', source: 'native', cached: false }
function scenario(responses) {
  let time = 0
  const calls = []
  const waits = []
  return { calls, waits, options: {
    apiKey: randomUUID(), now: () => time, sleep: async (ms) => { waits.push(ms); time += ms },
    fetch: async (url, options) => {
      calls.push({ url: new URL(url), ...options })
      const result = responses.shift()
      if (result instanceof Error) throw result
      assert.ok(result, 'Unexpected additional request')
      return result instanceof Response ? result : Response.json(result)
    },
  } }
}

test('skill helper normalizes supported YouTube links and uses native segments by default', async () => {
  for (const video of ['dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=2', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=example', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/live/dQw4w9WgXcQ']) {
    const s = scenario([ready])
    assert.deepEqual(await runTranscript([video, '--lang', 'en'], s.options), ready)
    assert.equal(s.calls[0].url.origin, 'https://capslane.com')
    assert.deepEqual(Object.fromEntries(s.calls[0].url.searchParams), { url: 'dQw4w9WgXcQ', mode: 'native', text: 'false', lang: 'en' })
    assert.equal(s.calls[0].redirect, 'error')
    assert.equal(s.calls[0].headers['x-api-key'], s.options.apiKey)
  }
})

test('skill helper rejects malformed input and missing credentials before any request', async () => {
  for (const args of [[], ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'], ['https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ'], ['https://youtube.com:444/watch?v=dQw4w9WgXcQ'], ['https://example.com/dQw4w9WgXcQ'], ['bad'], ['dQw4w9WgXcQ', '--mode', 'other'], ['dQw4w9WgXcQ', '--lang', '../en'], ['dQw4w9WgXcQ', '--timeout', 'Infinity'], ['dQw4w9WgXcQ', '--timeout', '0'], ['dQw4w9WgXcQ', '--base-url', 'https://example.com'], ['--job', '../x'], ['--job', jobId, '--mode', 'auto']]) {
    const s = scenario([])
    await assert.rejects(runTranscript(args, s.options))
    assert.equal(s.calls.length, 0)
  }
  const s = scenario([])
  await assert.rejects(runTranscript(['dQw4w9WgXcQ'], { ...s.options, apiKey: '' }), { code: 'missing_api_key' })
  assert.match(await runTranscript(['--help'], { ...s.options, apiKey: '' }), /Usage:/u)
  assert.equal(s.calls.length, 0)
})

test('skill helper returns accepted jobs immediately unless waiting was requested', async () => {
  const accepted = { jobId, status: 'queued', requestId: 'req_fixture' }
  const s = scenario([accepted])
  assert.deepEqual(await runTranscript(['dQw4w9WgXcQ', '--mode', 'auto'], s.options), accepted)
  assert.equal(s.calls.length, 1)
  assert.equal(s.waits.length, 0)
})

test('skill helper submits once and polls the same ID until content, including completed jobs', async () => {
  const s = scenario([{ jobId, status: 'queued' }, { jobId, status: 'processing' }, { ...ready, jobId, status: 'completed' }])
  assert.deepEqual(await runTranscript(['dQw4w9WgXcQ', '--mode', 'auto', '--text', '--wait'], s.options), { ...ready, jobId, status: 'completed' })
  assert.equal(s.calls[0].url.searchParams.get('text'), 'true')
  assert.deepEqual(s.calls.map(({ url }) => url.pathname), ['/v1/transcript', '/v1/transcript/' + jobId, '/v1/transcript/' + jobId])
  assert.deepEqual(s.waits, [2000, 2000])
  const text = scenario([{ ...ready, content: 'Plain text.' }])
  assert.equal((await runTranscript(['dQw4w9WgXcQ', '--text'], text.options)).content, 'Plain text.')
})

test('skill helper resumes without submitting and stops on terminal failures', async () => {
  for (const status of ['failed', 'cancelled']) {
    const s = scenario([{ jobId, status, error: 'video_unavailable', requestId: 'req_fixture' }])
    await assert.rejects(runTranscript(['--job', jobId, '--wait'], s.options), { code: 'video_unavailable', jobId, requestId: 'req_fixture' })
    assert.equal(s.calls.length, 1)
    assert.equal(s.calls[0].url.pathname, '/v1/transcript/' + jobId)
    assert.equal(s.waits.length, 0)
  }
})

test('skill helper retains the job on deadline and network errors without resubmission', async () => {
  const expired = scenario([{ jobId, status: 'completed', requestId: 'req_fixture' }])
  await assert.rejects(runTranscript(['--job', jobId, '--wait', '--timeout', '1'], expired.options), { code: 'wait_timeout', jobId, requestId: 'req_fixture' })
  assert.equal(expired.calls.length, 1)
  assert.deepEqual(expired.waits, [1000])
  const network = scenario([{ jobId, status: 'queued', requestId: 'req_fixture' }, new Error('Internal network detail')])
  await assert.rejects(runTranscript(['dQw4w9WgXcQ', '--mode', 'auto', '--wait'], network.options), { code: 'request_failed', jobId, requestId: 'req_fixture' })
  assert.equal(network.calls.length, 2)
})

test('skill helper stops on HTTP, invalid body and mismatched job responses', async () => {
  for (const [response, code] of [
    [Response.json({ error: 'monthly_limit_exceeded', requestId: 'req_fixture' }, { status: 402 }), 'monthly_limit_exceeded'],
    [new Response('proxy failure', { status: 502 }), 'invalid_response'],
    [Response.json(null), 'invalid_response'],
    [{ status: 'completed' }, 'wait_timeout'],
    [{ jobId: 'job_' + randomUUID(), status: 'processing' }, 'invalid_response'],
  ]) {
    const s = scenario([response])
    await assert.rejects(runTranscript(['--job', jobId, '--wait', '--timeout', '1'], s.options), { code, jobId })
    assert.equal(s.calls.length, 1)
  }
})
