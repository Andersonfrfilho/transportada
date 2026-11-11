/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  createFieldReportHoldsClient,
  parseFieldReportHoldSettings,
  parseFieldReportHolds,
} from '../../src/modules/pending-items/shared/fieldReportHoldsClient.service'

const HOLD = {
  display: { invoiceNumber: '123/1', occurrenceTypeName: 'Recusa' },
  id: 'h1',
  occurredAt: '2026-11-08T12:00:00.000Z',
  probableDuplicateOf: null,
  receivedAt: '2026-11-10T12:00:00.000Z',
  tappedAt: '2026-11-08T12:00:00.000Z',
}

describe('retidos do app (spec 320)', () => {
  test('lê a linha com número da nota e nome do tipo', () => {
    expect(parseFieldReportHolds({ data: [HOLD] })).toEqual([
      {
        id: 'h1',
        invoiceNumber: '123/1',
        occurredAt: HOLD.occurredAt,
        occurrenceTypeName: 'Recusa',
        probableDuplicate: false,
        receivedAt: HOLD.receivedAt,
        tappedAt: HOLD.tappedAt,
      },
    ])
  })

  test('linha malformada sai da lista sem derrubar as outras, e sem display vira nulo', () => {
    const withoutDisplay = { ...HOLD, display: undefined }
    const holds = parseFieldReportHolds({
      data: [{ id: 'x' }, 'lixo', { ...withoutDisplay, probableDuplicateOf: 'abc' }],
    })
    expect(holds).toHaveLength(1)
    expect(holds[0]?.invoiceNumber).toBeNull()
    expect(holds[0]?.probableDuplicate).toBe(true)
  })

  test('corpo fora do contrato é erro', () => {
    expect(() => parseFieldReportHolds({})).toThrow()
  })

  test('liberar e descartar vão por POST na rota do item', async () => {
    const seen: string[] = []
    const client = createFieldReportHoldsClient({
      apiUrl: 'http://api',
      fetch: (input) => {
        const request = input as Request
        seen.push(`${request.method} ${new URL(request.url).pathname}`)
        return Promise.resolve(new Response('{"data":{}}', { status: 200 }))
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    await client.decide({ decision: 'release', id: 'h1' })
    await client.decide({ decision: 'discard', id: 'h2' })
    expect(seen).toEqual([
      'POST /field-report-holds/h1/release',
      'POST /field-report-holds/h2/discard',
    ])
  })

  test('o interruptor lê e grava na rota da empresa e recusa corpo fora do contrato', async () => {
    expect(parseFieldReportHoldSettings({ data: { enabled: true, updatedAt: null } })).toEqual({
      enabled: true,
    })
    expect(() => parseFieldReportHoldSettings({ data: { enabled: 'sim' } })).toThrow()
    const seen: string[] = []
    const client = createFieldReportHoldsClient({
      apiUrl: 'http://api',
      fetch: (input) => {
        const request = input as Request
        seen.push(`${request.method} ${new URL(request.url).pathname}`)
        return Promise.resolve(new Response('{"data":{"enabled":true}}', { status: 200 }))
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    expect(await client.saveSettings(true)).toEqual({ enabled: true })
    expect(await client.readSettings()).toEqual({ enabled: true })
    expect(seen).toEqual([
      'PUT /company-settings/field-report-hold',
      'GET /company-settings/field-report-hold',
    ])
  })
})
