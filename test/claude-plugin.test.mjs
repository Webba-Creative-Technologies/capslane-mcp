import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const json = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

test('Claude plugin resolves its packaged skill, helper and authenticated remote connection', async () => {
  const plugin = await json('.claude-plugin/plugin.json')
  const marketplace = await json('.claude-plugin/marketplace.json')
  assert.equal(marketplace.plugins.length, 1)
  assert.equal(marketplace.plugins[0].name, plugin.name)
  assert.equal(marketplace.plugins[0].source, './')
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/)
  assert.equal(plugin.homepage, 'https://capslane.com/integrations/mcp#claude-code')
  const config = await json('.mcp.json')
  assert.deepEqual(config.mcpServers, {
    capslane: { type: 'http', url: 'https://capslane.com/mcp', headers: { Authorization: 'Bearer ${CAPSLANE_API_KEY}' } },
  })
  const skill = await readFile(new URL('skills/capslane-youtube-transcripts/SKILL.md', root), 'utf8')
  assert.match(skill, /^---\r?\nname: capslane-youtube-transcripts\r?\n/)
  for (const path of ['scripts/transcript.mjs', 'references/integration.md']) {
    await access(new URL(`skills/capslane-youtube-transcripts/${path}`, root))
  }
  // Enabling this package must not add commands that run automatically.
  assert.equal(plugin.hooks, undefined)
  assert.equal(plugin.agents, undefined)
  assert.equal(plugin.dependencies, undefined)
})
