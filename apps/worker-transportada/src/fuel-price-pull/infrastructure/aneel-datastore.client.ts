/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Fronteira com o datastore CKAN da ANEEL. `datastore_search_sql` responde **400** nesta instância
 * — medido em 21/08/2026 —, então o recorte vai como `filters` (casamento exato) e a agregação é
 * nossa. Página recusada aborta a coleta inteira: meia série gravada seria tarifa faltando para
 * metade das distribuidoras, e a tela mostraria preço sem dizer que está incompleto.
 */
import { z } from 'zod'

import type { EnergyTariffSeriesPort } from '../application/energy-series.port.js'
import {
  ANEEL_TARIFF_FIELDS,
  ANEEL_TARIFF_PAGE_LIMIT,
  ANEEL_TARIFF_PAGE_SIZE,
  ANEEL_TARIFF_RECORTE,
  ANEEL_TARIFF_RESOURCE_ID,
} from '../domain/aneel-tariff.constant.js'
import { type AneelTariffRow, selectCurrentTariffs } from '../domain/aneel-tariff.policy.js'

const DATASTORE_PATH = '/api/3/action/datastore_search'

const datastoreResponseSchema = z.object({
  result: z.object({
    records: z.array(z.record(z.string(), z.unknown())),
    total: z.coerce.number().int().nonnegative(),
  }),
  success: z.literal(true),
})

export type AneelDatastoreFetch = (url: string, init: RequestInit) => Promise<Response>

function toRow(record: Record<string, unknown>): AneelTariffRow {
  const row: Record<string, string | undefined> = {}

  for (const field of ANEEL_TARIFF_FIELDS) {
    const value = record[field]
    row[field] = typeof value === 'string' ? value : undefined
  }

  return row
}

async function readPage(input: {
  readonly fetch: AneelDatastoreFetch
  readonly timeoutInMilliseconds: number
  readonly url: string
}): Promise<{ readonly rows: readonly AneelTariffRow[]; readonly total: number }> {
  const response = await input.fetch(input.url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(input.timeoutInMilliseconds),
  })

  if (!response.ok) {
    throw new Error('ANEEL_TARIFF_UNAVAILABLE')
  }

  const parsed = datastoreResponseSchema.safeParse(await response.json().catch(() => undefined))

  if (!parsed.success) {
    throw new Error('ANEEL_MALFORMED_RESPONSE')
  }

  return { rows: parsed.data.result.records.map(toRow), total: parsed.data.result.total }
}

function buildPageUrl(input: { readonly base: string; readonly offset: number }): string {
  const url = new URL(`${input.base}${DATASTORE_PATH}`)

  url.searchParams.set('resource_id', ANEEL_TARIFF_RESOURCE_ID)
  url.searchParams.set('filters', JSON.stringify(ANEEL_TARIFF_RECORTE))
  url.searchParams.set('fields', ANEEL_TARIFF_FIELDS.join(','))
  url.searchParams.set('limit', String(ANEEL_TARIFF_PAGE_SIZE))
  url.searchParams.set('offset', String(input.offset))

  return url.toString()
}

export function createAneelDatastoreClient(dependencies: {
  readonly baseUrl: string
  readonly fetch: AneelDatastoreFetch
  readonly timeoutInMilliseconds: number
}): EnergyTariffSeriesPort {
  const base = dependencies.baseUrl.replace(/\/+$/, '')

  return {
    async fetchCurrentTariffs(input) {
      const rows: AneelTariffRow[] = []
      let total = 0

      for (let page = 0; page < ANEEL_TARIFF_PAGE_LIMIT; page += 1) {
        const offset = page * ANEEL_TARIFF_PAGE_SIZE
        const read = await readPage({
          fetch: dependencies.fetch,
          timeoutInMilliseconds: dependencies.timeoutInMilliseconds,
          url: buildPageUrl({ base, offset }),
        })

        rows.push(...read.rows)
        total = read.total

        if (read.rows.length === 0 || rows.length >= total) {
          break
        }
      }

      return selectCurrentTariffs({ onDay: input.onDay, rows })
    },
  }
}
