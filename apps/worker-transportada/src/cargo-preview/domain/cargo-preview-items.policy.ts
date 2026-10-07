/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4/RF5: o resultado do leitor vira as linhas da prévia. Linha boa nasce `awaiting_xml`
 * (o XML chega horas depois); linha recusada vira `invalid` com coluna e motivo — nunca o valor da
 * célula. O dia planejado é o `RoutingDate` mais frequente.
 */
import { z } from 'zod'

import type {
  CargoPreviewColumnMap,
  ParseCargoPreviewWorkbookResult,
} from '../../cargo-receiving/domain/cargo-preview-workbook.types.js'
import { PREVIEW_ITEM_FIELDS } from '../../cargo-receiving/domain/contractor-receiving-profile.constant.js'
import { CARGO_PREVIEW_ITEM_STATE } from '../../shared/cargo-preview.constant.js'

export type NewPreviewItem = {
  readonly address: string | null
  readonly city: string | null
  readonly contractorReference: string | null
  readonly matchState:
    | typeof CARGO_PREVIEW_ITEM_STATE.awaitingXml
    | typeof CARGO_PREVIEW_ITEM_STATE.invalid
  readonly neighborhood: string | null
  readonly postalCode: string | null
  readonly recipientCode: string | null
  readonly recipientName: string | null
  readonly routeName: string | null
  readonly routingDate: string | null
  readonly rowError: readonly { column: string; field: string; message: string }[] | null
  readonly rowNumber: number
  readonly state: string | null
  readonly value: string | null
  readonly volumeM3: string | null
  readonly weightKg: string | null
}

export type PreviewItemsPlan = {
  readonly items: readonly NewPreviewItem[]
  readonly plannedDate: string | null
  readonly rowCount: number
}

const columnMapSchema = z.partialRecord(z.enum(PREVIEW_ITEM_FIELDS), z.string().min(1).max(80))

/** O mapa vem do jsonb do perfil; inválido é "sem leitor", como mapa ausente. */
export function readColumnMap(value: unknown): CargoPreviewColumnMap | undefined {
  const parsed = columnMapSchema.safeParse(value)
  return parsed.success && Object.keys(parsed.data).length > 0 ? parsed.data : undefined
}

/** Empate de frequência vai para a data mais cedo: determinístico, e a prévia é de um dia só. */
function mostFrequentDate(dates: readonly (string | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const date of dates) if (date !== undefined) counts.set(date, (counts.get(date) ?? 0) + 1)
  const ranked = [...counts.entries()].sort(([leftDate, left], [rightDate, right]) =>
    right === left ? (leftDate < rightDate ? -1 : 1) : right - left,
  )
  return ranked[0]?.[0] ?? null
}

const EMPTY_FIELDS = {
  address: null,
  city: null,
  contractorReference: null,
  neighborhood: null,
  postalCode: null,
  recipientCode: null,
  recipientName: null,
  routeName: null,
  routingDate: null,
  state: null,
  value: null,
  volumeM3: null,
  weightKg: null,
} as const

export function planPreviewItems(result: ParseCargoPreviewWorkbookResult): PreviewItemsPlan {
  const valid: NewPreviewItem[] = result.rows.map((row) => ({
    address: row.address ?? null,
    city: row.city ?? null,
    contractorReference: row.contractorReference ?? null,
    matchState: CARGO_PREVIEW_ITEM_STATE.awaitingXml,
    neighborhood: row.neighborhood ?? null,
    postalCode: row.postalCode ?? null,
    recipientCode: row.recipientCode ?? null,
    recipientName: row.recipientName ?? null,
    routeName: row.routeName,
    routingDate: row.routingDate ?? null,
    rowError: null,
    rowNumber: row.rowNumber,
    state: row.state ?? null,
    value: row.value,
    volumeM3: row.volumeM3 ?? null,
    weightKg: row.weightKg,
  }))
  const errorsByRow = new Map<number, { column: string; field: string; message: string }[]>()
  for (const error of result.rowErrors) {
    const entry = { column: error.column, field: error.field, message: error.message }
    errorsByRow.set(error.rowNumber, [...(errorsByRow.get(error.rowNumber) ?? []), entry])
  }
  const invalid: NewPreviewItem[] = [...errorsByRow.entries()].map(([rowNumber, rowError]) => ({
    ...EMPTY_FIELDS,
    matchState: CARGO_PREVIEW_ITEM_STATE.invalid,
    rowError,
    rowNumber,
  }))
  const items = [...valid, ...invalid].sort((left, right) => left.rowNumber - right.rowNumber)
  return {
    items,
    plannedDate: mostFrequentDate(result.rows.map((row) => row.routingDate)),
    rowCount: items.length,
  }
}
