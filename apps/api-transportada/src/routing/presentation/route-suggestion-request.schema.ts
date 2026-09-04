/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { GEOCODING_PRECISIONS } from '../../database/geocoding.schema.js'

/** Teto do que uma sugestão aceita otimizar. Acima disso o orçamento de tempo não salva ninguém. */
const MAX_STOPS_PER_SUGGESTION = 500
const MAX_VEHICLES_PER_SUGGESTION = 50
const COORDINATE_SCALE = /^-?\d{1,3}(?:\.\d{1,7})?$/u

/**
 * O corpo é opcional inteiro: pedir sugestão para uma viagem não precisa de nada além da viagem. O
 * que ele permite é **sobrepor** o que a configuração da empresa já diz — o conferente que quer
 * testar um orçamento maior não precisa mexer no cadastro para isso.
 */
export const createRouteSuggestionSchema = z
  .object({
    /**
     * ADR-0044 §8: quem manda a semente reproduz uma sugestão exatamente. Ausente, o servidor sorteia
     * uma e a grava — o determinismo não depende do cliente lembrar de pedir.
     */
    seed: z.number().int().min(0).optional(),
    solverTimeBudgetSeconds: z.number().int().min(1).max(600).optional(),
    vehicleIds: z.array(z.uuid()).max(MAX_VEHICLES_PER_SUGGESTION).optional(),
  })
  .strict()

/**
 * P2: distribuir um pool de notas entre veículos **antes de existir viagem**. Ela propõe as viagens;
 * só o aceite as cria.
 */
export const createMultiVehicleSuggestionSchema = z
  .object({
    nfeDocumentIds: z.array(z.uuid()).min(1).max(MAX_STOPS_PER_SUGGESTION),
    seed: z.number().int().min(0).optional(),
    solverTimeBudgetSeconds: z.number().int().min(1).max(600).optional(),
    /**
     * ADR-0055: **par**, não lista de veículos. O motorista é opcional — distribuir a carga antes de
     * saber quem dirige é o uso normal de quem monta a escala na véspera —, mas quando ele vem, a
     * viagem criada pelo aceite já nasce dele, e é isso que a faz aparecer no PWA de campo.
     */
    vehicles: z
      .array(z.object({ driverId: z.uuid().optional(), vehicleId: z.uuid() }).strict())
      .min(1)
      .max(MAX_VEHICLES_PER_SUGGESTION),
  })
  .strict()

export const rejectRouteSuggestionSchema = z
  .object({
    /** Por que foi rejeitada: é o que transforma "a sugestão está boa?" em número, não em opinião. */
    reason: z.string().trim().max(500).optional(),
  })
  .strict()

/**
 * A correção manual do pino (ADR-0044 §3). Ela sempre vence a cascata e **conserta o endereço para
 * sempre**, em toda viagem futura — é o trabalho que o produto pede ao humano em troca de não pedir
 * de novo.
 *
 * A precisão é fixa em `rooftop`: quem arrastou o pino apontou um telhado. Aceitar `city` aqui seria
 * deixar o humano registrar um palpite com a autoridade de uma correção.
 */
export const correctGeocodedAddressSchema = z
  .object({
    latitude: z.string().regex(COORDINATE_SCALE).refine(withinLatitude),
    longitude: z.string().regex(COORDINATE_SCALE).refine(withinLongitude),
    precision: z.literal(GEOCODING_PRECISIONS[0]).optional(),
  })
  .strict()

function withinLatitude(value: string): boolean {
  const parsed = Number(value)
  return parsed >= -90 && parsed <= 90
}

function withinLongitude(value: string): boolean {
  const parsed = Number(value)
  return parsed >= -180 && parsed <= 180
}

export type CreateRouteSuggestionBody = z.infer<typeof createRouteSuggestionSchema>
export type CreateMultiVehicleSuggestionBody = z.infer<typeof createMultiVehicleSuggestionSchema>
export type RejectRouteSuggestionBody = z.infer<typeof rejectRouteSuggestionSchema>
export type CorrectGeocodedAddressBody = z.infer<typeof correctGeocodedAddressSchema>
