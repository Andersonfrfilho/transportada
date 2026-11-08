/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createNfeXmlReceiptsClient,
  needsAttention,
  parseNfeXmlReceipts,
} from '../../src/modules/nfe-workspace/shared/nfeXmlReceipts.service'

const ROW = {
  channel: 'whatsapp',
  createdAt: '2026-11-08T12:00:00.000Z',
  filesCount: 0,
  id: 'r1',
  importId: null,
  lastErrorCode: null,
  rejectReason: 'sender_not_allowed',
  sender: '****7777',
  status: 'rejected',
}

describe('xml receipts (spec 301)', () => {
  test('parses the list and drops rows it does not understand', () => {
    const parsed = parseNfeXmlReceipts({
      data: [
        ROW,
        { ...ROW, id: 'bad', status: 'weird' },
        { id: 'x' },
        { ...ROW, id: 'r2', channel: 'email', status: 'imported', filesCount: 3 },
      ],
    })
    expect(parsed.map((item) => item.id)).toEqual(['r1', 'r2'])
    expect(parsed[0]).toMatchObject({ rejectReason: 'sender_not_allowed', status: 'rejected' })
    expect(parsed[1]).toMatchObject({ channel: 'email', filesCount: 3 })
  })

  test('refuses a body that is not the expected envelope', () => {
    expect(() => parseNfeXmlReceipts({})).toThrow('NFE_XML_RECEIPTS_RESPONSE_INVALID')
    expect(() => parseNfeXmlReceipts(null)).toThrow('NFE_XML_RECEIPTS_RESPONSE_INVALID')
  })

  test('only what did not finish well needs attention', () => {
    const [rejected, imported] = parseNfeXmlReceipts({
      data: [ROW, { ...ROW, id: 'r2', status: 'imported' }],
    })
    expect(needsAttention(rejected!)).toBe(true)
    expect(needsAttention(imported!)).toBe(false)
  })

  test('the client calls the receipts route with the bearer token and fails loudly on errors', async () => {
    const requests: Request[] = []
    const client = createNfeXmlReceiptsClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        requests.push(input as Request)
        return Promise.resolve(new Response(JSON.stringify({ data: [ROW] }), { status: 200 }))
      },
      getAccessToken: () => Promise.resolve('tok'),
    })
    expect(await client.list(5)).toHaveLength(1)
    expect(requests[0]!.url).toBe('https://api.test/nfe-xml-receipts?limit=5')
    expect(requests[0]!.headers.get('authorization')).toBe('Bearer tok')

    const failing = createNfeXmlReceiptsClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.resolve(new Response('', { status: 500 })),
      getAccessToken: () => Promise.resolve('tok'),
    })
    const failure = await failing.list().then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(String(failure)).toContain('NFE_XML_RECEIPTS_REQUEST_FAILED')
  })
})
