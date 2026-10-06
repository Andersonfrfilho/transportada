/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CARGO_PREVIEW_WORKBOOK_LIMITS } from './cargo-preview-workbook.constant.js'
import type { PreviewItemField } from './contractor-receiving-profile.constant.js'

export type CargoPreviewWorkbookLimits = {
  readonly [Limit in keyof typeof CARGO_PREVIEW_WORKBOOK_LIMITS]: number
}

/** Relógio monotônico em milissegundos — injetado, para o domínio não ler hora. */
export type MonotonicClock = () => number

/** Campo de item → nome da coluna no cabeçalho (ADR-0094 §2): nunca posição. */
export type CargoPreviewColumnMap = Readonly<Partial<Record<PreviewItemField, string>>>

export type ParseCargoPreviewWorkbookParams = {
  readonly bytes: Uint8Array
  readonly clock: MonotonicClock
  readonly columnMap: CargoPreviewColumnMap
  readonly limits?: CargoPreviewWorkbookLimits
  /** Nulo = a primeira aba. */
  readonly sheetName: string | null
}

/** Decimais em texto (`value` com 2 casas, `weightKg` com 3, `volumeM3` com 4) — nunca float. */
export type CargoPreviewRow = {
  readonly address: string | undefined
  readonly city: string | undefined
  readonly contractorReference: string | undefined
  readonly neighborhood: string | undefined
  readonly postalCode: string | undefined
  readonly recipientCode: string | undefined
  readonly recipientName: string | undefined
  readonly routeName: string
  readonly routingDate: string | undefined
  readonly rowNumber: number
  readonly state: string | undefined
  readonly value: string
  readonly volumeM3: string | undefined
  readonly weightKg: string
}

export type CargoPreviewRowError = {
  readonly column: string
  readonly field: PreviewItemField
  readonly message: string
  readonly rowNumber: number
}

export type ParseCargoPreviewWorkbookResult = {
  readonly rowErrors: readonly CargoPreviewRowError[]
  readonly rows: readonly CargoPreviewRow[]
}

/** `isNumeric`: célula numérica do Excel (aceita expoente); texto só aceita decimal simples. */
export type SheetCell = { readonly isNumeric: boolean; readonly text: string }

/** Uma linha da aba: coluna (letra) → célula, já resolvida e sem célula de erro. */
export type SheetRow = {
  readonly cells: ReadonlyMap<string, SheetCell>
  readonly rowNumber: number
}

export type ParseBudget = { readonly check: () => void }
