/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237, revisão de segurança da Fase 4a (S1): o leitor síncrono não respeita prazo — só uma
 * thread que pode ser terminada respeita. A leitura roda numa `worker_thread`; o event loop do
 * worker segue livre enquanto ela lê, e passou do teto, a thread morre e a prévia é
 * `PREVIEW_PARSE_TIMEOUT` (resultado, nunca exceção que volta à fila).
 */
import { describe, expect, test } from 'bun:test'

import { createThreadedCargoPreviewWorkbookReader } from '../../src/cargo-preview/infrastructure/threaded-cargo-preview-workbook.gateway.js'
import {
  buildHugeDecimalAttack,
  ATTACK_COLUMN_MAP,
} from '../fixtures/cargo-preview-attack.fixture.js'
import {
  buildCargoPreviewWorkbook,
  FR_COLUMN_MAP,
} from '../fixtures/cargo-preview-workbook.fixture.js'

const FR_PROFILE = { columnMap: FR_COLUMN_MAP, sheetName: 'IMPORTAÇÃO' }
const ATTACK_PROFILE = { columnMap: ATTACK_COLUMN_MAP, sheetName: null }
const TICK_MS = 5

/** Conta quantas vezes o event loop rodou um timer enquanto a promessa não resolvia. */
async function countTicksWhile<TResult>(work: Promise<TResult>) {
  let ticks = 0
  const timer = setInterval(() => {
    ticks += 1
  }, TICK_MS)
  const result = await work
  clearInterval(timer)
  return { result, ticks }
}

describe('a leitura da prévia numa thread terminável (spec 237, segurança S1)', () => {
  test('planilha boa vira o plano dos itens, lido na thread', async () => {
    const reader = createThreadedCargoPreviewWorkbookReader()
    const reading = await reader.read({
      bytes: buildCargoPreviewWorkbook({
        rows: [{ 'PESO TOTAL': 10.5, RouteName: 'FR.S.CAR', RoutingDate: 46297, VALOR: 100.1 }],
      }),
      profile: FR_PROFILE,
    })
    expect(reading).toMatchObject({ plan: { plannedDate: '2026-10-02', rowCount: 1 } })
  })

  test('o código do leitor atravessa a thread como resultado', async () => {
    const reader = createThreadedCargoPreviewWorkbookReader()
    const bytes = new TextEncoder().encode('PK\u0003\u0004 não é zip')
    expect(await reader.read({ bytes, profile: FR_PROFILE })).toEqual({
      code: 'PREVIEW_NOT_A_WORKBOOK',
    })
  })

  test('o event loop segue rodando enquanto a planilha pesada é lida', async () => {
    const reader = createThreadedCargoPreviewWorkbookReader()
    const bytes = buildHugeDecimalAttack({ digits: 32_700, rowCount: 2_000 })
    const { result, ticks } = await countTicksWhile(reader.read({ bytes, profile: ATTACK_PROFILE }))
    expect(result).toMatchObject({ plan: { rowCount: 2_000 } })
    expect(ticks).toBeGreaterThan(5)
  })

  test('passou do teto, a thread é terminada e a prévia é PREVIEW_PARSE_TIMEOUT', async () => {
    const ceilingMs = 30
    const reader = createThreadedCargoPreviewWorkbookReader({ ceilingMs })
    const bytes = buildHugeDecimalAttack({ digits: 32_700, rowCount: 2_000 })
    const startedAt = performance.now()
    expect(await reader.read({ bytes, profile: ATTACK_PROFILE })).toEqual({
      code: 'PREVIEW_PARSE_TIMEOUT',
    })
    expect(performance.now() - startedAt).toBeLessThan(1_000)
  })
})
