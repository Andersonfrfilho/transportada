/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { TRIP_COST_ENTRY_KINDS } from '../../database/trip-financial.schema.js'

const AMOUNT_PATTERN = /^[0-9]{1,13}(\.[0-9]{1,4})?$/u
/** Lançamento é dinheiro que saiu: zero não é custo, e o CHECK do banco devolveria 500. */
const NON_ZERO_DIGIT = /[1-9]/u

/**
 * Spec 169 RF5: o seletor novo manda `entryKindId`, lido do cadastro da empresa. `kind` continua
 * aceito sozinho (compatibilidade — integrações e testes existentes que já lançam por ele), mas
 * nunca os dois juntos: um mandaria o outro calado.
 */
const costSchema = z
  .object({
    amount: z
      .string()
      .regex(AMOUNT_PATTERN)
      .refine((value) => NON_ZERO_DIGIT.test(value)),
    description: z.string().trim().max(200).default(''),
    entryKindId: z.uuid().optional(),
    kind: z.enum(TRIP_COST_ENTRY_KINDS).optional(),
  })
  .strict()
  .refine((body) => (body.kind === undefined) !== (body.entryKindId === undefined), {
    message: 'inform kind or entryKindId, never both or neither',
    path: ['kind'],
  })

/** Spec 169 RF3: mesmas regras do gasto — valor maior que zero, descrição opcional. */
const revenueSchema = z
  .object({
    amount: z
      .string()
      .regex(AMOUNT_PATTERN)
      .refine((value) => NON_ZERO_DIGIT.test(value)),
    description: z.string().trim().max(200).default(''),
    entryKindId: z.uuid(),
  })
  .strict()

/** Recalcular um congelado exige motivo: número que muda sem explicação é pergunta sem resposta. */
const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()

export async function parseTripCostRequest(request: Request): Promise<{
  readonly amount: string
  readonly description: string
  readonly entryKindId?: string | undefined
  readonly kind?: (typeof TRIP_COST_ENTRY_KINDS)[number] | undefined
}> {
  return parseBody(costSchema, request)
}

export async function parseTripFinancialReason(request: Request): Promise<string> {
  return (await parseBody(reasonSchema, request)).reason
}

export async function parseTripRevenueRequest(request: Request): Promise<{
  readonly amount: string
  readonly description: string
  readonly entryKindId: string
}> {
  return parseBody(revenueSchema, request)
}
