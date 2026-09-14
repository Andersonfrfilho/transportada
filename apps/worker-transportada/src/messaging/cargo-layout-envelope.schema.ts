/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

/**
 * ⚠️ Cópia por valor de `CARGO_LAYOUT_OUTBOX_EVENT_TYPES` da api — o worker não importa código-fonte
 * de outra app, e o CHECK da outbox mora lá. `test/cargo-layout/envelope.contract.ts` guarda a
 * paridade.
 */
export const CARGO_LAYOUT_EVENT_TYPE = {
  REQUESTED: 'transportada.trip.cargo-layout.requested',
} as const

/**
 * O payload carrega **referência** — a planta e o hash da entrada —, nunca a carga (spec 145 D8). O
 * rótulo da parada e o cliente são PII e ficam na coluna `input` da planta; `strictObject` é o que
 * faz um payload engordado ser recusado em vez de trafegar.
 */
export const cargoLayoutEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(CARGO_LAYOUT_EVENT_TYPE.REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    inputHash: z.string().trim().min(1),
    layoutId: z.uuid(),
  }),
})

export type CargoLayoutEnvelopeV1 = z.infer<typeof cargoLayoutEnvelopeV1Schema>
