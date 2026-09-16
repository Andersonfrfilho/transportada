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
   * R5: `camera` só existe com `source` diferente de `typed`; margem acima de 10 mm sem confirmação
   * explícita (D6) e margem acima de 30 mm proposta pela câmera (D6, a câmera nunca propõe o que não
   * consegue ler com confiança) são as duas recusas de imprecisão.
   */
  .superRefine((value, ctx) => {
    if (value.source === 'typed') {
      if (value.camera !== undefined) {
        ctx.addIssue({ code: 'custom', message: 'camera requires a non-typed source' })
      }
      return
    }
    if (value.camera === undefined) {
      ctx.addIssue({ code: 'custom', message: 'a non-typed source requires the camera block' })
      return
    }

    const marginMm = resolveMeasurementMargin(value.camera) ?? 0
    if (marginMm > MARGIN_RELIABLE_MM && !value.camera.impreciseConfirmed) {
      ctx.addIssue({ code: 'custom', message: 'an imprecise measurement requires confirmation' })
    }
    if (value.source === 'camera' && marginMm > MARGIN_UNRELIABLE_MM) {
      ctx.addIssue({
        code: 'custom',
        message: 'the camera cannot propose an unreliable measurement',
      })
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
