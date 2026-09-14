/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import {
  CARGO_LAYOUT_EVENT_TYPE,
  cargoLayoutEnvelopeV1Schema,
} from '../../src/messaging/cargo-layout-envelope.schema.js'

const OUTBOX_API = new URL(
  '../../../api-transportada/src/database/trip-cargo-layout-outbox.schema.ts',
  import.meta.url,
)
const REQUEST_API = new URL(
  '../../../api-transportada/src/trips/infrastructure/cargo-layout-request.support.ts',
  import.meta.url,
)

const VALID = {
  companyId: crypto.randomUUID(),
  correlationId: 'correlation-145',
  eventId: crypto.randomUUID(),
  occurredAt: new Date(0).toISOString(),
  payload: {
    inputHash: 'a'.repeat(64),
    layoutId: crypto.randomUUID(),
  },
  type: CARGO_LAYOUT_EVENT_TYPE.REQUESTED,
  version: 1,
} as const

describe('envelope do pedido de planta (spec 145 D8)', () => {
  test('aceita o envelope de referência', () => {
    expect(cargoLayoutEnvelopeV1Schema.parse(VALID)).toEqual(VALID)
  })

  /**
   * O rótulo da parada e o nome do cliente são PII e moram na coluna `input` da planta: a fila só
   * leva a referência. `strictObject` é o que recusa um payload engordado em vez de deixá-lo passar.
   */
  test('payload com dado a mais (rótulo da parada) é recusado', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { ...VALID.payload, stopLabel: 'Maria da Silva — Rua X, 10' },
    })

    expect(result.success).toBe(false)
  })

  test('payload sem layoutId é recusado', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { inputHash: VALID.payload.inputHash },
    })

    expect(result.success).toBe(false)
  })

  test('payload sem inputHash é recusado', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { layoutId: VALID.payload.layoutId },
    })

    expect(result.success).toBe(false)
  })

  test('layoutId que não é uuid é recusado', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({
      ...VALID,
      payload: { ...VALID.payload, layoutId: 'layout-1' },
    })

    expect(result.success).toBe(false)
  })

  test('tipo de evento de outro trilho é recusado', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({
      ...VALID,
      type: 'transportada.aggregate.attachment.extraction.requested',
    })

    expect(result.success).toBe(false)
  })

  test('versão diferente de 1 é recusada', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({ ...VALID, version: 2 })

    expect(result.success).toBe(false)
  })

  test('campo desconhecido no envelope é recusado', () => {
    const result = cargoLayoutEnvelopeV1Schema.safeParse({
      ...VALID,
      actorId: crypto.randomUUID(),
    })

    expect(result.success).toBe(false)
  })
})

/**
 * ⚠️ **Cópia por valor.** O tipo do evento e as chaves do payload nascem na API, que grava a outbox;
 * o worker só os lê. Um nome trocado de um lado e não do outro é mensagem recusada pelo envelope — e a
 * planta fica `queued` para sempre, sem erro nenhum.
 */
describe('paridade do pedido de planta com a API (spec 145 D8)', () => {
  test('o tipo do evento é o único que a outbox da API aceita', async () => {
    const source = await readFile(OUTBOX_API, 'utf8')
    const declaration = /CARGO_LAYOUT_OUTBOX_EVENT_TYPES = \[([^\]]*)\]/.exec(source)
    const types = [...(declaration?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1])

    expect(types).toEqual([CARGO_LAYOUT_EVENT_TYPE.REQUESTED])
  })

  test('as chaves do payload são as que a API grava', async () => {
    const source = await readFile(REQUEST_API, 'utf8')
    const payload = /payload: \{([^}]*)\}/.exec(source)
    const keys = [...(payload?.[1] ?? '').matchAll(/(\w+):/g)].map((match) => match[1]).sort()

    expect(keys).toEqual(Object.keys(cargoLayoutEnvelopeV1Schema.shape.payload.shape).sort())
  })
})
