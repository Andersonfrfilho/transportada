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

/**
 * O recorte da seleção da tela. Lista **vazia é a viagem inteira**, igual a corpo ausente: o painel
 * de prontidão continua emitindo tudo sem mandar corpo nenhum.
 */
export const createTripCteBatchSchema = z
  .object({ tripDocumentIds: z.array(z.uuid()).max(MAX_BATCH_DOCUMENTS).default([]) })
  .strict()

export type CreateTripCteBatchBody = z.infer<typeof createTripCteBatchSchema>

/** Teto generoso: nenhuma viagem real chega perto disso — só evita um corpo absurdo. */
const MAX_TRIP_STOPS = 200

export const reorderTripStopsSchema = z
  .object({ stopIds: z.array(z.uuid()).min(1).max(MAX_TRIP_STOPS) })
  .strict()

export type ReorderTripStopsBody = z.infer<typeof reorderTripStopsSchema>

/**
 * ADR-0043 §3 (D9): sobrescrever é ação, não campo — `requestedBy` e `reason` são obrigatórios
 * (a informação que some primeiro é justamente quem pediu o desvio). O endereço aceita
 * `postalCode`/`number`/`cityCode` nulos (mesmo formato de `StopAddressComponents`) porque nem
 * todo desvio tem CEP normalizável — vira parada `SEM ENDEREÇO`, igual a qualquer outra.
 */
export const overrideDeliveryAddressSchema = z
  .object({
    newAddress: z
      .object({
        cityCode: z.string().trim().min(1).nullable().default(null),
        number: z.string().trim().min(1).nullable().default(null),
        postalCode: z.string().trim().min(1).nullable().default(null),
      })
      .strict(),
    newLabel: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    requestedBy: z.string().trim().min(1),
  })
  .strict()

export type OverrideDeliveryAddressBody = z.infer<typeof overrideDeliveryAddressSchema>

/**
 * Spec 065 D4c: `null` é o padrão e volta a derivar da classificação, então ele é **valor legítimo
 * do corpo**, não ausência. `.nullable()` sem `.optional()` obriga quem chama a dizer qual dos três
 * estados quer.
 */
export const setTripMdfeRequirementSchema = z
  .object({
    reason: z.string().trim().min(1).nullable().default(null),
    requiresMdfe: z.boolean().nullable(),
  })
  .strict()

export type SetTripMdfeRequirementBody = z.infer<typeof setTripMdfeRequirementSchema>
