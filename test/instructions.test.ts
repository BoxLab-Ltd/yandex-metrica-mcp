import { describe, expect, it } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { loadConfig } from '../src/config.js'
import { createServer } from '../src/mcp/server.js'

describe('server instructions', () => {
    it('hands the hygiene rules to the client on initialize', async () => {
        const server = createServer(loadConfig())
        const client = new Client({ name: 'test', version: '0.0.0' })
        const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
        await Promise.all([
            server.connect(serverSide),
            client.connect(clientSide),
        ])

        const instructions = client.getInstructions() ?? ''
        expect(instructions).toContain("ym:s:isRobot=='No'")
        expect(instructions).toContain('accuracy="full"')
        expect(instructions).toContain('not additive')

        await client.close()
    })
})
