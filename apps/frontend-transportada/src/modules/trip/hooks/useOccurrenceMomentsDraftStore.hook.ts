import { createContext, useContext } from 'react'

import type { OccurrenceMoment } from '../shared/occurrence.constant'

export type OccurrenceMomentsDraftStore = Readonly<{
  discard: (typeId: string) => void
  read: (typeId: string) => readonly OccurrenceMoment[] | undefined
  write: (typeId: string, draft: readonly OccurrenceMoment[]) => void
}>

/** Fora de um provedor o rascunho vive só no componente, como antes. */
const NO_STORE: OccurrenceMomentsDraftStore = {
  discard: () => undefined,
  read: () => undefined,
  write: () => undefined,
}

export const OccurrenceMomentsDraftStoreContext =
  createContext<OccurrenceMomentsDraftStore>(NO_STORE)

/**
 * Spec 247 T7.6 (D3): o rascunho dos momentos, por tipo, enquanto a página está montada. A linha do tipo
 * desmonta o conteúdo ao recolher; sem isto a mudança ainda não aplicada sumia sem aviso.
 */
export function createOccurrenceMomentsDraftStore(): OccurrenceMomentsDraftStore {
  const drafts = new Map<string, readonly OccurrenceMoment[]>()
  return {
    discard: (typeId) => void drafts.delete(typeId),
    read: (typeId) => drafts.get(typeId),
    write: (typeId, draft) => void drafts.set(typeId, draft),
  }
}

export function useOccurrenceMomentsDraftStore(): OccurrenceMomentsDraftStore {
  return useContext(OccurrenceMomentsDraftStoreContext)
}
