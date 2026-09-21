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

export async function selectPendingGtins(databaseUrl: string): Promise<PendingGtin[]> {
  const database = new SQL(databaseUrl)
  try {
    return await database.begin('read only', async (transaction) => {
      const rows = await transaction`
        select carton_gtin, count(*)::int as pending_boxes
          from nfe_package_boxes
         where carton_gtin is not null and length_mm is null
         group by carton_gtin
         order by pending_boxes desc`
      return rows.map((row: { carton_gtin: string; pending_boxes: number }) => ({
        cartonGtin: row.carton_gtin,
        unitGtin: deriveUnitGtin(row.carton_gtin),
        pendingBoxes: row.pending_boxes,
      }))
    })
  } finally {
    await database.close()
  }
}
