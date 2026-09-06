/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { invalidRequest } from '../../http/request-parsing.service.js'
import {
  PACKAGE_BOX_STATUS_FILTERS,
  type PackageBoxMeasurement,
  type PackageBoxStatusFilter,
} from '../application/package-box.port.js'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Os mesmos tetos do CHECK da coluna: recusar aqui devolve 400, e não o 500 da constraint. */
const measurementSchema = z
  .object({
    grossWeightGrams: z.number().int().positive().max(2_000_000).nullable().default(null),
    heightMm: z.number().int().positive().max(3000),
    lengthMm: z.number().int().positive().max(6000),
    unitsPerBox: z.number().int().positive().max(10_000).default(1),
    widthMm: z.number().int().positive().max(3000),
  })
  .strict()

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
