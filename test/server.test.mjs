import assert from 'node:assert/strict'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createCapslaneMcpServer } from '../dist/index.js'

test('lists focused tools and returns a transcript', async () => {
  const server = createCapslaneMcpServer({ apiKey: 'vxl_test_secret', fetch: async () => new Response(JSON.stringify({ content: [{ text: 'Example', offset: 0, duration: 1000, lang: 'en' }], lang: 'en', availableLangs: ['en'], source: 'native', cached: false, requestId: 'req_test' }), { status: 200, headers: { 'content-type': 'application/json' } }) })
  const client = new Client({ name: 'capslane-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const tools = await client.listTools()
  assert.deepEqual(tools.tools.map((tool) => tool.name), ['get_youtube_transcript', 'get_transcript_status', 'list_available_languages'])
  const result = await client.callTool({ name: 'get_youtube_transcript', arguments: { url: 'dQw4w9WgXcQ', mode: 'native', text: false } })
  assert.match(result.content[0].text, /Example/u)
  await client.close()
  await server.close()
})
