/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A miniatura do canhoto que o servidor **já aceitou**, guardada no aparelho (pedido do usuário,
 * 01/10: "a foto quando já enviada deve ficar em miniatura"). O anexo sai da fila com a drenagem e
 * leva o original junto — sem este arquivo a tela só tem uma frase para mostrar no lugar da foto.
 *
 * O que fica aqui é a miniatura que a spec 220 já gera no cliente (teto de 128 KiB), nunca o
 * original. E ela segue o regime do snapshot da viagem, porque é o mesmo tipo de dado num celular
 * que troca de mão: tem **dono** (`subHash`), **prazo** (24 h) e sai no "Sair".
 */
export const PROOF_THUMBNAIL_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type StoredProofThumbnail = Readonly<{
  blob: Blob
  savedAt: string
  subHash: string
}>

export type ProofThumbnailStore = Readonly<{
  clear: () => Promise<void>
  read: (documentId: string) => Promise<StoredProofThumbnail | undefined>
  remove: (documentId: string) => Promise<void>
  /** Apaga a miniatura de todo outro dono — o claim do snapshot chama na troca de `sub`. */
  retainOnly: (subHash: string) => Promise<void>
  write: (input: {
    readonly documentId: string
    readonly record: StoredProofThumbnail
  }) => Promise<void>
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** O IndexedDB devolve `unknown`: o que não tem a forma do registro não vira imagem na tela. */
export function isStoredProofThumbnail(value: unknown): value is StoredProofThumbnail {
  if (!isRecord(value)) return false
  if (typeof value.savedAt !== 'string' || typeof value.subHash !== 'string') return false
  return value.blob instanceof Blob
}

export function isProofThumbnailUsable(input: {
  readonly now: Date
  readonly stored: StoredProofThumbnail
  readonly subHash: string
}): boolean {
  if (input.stored.subHash !== input.subHash) return false
  const savedAt = Date.parse(input.stored.savedAt)
  if (!Number.isFinite(savedAt)) return false
  return input.now.getTime() - savedAt <= PROOF_THUMBNAIL_MAX_AGE_MS
}

/** A drenagem confirmou o anexo: a miniatura fica para a tela mostrar o que o servidor tem. */
export async function saveProofThumbnail(input: {
  readonly blob: Blob
  readonly documentId: string
  readonly now: Date
  readonly store: ProofThumbnailStore
  readonly subHash: string
}): Promise<void> {
  await input.store.write({
    documentId: input.documentId,
    record: {
      blob: input.blob,
      savedAt: input.now.toISOString(),
      subHash: input.subHash,
    },
  })
}

/** A miniatura desta nota, se for deste motorista e ainda valer. A vencida sai aqui. */
export async function readProofThumbnail(input: {
  readonly documentId: string
  readonly now: Date
  readonly store: ProofThumbnailStore
  readonly subHash: string
}): Promise<Blob | undefined> {
  const stored = await input.store.read(input.documentId)
  if (stored === undefined) return undefined
  if (!isProofThumbnailUsable({ now: input.now, stored, subHash: input.subHash })) {
    await input.store.remove(input.documentId)
    return undefined
  }

  return stored.blob
}

/** "Sair": nada da viagem fica no aparelho — a foto do canhoto menos ainda. */
export async function discardProofThumbnails(input: {
  readonly store: ProofThumbnailStore
}): Promise<void> {
  await input.store.clear()
}
