/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest, parseBody } from '../../http/request-parsing.service.js'

const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{4})$/
const OSM_NODE_ID_PATTERN = /^[1-9][0-9]*$/

const adjustTollBoothChargeBodySchema = z
  .object({
    chargeCar: z.string().regex(MONEY_DECIMAL).nullish(),
    chargePerAxle: z.string().regex(MONEY_DECIMAL).nullish(),
    /** Spec 095 D3: a tarifa de tag, independente das duas acima — o OSM não a declara. */
    chargePerAxleAutomatic: z.string().regex(MONEY_DECIMAL).nullish(),
    observedOn: z.iso.date(),
  })
  .strict()
  /** No mínimo um campo corrige algo — os três nulos gravariam trabalho jogado fora (spec 095). */
  .refine(
    (body) =>
      (body.chargeCar ?? null) !== null ||
      (body.chargePerAxle ?? null) !== null ||
      (body.chargePerAxleAutomatic ?? null) !== null,
    {
      message: 'inform chargePerAxle, chargeCar or chargePerAxleAutomatic',
      path: ['chargePerAxle'],
    },
  )

/**
 * `osm_node_id` é numérico e sem limite de dígitos declarado no catálogo — id malformado é pedido
 * malformado (400), não recurso ausente.
 */
export function parseOsmNodeId(value: string): number {
  if (!OSM_NODE_ID_PATTERN.test(value)) {
    throw invalidRequest([{ field: 'osmNodeId', message: 'invalid toll booth node id' }])
  }
  return Number(value)
}

export function parseAdjustTollBoothChargeBody(request: Request): Promise<{
  readonly chargeCar: null | string
  readonly chargePerAxle: null | string
  readonly chargePerAxleAutomatic: null | string
  readonly observedOn: string
}> {
  return parseBody(adjustTollBoothChargeBodySchema, request).then((body) => ({
    chargeCar: body.chargeCar ?? null,
    chargePerAxle: body.chargePerAxle ?? null,
    chargePerAxleAutomatic: body.chargePerAxleAutomatic ?? null,
    observedOn: body.observedOn,
  }))
}
