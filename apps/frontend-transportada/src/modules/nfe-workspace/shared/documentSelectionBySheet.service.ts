/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { NfeDocumentListItem } from './nfeWorkspaceClient.service'

export type SheetSelection = Readonly<{
  /** Notas da planilha que o sistema tem, mas que não podem emitir (bloqueio fiscal). */
  blockedNumbers: readonly number[]
  /** Notas da planilha que ainda não existem no sistema. */
  missingNumbers: readonly number[]
  selectedIds: readonly string[]
  /** Quantas notas distintas a planilha trouxe. */
  sheetCount: number
}>

/**
 * Cruza os números da planilha com as notas carregadas. O que a planilha não cita nunca entra na
 * seleção, e o que ela cita sem nota no sistema vira aviso — nada é emitido às cegas.
 */
export function selectDocumentsBySheet(input: {
  readonly documents: readonly NfeDocumentListItem[]
  readonly isBlocked: (document: NfeDocumentListItem) => boolean
  readonly sheetNumbers: readonly number[]
}): SheetSelection {
  const wanted = [...new Set(input.sheetNumbers)]
  const byNumber = new Map<number, NfeDocumentListItem>()
  for (const document of input.documents) {
    const number = Number(document.number)
    if (Number.isInteger(number) && !byNumber.has(number)) byNumber.set(number, document)
  }
  const selectedIds: string[] = []
  const blockedNumbers: number[] = []
  const missingNumbers: number[] = []
  for (const number of wanted) {
    const document = byNumber.get(number)
    if (document === undefined) missingNumbers.push(number)
    else if (input.isBlocked(document)) blockedNumbers.push(number)
    else selectedIds.push(document.id)
  }
  return { blockedNumbers, missingNumbers, selectedIds, sheetCount: wanted.length }
}
