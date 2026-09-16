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
   * R5: `camera` só existe com `source` diferente de `typed`. As duas regras de margem são **por
   * dimensão**, e rodam sobre o mesmo conjunto: as dimensões que o operador NÃO digitou por cima.
   *
   * - acima de 30 mm (D6): a câmera nunca propõe o que não consegue ler com confiança, então um
   *   bloco que afirma ter proposto isso é recusado. A dimensão digitada por cima é isenta, porque
   *   ali a câmera não propôs nada (spec.md:383-385) — aplicar o teto sobre o máximo das três
   *   recusava o caminho D6 inteiro (2ª revisão de código);
   * - acima de 10 mm (D6/D15): grava só com confirmação explícita, e a dispensa vale **só na
   *   dimensão editada** — nunca nas três de uma vez porque uma delas mudou (T14 item M1).
   *
   * `source: camera` nunca edita nada, e por isso as três contam sempre.
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
     * A **mesma** conta que grava `measurement_margin_mm` (D17): a maior margem entre as dimensões
     * não editadas. Duas definições de "dimensão editada" era o defeito da 3ª revisão; agora existe
     * uma só, no domínio.
     */
    const worstUneditedMargin = resolveMeasurementMargin({
      camera,
      recorded: value,
      source: value.source,
    })

    /**
     * T14 item M2: bloco sem margem nenhuma não é margem zero. `camera` puro é leitura direta da
     * câmera — sem a incerteza declarada, a medida mais duvidosa entraria como a mais confiável.
     */
    if (value.source === 'camera' && worstUneditedMargin === null) {
      ctx.addIssue({ code: 'custom', message: 'a camera measurement requires at least one margin' })
    }

    if (worstUneditedMargin === null) return

    if (worstUneditedMargin > MARGIN_UNRELIABLE_MM) {
      ctx.addIssue({
        code: 'custom',
        message: 'the camera cannot propose an unreliable measurement',
      })
    }

    if (worstUneditedMargin > MARGIN_RELIABLE_MM && !camera.impreciseConfirmed) {
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
