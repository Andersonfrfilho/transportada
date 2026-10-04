/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const CARGO_PREVIEW_EVENT_TYPE = {
  PROCESS: 'transportada.cargo-preview.process.requested',
  REEVALUATE: 'transportada.cargo-preview.reevaluate.requested',
} as const

const envelopeBase = {
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  eventId: z.uuid(),
  occurredAt: z.iso.datetime(),
  version: z.literal(1),
}

/**
 * Spec 237 Fase 4a: o pedido de leitura carrega **referência** — prévia, bucket e chave —, nunca os
 * bytes nem linha da planilha (`security.md` §6). A reavaliação carrega só o contratante: o que
 * mudou foi o conjunto de notas, e o worker relê tudo do banco.
 */
export const cargoPreviewEnvelopeV1Schema = z.discriminatedUnion('type', [
  z.strictObject({
    ...envelopeBase,
    payload: z.strictObject({
      bucket: z.string().trim().min(1),
      contractorId: z.uuid(),
      objectKey: z.string().trim().min(1),
      previewId: z.uuid(),
    }),
    type: z.literal(CARGO_PREVIEW_EVENT_TYPE.PROCESS),
  }),
  z.strictObject({
    ...envelopeBase,
    payload: z.strictObject({ contractorId: z.uuid() }),
    type: z.literal(CARGO_PREVIEW_EVENT_TYPE.REEVALUATE),
  }),
])

export type CargoPreviewEnvelopeV1 = z.infer<typeof cargoPreviewEnvelopeV1Schema>
export type CargoPreviewProcessEnvelope = Extract<
  CargoPreviewEnvelopeV1,
  { type: typeof CARGO_PREVIEW_EVENT_TYPE.PROCESS }
>
