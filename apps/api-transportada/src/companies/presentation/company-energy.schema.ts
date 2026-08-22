/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { parseBody } from '../../http/request-parsing.service.js'
import { ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH } from '../../shared/energy-tariff.constant.js'

/**
 * Um dígito inteiro e quatro casas. O CHECK do banco só cobra `> 0`, e a tarifa homologada é seca:
 * imposto e bandeira mais ou menos dobram a conta, então dez é digitação errada, não fatura — e
 * fator zero zeraria o R$/km do elétrico sem nada reclamar.
 */
const ADJUSTMENT_FACTOR = /^[0-9]\.[0-9]{4}$/

const chooseDistributorBodySchema = z
  .object({
    adjustmentFactor: z
      .string()
      .regex(ADJUSTMENT_FACTOR)
      .refine((value) => Number.parseFloat(value) > 0),
    distributorCode: z
      .string()
      .min(1)
      .max(ENERGY_DISTRIBUTOR_CODE_MAX_LENGTH)
      .transform((value) => value.toUpperCase()),
  })
  .strict()

export function parseChooseDistributorBody(request: Request): Promise<{
  readonly adjustmentFactor: string
  readonly distributorCode: string
}> {
  return parseBody(chooseDistributorBodySchema, request)
}
