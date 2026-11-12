/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  deriveRowFlags,
  type AccessKeyLookupRow,
} from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'

import type { ScannedNfeDocument } from './trip.types'

/** `failed` é a consulta do cadastro da nota que não voltou: a linha pede nova tentativa, não some. */
export type BippedNoteDocument = ScannedNfeDocument | 'failed'

export type BippedNoteBlocker = 'alreadyOnTrip' | 'notAuthorized'

export type BippedNote = Readonly<{
  /** Só existe quando a linha pode ser acrescentada agora. */
  addableDocument?: ScannedNfeDocument
  blocker?: BippedNoteBlocker
  document?: BippedNoteDocument
  /** Só no acréscimo a viagem que já saiu: a nota está em outra viagem e vem de lá ao acrescentar. */
  movesFromTrip?: true
  row: AccessKeyLookupRow
}>

/** O mesmo veredito de `stageQuickCreateDocuments`: nota em outra viagem ou não autorizada não entra. */
export function resolveBippedNoteBlocker(
  document: ScannedNfeDocument,
  options: Readonly<{ allowOtherTrip?: boolean }> = {},
): BippedNoteBlocker | undefined {
  if (document.tripId !== null && options.allowOtherTrip !== true) return 'alreadyOnTrip'
  if (document.status !== 'authorized') return 'notAuthorized'
  return undefined
}

/**
 * A linha acrescentada sai da lista, como a nota escolhida na busca: ela passa a viver na fila da
 * viagem e volta aqui se for retirada de lá.
 */
export function buildBippedNotes(
  input: Readonly<{
    documents: ReadonlyMap<string, BippedNoteDocument>
    rows: readonly AccessKeyLookupRow[]
    stagedDocumentIds: readonly string[]
    /** Viagem que já saiu: a nota de outra viagem é oferecida, com aviso de que sai de lá. */
    allowOtherTrip?: boolean
  }>,
): readonly BippedNote[] {
  const staged = new Set(input.stagedDocumentIds)
  const notes: BippedNote[] = []
  for (const row of input.rows) {
    const document = input.documents.get(row.accessKey)
    if (document !== undefined && document !== 'failed' && staged.has(document.id)) continue
    if (!deriveRowFlags(row.state).canAdd || document === undefined || document === 'failed') {
      notes.push({ ...(document === undefined ? {} : { document }), row })
      continue
    }
    const blocker = resolveBippedNoteBlocker(document, {
      ...(input.allowOtherTrip === undefined ? {} : { allowOtherTrip: input.allowOtherTrip }),
    })
    if (blocker !== undefined) notes.push({ blocker, document, row })
    else if (document.tripId !== null) {
      notes.push({ addableDocument: document, document, movesFromTrip: true, row })
    } else notes.push({ addableDocument: document, document, row })
  }
  return notes
}

export function listAddableDocuments(notes: readonly BippedNote[]): readonly ScannedNfeDocument[] {
  return notes.flatMap((note) => (note.addableDocument === undefined ? [] : [note.addableDocument]))
}

/** A nota bipada já tem linha própria: a busca não a oferece de novo. */
export function listBippedDocumentIds(rows: readonly AccessKeyLookupRow[]): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const row of rows) if (row.state.kind === 'ready') ids.add(row.state.documentId)
  return ids
}

/** A busca só oferece a nota que não tem linha bipada: criação e detalhe usam o mesmo corte. */
export function excludeBippedDocuments<TDocument extends { readonly id: string }>(
  documents: readonly TDocument[],
  rows: readonly AccessKeyLookupRow[],
): readonly TDocument[] {
  const bippedIds = listBippedDocumentIds(rows)
  return documents.filter((document) => !bippedIds.has(document.id))
}
