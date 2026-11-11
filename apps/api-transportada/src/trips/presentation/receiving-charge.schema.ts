/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E1, E3, E4, E11): os campos novos do registro da ocorrência de parada — as fotos por vaga e a cobrança
 * no recebimento. Aditivos e opcionais: o corpo de todo app anterior continua igual (os esquemas são `.strict()`).
 *
 * ⚠️ Sem preço, sem unidade e sem cliente/contratante: o valor é o que o motorista digitou, e as partes saem da nota
 * no servidor (`companyId` do contexto, nunca do corpo).
 */
import { z } from 'zod'

import { STOP_OCCURRENCE_PAID_BY } from '../../database/trip.schema.js'
import { DECLARED_AMOUNT_DECIMAL } from '../../shared/money.constant.js'
import { PIX_KEY_MAX_LENGTH, PIX_KEY_TYPES } from '../../shared/pix-key-type.constant.js'
import { RECEIVING_CHARGE_MODES } from '../domain/receiving-charge.policy.js'

/** Uma foto por vaga; o teto é folgado sobre as duas vagas da cobrança, e só segura corpo repetido sem fim. */
const STOP_OCCURRENCE_PHOTOS_LIMIT = 10
/** Teto de notas numa cobrança: a parada real tem poucas; o teto segura o corpo. */
const RECEIVING_CHARGE_DOCUMENTS_LIMIT = 100
const SLOT_KEY_PATTERN = /^[a-z][a-z0-9_]{0,47}$/u

/** Spec 247 (RF14): valor é texto com até duas casas — negativo, três casas ou número JSON é `400`. */
const amountSchema = z.string().regex(DECLARED_AMOUNT_DECIMAL)

export const stopOccurrencePhotosSchema = z
  .array(
    z
      .object({
        objectId: z.uuid(),
        slotKey: z.string().regex(SLOT_KEY_PATTERN),
      })
      .strict(),
  )
  .min(1)
  .max(STOP_OCCURRENCE_PHOTOS_LIMIT)

export const receivingChargeSchema = z
  .object({
    amount: amountSchema.optional(),
    documents: z
      .array(z.object({ amount: amountSchema.optional(), documentId: z.uuid() }).strict())
      .min(1)
      .max(RECEIVING_CHARGE_DOCUMENTS_LIMIT)
      .optional(),
    driverPix: z
      .object({
        key: z.string().trim().min(1).max(PIX_KEY_MAX_LENGTH),
        type: z.enum(PIX_KEY_TYPES),
      })
      .strict()
      .optional(),
    mode: z.enum(RECEIVING_CHARGE_MODES).optional(),
    paidBy: z.enum(STOP_OCCURRENCE_PAID_BY).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    /** E4: na agrupada o valor é um só; valor por nota nela é engano do cliente, nunca somado em silêncio. */
    if (value.mode === 'grouped') {
      value.documents?.forEach((document, index) => {
        if (document.amount !== undefined) {
          context.addIssue({
            code: 'custom',
            message: 'A grouped charge has a single amount.',
            path: ['documents', index, 'amount'],
          })
        }
      })
    }
    /** O PIX só vale quando o motorista pagou; mandá-lo com a empresa pagando é dado sobrando. */
    if (value.paidBy === 'company' && value.driverPix !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'The driver PIX applies only when the driver paid.',
        path: ['driverPix'],
      })
    }
  })

export type ReceivingChargeBody = z.infer<typeof receivingChargeSchema>
export type StopOccurrencePhotosBody = z.infer<typeof stopOccurrencePhotosSchema>

/** `exactOptionalPropertyTypes`: tira as chaves ausentes antes de entregar ao caso de uso. */
export function toReceivingChargeInput(body: ReceivingChargeBody) {
  return {
    ...(body.amount === undefined ? {} : { amount: body.amount }),
    ...(body.documents === undefined
      ? {}
      : {
          documents: body.documents.map((document) => ({
            documentId: document.documentId,
            ...(document.amount === undefined ? {} : { amount: document.amount }),
          })),
        }),
    ...(body.driverPix === undefined ? {} : { driverPix: body.driverPix }),
    ...(body.mode === undefined ? {} : { mode: body.mode }),
    ...(body.paidBy === undefined ? {} : { paidBy: body.paidBy }),
  }
}
