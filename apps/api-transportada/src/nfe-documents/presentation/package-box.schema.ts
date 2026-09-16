/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest } from '../../http/request-parsing.service.js'
import {
  MARGIN_RELIABLE_MM,
  MARGIN_UNRELIABLE_MM,
  PACKAGE_BOX_MEASUREMENT_SOURCES,
  PACKAGE_BOX_MEASUREMENT_WARNINGS,
} from '../domain/package-box-measurement.constant.js'
import { resolveMeasurementMargin } from '../domain/package-box-measurement.policy.js'
import {
  PACKAGE_BOX_STATUS_FILTERS,
  type PackageBoxMeasurement,
  type PackageBoxStatusFilter,
} from '../application/package-box.port.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * Spec 152 (D8, D17, experimental): a proposta da câmera, guardada por auditoria (D17). `.strict()`
 * como o resto do corpo — campo a mais aqui é recusa, não silêncio.
 */
const cameraMeasurementSchema = z
  .object({
    engine: z.string().min(1).max(32),
    heightMarginMm: z.number().int().min(0).max(3000).optional(),
    impreciseConfirmed: z.boolean().default(false),
    lengthMarginMm: z.number().int().min(0).max(3000).optional(),
    proposedHeightMm: z.number().int().positive().max(3000).optional(),
    proposedLengthMm: z.number().int().positive().max(6000).optional(),
    proposedWidthMm: z.number().int().positive().max(3000).optional(),
    warnings: z.array(z.enum(PACKAGE_BOX_MEASUREMENT_WARNINGS)).default([]),
    widthMarginMm: z.number().int().min(0).max(3000).optional(),
  })
  .strict()

/** A trinca de chaves de cada dimensão, para a regra de imprecisão olhar uma dimensão por vez. */
const CAMERA_DIMENSIONS = [
  { margin: 'heightMarginMm', proposed: 'proposedHeightMm', recorded: 'heightMm' },
  { margin: 'lengthMarginMm', proposed: 'proposedLengthMm', recorded: 'lengthMm' },
  { margin: 'widthMarginMm', proposed: 'proposedWidthMm', recorded: 'widthMm' },
] as const

/** Os mesmos tetos do CHECK da coluna: recusar aqui devolve 400, e não o 500 da constraint. */
const measurementSchema = z
  .object({
    camera: cameraMeasurementSchema.optional(),
    grossWeightGrams: z.number().int().positive().max(2_000_000).nullable().default(null),
    heightMm: z.number().int().positive().max(3000),
    lengthMm: z.number().int().positive().max(6000),
    /** D8 revista: `typed` é o padrão retrocompatível — o corpo antigo, sem `source`, grava `typed`. */
    source: z.enum(PACKAGE_BOX_MEASUREMENT_SOURCES).default('typed'),
    unitsPerBox: z.number().int().positive().max(10_000).default(1),
    widthMm: z.number().int().positive().max(3000),
  })
  .strict()
  /**
   * R5: `camera` só existe com `source` diferente de `typed`. Margem acima de 30 mm proposta pela
   * câmera (D6, a câmera nunca propõe o que não consegue ler com confiança) recusa para QUALQUER
   * origem que carregue bloco `camera` — inclusive `camera_adjusted` (T14 item 3, revisão de
   * segurança): o operador pode ter editado o *valor*, mas a *proposta* continua tão imprecisa
   * quanto a câmera relatou, e a margem gravada é da proposta, nunca do dígito por cima (D17).
   *
   * Já a confirmação explícita acima de 10 mm (D6/D15) é sobre o *valor gravado*, então ela é
   * dispensada **só na dimensão que o operador editou** — nunca nas três de uma vez porque uma
   * delas mudou (T14 item M1). Dimensão editada é a que tem `proposed<Dim>Mm` diferente do valor
   * gravado; `source: camera` nunca edita nada, e por isso as três contam sempre.
   */
  .superRefine((value, ctx) => {
    if (value.source === 'typed') {
      if (value.camera !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'camera requires a non-typed source' })
      }
      return
    }
    const camera = value.camera
    if (camera === undefined) {
      ctx.addIssue({ code: 'custom', message: 'a non-typed source requires the camera block' })
      return
    }

    /**
     * T14 item M2: bloco sem margem nenhuma não é margem zero. `camera` puro é leitura direta da
     * câmera — sem a incerteza declarada, a medida mais duvidosa entraria como a mais confiável.
     */
    if (value.source === 'camera' && resolveMeasurementMargin(camera) === null) {
      ctx.addIssue({ code: 'custom', message: 'a camera measurement requires at least one margin' })
    }

    if ((resolveMeasurementMargin(camera) ?? 0) > MARGIN_UNRELIABLE_MM) {
      ctx.addIssue({
        code: 'custom',
        message: 'the camera cannot propose an unreliable measurement',
      })
    }

    const uneditedMargins = CAMERA_DIMENSIONS.filter(
      (dimension) =>
        value.source === 'camera' || camera[dimension.proposed] === value[dimension.recorded],
    ).map((dimension) => camera[dimension.margin] ?? 0)

    if (Math.max(0, ...uneditedMargins) > MARGIN_RELIABLE_MM && !camera.impreciseConfirmed) {
      ctx.addIssue({ code: 'custom', message: 'an imprecise measurement requires confirmation' })
    }
  })

export function parsePackageBoxMeasurement(body: unknown): PackageBoxMeasurement {
  const parsed = measurementSchema.safeParse(body)
  if (!parsed.success) throw invalidRequest()
  return parsed.data
}

export type PackageBoxListInput = {
  readonly filters: {
    readonly gtin?: string
    readonly status?: PackageBoxStatusFilter
    readonly scanned?: string
    readonly search?: string
  }
  readonly limit: number
}

/** A fila abre no que falta medir; `status` é o operador pedindo para conferir o já medido. */
export function parsePackageBoxList(url: URL): PackageBoxListInput {
  const limit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw invalidRequest()

  const search = url.searchParams.get('search')?.trim()
  const scanned = url.searchParams.get('scanned')?.trim()
  const status = url.searchParams.get('status')
  /** Situação desconhecida é recusa, não silêncio: senão a tela pediria uma coisa e receberia outra. */
  if (status !== null && !isStatusFilter(status)) throw invalidRequest()

  return {
    filters: {
      status: status ?? 'pending',
      ...(search ? { search } : {}),
      ...(scanned ? { scanned } : {}),
    },
    limit,
  }
}

function isStatusFilter(value: string): value is PackageBoxStatusFilter {
  return PACKAGE_BOX_STATUS_FILTERS.some((filter) => filter === value)
}
