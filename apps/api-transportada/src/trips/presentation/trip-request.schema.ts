/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

/**
 * spec.md linha 66 exige "mínimo 1" condutor na criação — T006 não impôs a regra no domínio/
 * aplicação (aceitava `driverIds: []`). Fechado aqui, na fronteira HTTP, espelhando o mesmo teto
 * de `MAX_DRIVERS_PER_MANIFEST` em `mdfe-manifest-request.schema.ts` e `MAX_DRIVERS_PER_TRIP` do
 * schema de banco (`database/trip.schema.ts`).
 */
const MAX_TRIP_DRIVERS = 10

export const createTripSchema = z
  .object({
    driverIds: z.array(z.uuid()).min(1).max(MAX_TRIP_DRIVERS),
    vehicleId: z.uuid(),
  })
  .strict()

export type CreateTripBody = z.infer<typeof createTripSchema>

export const linkTripDocumentSchema = z
  .object({
    freightCalculationId: z.uuid().nullable().default(null),
    nfeDocumentId: z.uuid().nullable().default(null),
  })
  .strict()

export type LinkTripDocumentBody = z.infer<typeof linkTripDocumentSchema>

/**
 * O maço real do armazém, não uma lista arbitrária — mesmo teto que o T009 testou
 * (`transition-trip-documents-batch.use-case.ts`).
 */
const MAX_BATCH_DOCUMENTS = 50

const TRIP_DOCUMENT_ACTIONS = ['deliver', 'load', 'return', 'separate'] as const

/**
 * `returnReason` é opcional aqui de propósito: exigi-lo só quando `action = 'return'` é regra de
 * domínio, e o use case (T008/T009) já lança `TripDocumentReturnReasonRequiredError` — validar
 * duas vezes duplicaria a mensagem sem duplicar a segurança.
 */
export const transitionTripDocumentSchema = z
  .object({
    note: z.string().trim().min(1).nullable().default(null),
    returnReason: z.string().trim().min(1).nullable().default(null),
  })
  .strict()

export type TransitionTripDocumentBody = z.infer<typeof transitionTripDocumentSchema>

export const batchTransitionTripDocumentsSchema = z
  .object({
    action: z.enum(TRIP_DOCUMENT_ACTIONS),
    documentIds: z.array(z.uuid()).min(1).max(MAX_BATCH_DOCUMENTS),
    note: z.string().trim().min(1).nullable().default(null),
    returnReason: z.string().trim().min(1).nullable().default(null),
  })
  .strict()

export type BatchTransitionTripDocumentsBody = z.infer<typeof batchTransitionTripDocumentsSchema>

export const dispatchTripSchema = z
  .object({
    force: z.boolean().default(false),
    forceReason: z.string().trim().min(1).nullable().default(null),
  })
  .strict()

export type DispatchTripBody = z.infer<typeof dispatchTripSchema>

/** Teto generoso: nenhuma viagem real chega perto disso — só evita um corpo absurdo. */
const MAX_TRIP_STOPS = 200

export const reorderTripStopsSchema = z
  .object({ stopIds: z.array(z.uuid()).min(1).max(MAX_TRIP_STOPS) })
  .strict()

export type ReorderTripStopsBody = z.infer<typeof reorderTripStopsSchema>
