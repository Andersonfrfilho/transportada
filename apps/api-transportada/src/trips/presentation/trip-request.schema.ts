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
/**
 * O vínculo em lote tem teto próprio, dez vezes o do lote de status. São operações diferentes: o
 * maço que o separador marca de uma vez é de dezenas, e a viagem que se monta a partir de um filtro
 * é de centenas — a 075 mede trezentas e trinta e três num filtro só. O teto continua existindo
 * porque o lote é **uma transação**, e uma transação que segura o lock da viagem por tempo demais
 * trava quem despacha.
 */
const MAX_LINK_BATCH_DOCUMENTS = 500

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

export const linkTripDocumentsBatchSchema = z
  .object({ nfeDocumentIds: z.array(z.uuid()).min(1).max(MAX_LINK_BATCH_DOCUMENTS) })
  .strict()

export type LinkTripDocumentsBatchBody = z.infer<typeof linkTripDocumentsBatchSchema>

/**
 * A avaliação prevista da viagem que ainda não existe. O teto é o do vínculo em lote: é a mesma
 * seleção de notas, avaliada antes de virar viagem.
 */
export const previewTripValuationSchema = z
  .object({
    driverIds: z.array(z.uuid()).max(MAX_LINK_BATCH_DOCUMENTS).default([]),
    nfeDocumentIds: z.array(z.uuid()).min(1).max(MAX_LINK_BATCH_DOCUMENTS),
    vehicleId: z.uuid(),
  })
  .strict()

export type PreviewTripValuationBody = z.infer<typeof previewTripValuationSchema>

/**
 * A linha da estrada para pontos que **ainda não são viagem** — quem monta o roteiro no formulário
 * precisa ver a rua antes de criar a viagem, e a rota irmã (`/trips/:id/route-geometry`) exige uma
 * viagem que ainda não existe.
 *
 * ⚠️ O teto de pontos existe porque cada consulta vira uma chamada ao OSRM: a rota é autenticada,
 * mas um corpo de mil paradas é amplificação de CPU num serviço que hospedamos. Cem cobre a maior
 * viagem real com folga.
 */
export const MAX_ROUTE_GEOMETRY_POINTS = 100

export const routeGeometrySchema = z
  .object({
    points: z
      .array(
        z
          .object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
          })
          .strict(),
      )
      .min(2)
      .max(MAX_ROUTE_GEOMETRY_POINTS),
  })
  .strict()

export type RouteGeometryBody = z.infer<typeof routeGeometrySchema>

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
