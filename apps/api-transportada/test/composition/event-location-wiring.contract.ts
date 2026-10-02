/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 T3.3: a única fiação do carimbo que não é um `...input` está em `main.ts`. As rotas do
 * motorista entregam `location` aos casos de uso por espalhamento, e o caso de uso resolve o carimbo
 * sozinho; já o `dispatch` do motorista é uma função de composição que monta `dispatchTrip` à mão, e
 * esquecer de repassar o carimbo ali deixaria todo despacho sem ponto — sem erro de tipo, porque o
 * campo é opcional no `dispatchTrip` do escritório. No molde de
 * `test/whatsapp/occurrence-persistence-wiring.contract.ts`: varredura do texto-fonte.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const MAIN_TS_PATH = new URL('../../src/main.ts', import.meta.url)

function extractDispatchCurrentTripBlock(source: string): string {
  const start = source.indexOf('dispatchCurrentTrip: (input) =>')
  if (start === -1) throw new Error('dispatchCurrentTrip não encontrado em main.ts')
  const end = source.indexOf('listFieldOccurrenceTypes: (input) =>', start)
  if (end === -1) throw new Error('fim do bloco dispatchCurrentTrip não encontrado em main.ts')

  return source.slice(start, end)
}

describe('fiação do carimbo do despacho do motorista em main.ts (196 T3.3)', () => {
  const block = extractDispatchCurrentTripBlock(readFileSync(MAIN_TS_PATH, 'utf8'))

  test('o despacho do motorista passa por dispatchDriverTrip, que resolve o carimbo', () => {
    expect(block).toContain('dispatchDriverTrip(')
  })

  test('e repassa o carimbo que recebeu ao dispatchTrip', () => {
    expect(block).toContain('locationStamp: request.locationStamp')
  })

  test('com o canal do app, e não o do WhatsApp nem o do escritório', () => {
    expect(block).toContain('channel: TRIP_FIELD_CHANNELS.driverApp')
  })
})
