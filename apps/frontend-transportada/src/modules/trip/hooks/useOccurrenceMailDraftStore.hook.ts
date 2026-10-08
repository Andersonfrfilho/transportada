/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext } from 'react'

import type { OccurrenceMailDraft } from '../shared/occurrenceMailDraft.service'

export type OccurrenceMailDraftStore = Readonly<{
  discard: (typeId: string) => void
  read: (typeId: string) => OccurrenceMailDraft | undefined
  write: (typeId: string, draft: OccurrenceMailDraft) => void
}>

/** Fora de um provedor o rascunho vive só no componente, como antes. */
const NO_STORE: OccurrenceMailDraftStore = {
  discard: () => undefined,
  read: () => undefined,
  write: () => undefined,
}

export const OccurrenceMailDraftStoreContext = createContext<OccurrenceMailDraftStore>(NO_STORE)

/**
 * Spec 247 T7.2 (B1): os rascunhos do e-mail à contratante, por tipo, enquanto a página está montada. A linha do
 * tipo é um acordeão que desmonta o conteúdo ao recolher; sem isto o assunto/corpo/linha digitados sumiam sem aviso.
 */
export function createOccurrenceMailDraftStore(): OccurrenceMailDraftStore {
  const drafts = new Map<string, OccurrenceMailDraft>()
  return {
    discard: (typeId) => void drafts.delete(typeId),
    read: (typeId) => drafts.get(typeId),
    write: (typeId, draft) => void drafts.set(typeId, draft),
  }
}

export function useOccurrenceMailDraftStore(): OccurrenceMailDraftStore {
  return useContext(OccurrenceMailDraftStoreContext)
}
