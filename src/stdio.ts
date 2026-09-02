#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCapslaneMcpServer } from './index.js'

const apiKey = process.env.CAPSLANE_API_KEY?.trim()
if (!apiKey) {
  process.stderr.write('CAPSLANE_API_KEY is required\n')
  process.exit(1)
}

const server = createCapslaneMcpServer({ apiKey, baseUrl: process.env.CAPSLANE_BASE_URL })
await server.connect(new StdioServerTransport())
