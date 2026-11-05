/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 294 RF26: a mesma imagem já tinha chegado nesta nota — nada foi gravado de novo. */
export type CanhotoDuplicateNotice = Readonly<{
  /** Quando o canhoto chegou (ISO), para a frase "chegou às HH:MM". */
  attachedAt: string
  documentId: string
}>

export function collectCanhotoDuplicateNotices(
  attachmentsSent: readonly Readonly<{
    documentId: string
    duplicate?: Readonly<{ attachedAt: string }>
  }>[],
): readonly CanhotoDuplicateNotice[] {
  return attachmentsSent.flatMap((item) =>
    item.duplicate === undefined
      ? []
      : [{ attachedAt: item.duplicate.attachedAt, documentId: item.documentId }],
  )
}

export function appendCanhotoDuplicateNotices(
  current: readonly CanhotoDuplicateNotice[],
  additions: readonly CanhotoDuplicateNotice[],
): readonly CanhotoDuplicateNotice[] {
  const known = new Set(current.map((notice) => notice.documentId))
  return [...current, ...additions.filter((notice) => !known.has(notice.documentId))]
}

export function dismissCanhotoDuplicateNotice(
  current: readonly CanhotoDuplicateNotice[],
  documentId: string,
): readonly CanhotoDuplicateNotice[] {
  return current.filter((notice) => notice.documentId !== documentId)
}
