import { parseArgs } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'

export const help = `Usage: node transcript.mjs VIDEO [--mode native|auto|generate] [--lang en] [--text] [--wait] [--timeout 1200]
       node transcript.mjs --job JOB_ID [--wait] [--timeout 1200]
Requires Node.js 22 and CAPSLANE_API_KEY in the environment.
Defaults: native mode, timed segments, one request. --wait polls the same job every two seconds.
--timeout bounds the whole operation in seconds (1 to 1200). Each request is limited to 45 seconds.
JSON goes to stdout; errors go to stderr and retain an accepted jobId.`

function failure(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details })
}

function videoId(value) {
  if (/^[A-Za-z0-9_-]{11}$/u.test(value)) return value
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error()
    const parts = url.pathname.split('/').filter(Boolean)
    let id
    if (url.hostname === 'youtu.be' && parts.length === 1) id = parts[0]
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v')
      else if (['shorts', 'embed', 'live'].includes(parts[0]) && parts.length === 2) id = parts[1]
    }
    if (id && /^[A-Za-z0-9_-]{11}$/u.test(id)) return id
  } catch { /* Invalid input is rejected before any request. */ }
  throw failure('invalid_video', 'Provide a public YouTube URL or an 11-character video ID.')
}

const validJob = (id) => typeof id === 'string' && /^job_[0-9a-f-]{36}$/u.test(id)

export async function runTranscript(args, {
  apiKey = process.env.CAPSLANE_API_KEY,
  fetch: fetcher = globalThis.fetch,
  sleep = delay,
  now = Date.now,
} = {}) {
  let parsed
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: {
      mode: { type: 'string' }, lang: { type: 'string' }, text: { type: 'boolean' },
      job: { type: 'string' }, wait: { type: 'boolean' }, timeout: { type: 'string' }, help: { type: 'boolean' },
    } })
  } catch { throw failure('invalid_arguments', 'Unrecognized arguments. Run with --help for syntax.') }
  const { values, positionals } = parsed
  if (values.help) return help
  const timeout = Number(values.timeout ?? 1200)
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 1200) throw failure('invalid_arguments', '--timeout must be between 1 and 1200 seconds.')
  const mode = values.mode ?? 'native'
  if (!['native', 'auto', 'generate'].includes(mode)) throw failure('invalid_arguments', 'Mode must be native, auto or generate.')
  if (values.lang !== undefined && !/^[a-zA-Z][a-zA-Z0-9-]{1,11}$/u.test(values.lang)) throw failure('invalid_arguments', 'Provide a language code of 2 to 12 characters.')
  let jobId = values.job
  let path
  if (jobId !== undefined) {
    if (!validJob(jobId) || positionals.length || values.mode !== undefined || values.lang !== undefined || values.text !== undefined) throw failure('invalid_arguments', 'Use --job with an accepted job ID, without video, mode, lang or text.')
    path = '/v1/transcript/' + jobId
  } else {
    if (positionals.length !== 1) throw failure('invalid_arguments', 'Provide one YouTube video or use --job. Run with --help for syntax.')
    const query = new URLSearchParams({ url: videoId(positionals[0]), mode, text: String(values.text ?? false) })
    if (values.lang) query.set('lang', values.lang)
    path = '/v1/transcript?' + query
  }
  if (!apiKey) throw failure('missing_api_key', 'Set CAPSLANE_API_KEY in the local environment or configure the Capslane MCP connection.')
  const deadline = now() + timeout * 1000
  let requestId
  const timeoutError = () => failure('wait_timeout', 'The local deadline expired. An accepted server job can still be running.')
  async function get(route) {
    const remaining = deadline - now()
    if (remaining <= 0) throw timeoutError()
    let response
    try {
      response = await fetcher('https://capslane.com' + route, {
        headers: { 'x-api-key': apiKey, accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(Math.min(45_000, Math.ceil(remaining))),
      })
    } catch { throw failure('request_failed', 'The Capslane request failed or timed out. Do not automatically resubmit the video.') }
    let result
    try { result = await response.json() } catch { throw failure('invalid_response', 'Capslane did not return a JSON response.', { status: response.status }) }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw failure('invalid_response', 'Capslane returned an unexpected response.')
    if (typeof result.requestId === 'string') requestId = result.requestId
    if (!response.ok) throw failure(typeof result.error === 'string' ? result.error : 'http_error', 'Capslane returned HTTP ' + response.status + '. Check the error code and requestId.', { status: response.status })
    return result
  }
  try {
    let result = await get(path)
    while (true) {
      if (typeof result.content === 'string' || Array.isArray(result.content)) return result
      if (!jobId && validJob(result.jobId)) jobId = result.jobId
      if (['failed', 'cancelled'].includes(result.status)) throw failure(result.error ?? result.status, 'The transcript job ' + result.status + '.')
      if (!jobId || (result.jobId !== undefined && result.jobId !== jobId)) throw failure('invalid_response', 'Capslane returned no usable transcript or matching job ID.')
      if (!values.wait) return result
      const remaining = deadline - now()
      if (remaining <= 0) throw timeoutError()
      await sleep(Math.min(2000, remaining))
      result = await get('/v1/transcript/' + jobId)
    }
  } catch (error) {
    if (jobId) error.jobId = jobId
    if (requestId) error.requestId = requestId
    throw error
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runTranscript(process.argv.slice(2))
    process.stdout.write((typeof result === 'string' ? result : JSON.stringify(result, null, 2)) + '\n')
  } catch (error) {
    process.stderr.write(JSON.stringify({ error: error.code ?? 'request_failed', message: error.message, jobId: error.jobId, requestId: error.requestId, status: error.status }) + '\n')
    process.exitCode = 1
  }
}
