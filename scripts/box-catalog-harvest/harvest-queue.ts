/**
 * Copyright (c) 2026 Anderson — Ada Technology. Licença: proprietária.
 *
 * Fila de GTINs pendentes (produção, READ ONLY) e o JSONL local da captura assistida.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { SQL } from 'bun'

export const OUTPUT_PATH =
  process.env.HARVEST_OUTPUT_PATH ??
  `${process.env.HOME}/Library/Application Support/transportada/box-catalog-harvest.jsonl`

export type PendingGtin = {
  readonly cartonGtin: string
  readonly unitGtin: string
  readonly pendingBoxes: number
}

export type CaptureRecord = {
  readonly cartonGtin: string
  readonly unitGtin: string
  readonly status: string
  readonly source: string
  readonly capturedAt: string
  readonly pageUrl: string
  readonly extracted?: Record<string, unknown>
  readonly snippet?: string
}

/** GTIN-14 com indicador 1–8 é a caixa; a página do Cosmos é a do GTIN-13 da unidade. */
export function deriveUnitGtin(cartonGtin: string): string {
  if (cartonGtin.length !== 14) return cartonGtin
  if (cartonGtin.startsWith('0')) return cartonGtin.slice(1)
  const body = cartonGtin.slice(1, 13)
  const sum = [...body].reduce((total, digit, index) => {
    return total + Number(digit) * (index % 2 === 0 ? 1 : 3)
  }, 0)
  return `${body}${(10 - (sum % 10)) % 10}`
}

export async function readCapturedGtins(): Promise<Set<string>> {
  const content = await readFile(OUTPUT_PATH, 'utf8').catch(() => '')
  const records = content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CaptureRecord)
  return new Set(records.map((record) => record.cartonGtin))
}

export async function appendCaptureRecord(record: CaptureRecord): Promise<void> {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await appendFile(OUTPUT_PATH, `${JSON.stringify(record)}\n`)
}

type PendingRow = { readonly carton_gtin: string; readonly pending_boxes: number }

export const PENDING_QUERY = `select carton_gtin, count(*)::int as pending_boxes
  from nfe_package_boxes
 where carton_gtin is not null and length_mm is null
 group by carton_gtin
 order by pending_boxes desc`

function toPendingGtins(rows: readonly PendingRow[]): PendingGtin[] {
  return rows
    .filter((row) => /^\d{8,14}$/.test(row.carton_gtin))
    .map((row) => ({
      cartonGtin: row.carton_gtin,
      unitGtin: deriveUnitGtin(row.carton_gtin),
      pendingBoxes: row.pending_boxes,
    }))
}

/** Produção não tem proxy público: a fila vem exportada por `railway ssh` (ver README). */
export async function readPendingGtinsFromFile(path: string): Promise<PendingGtin[]> {
  return toPendingGtins(JSON.parse(await readFile(path, 'utf8')) as PendingRow[])
}

export async function selectPendingGtins(databaseUrl: string): Promise<PendingGtin[]> {
  const database = new SQL(databaseUrl)
  try {
    const rows = await database.begin('read only', (transaction) =>
      transaction.unsafe(PENDING_QUERY),
    )
    return toPendingGtins(rows as PendingRow[])
  } finally {
    await database.close()
  }
}
