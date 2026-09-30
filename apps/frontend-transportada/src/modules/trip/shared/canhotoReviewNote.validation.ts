/* Copyright (c) 2026 Ada Technology. MIT License. */

// Cópia de conveniência da guarda do servidor, que segue sendo a autoridade: a cópia envelhece.
export const CANHOTO_REVIEW_NOTE_MINIMUM_LENGTH = 20
export const CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH = 500

export const CANHOTO_REVIEW_NOTE_ERROR = {
  TOO_SHORT: 'tooShort',
  TOO_LONG: 'tooLong',
  PERSONAL_DATA: 'personalData',
} as const
export type CanhotoReviewNoteError =
  (typeof CANHOTO_REVIEW_NOTE_ERROR)[keyof typeof CANHOTO_REVIEW_NOTE_ERROR]

// Dez dígitos crus caem no padrão de telefone; onze, no de CPF.
const PERSONAL_DATA_PATTERNS: readonly RegExp[] = [
  /[\w.+-]+@[\w-]+\.[\w.-]*\w/u,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/u,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/u,
  /\b\d{5}-\d{3}\b/u,
  /(?<!\d)(?:\+\d{2}\s?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/u,
]

export function validateCanhotoReviewNote(note: string): CanhotoReviewNoteError | undefined {
  if (note.length < CANHOTO_REVIEW_NOTE_MINIMUM_LENGTH) return CANHOTO_REVIEW_NOTE_ERROR.TOO_SHORT
  if (note.length > CANHOTO_REVIEW_NOTE_MAXIMUM_LENGTH) return CANHOTO_REVIEW_NOTE_ERROR.TOO_LONG
  if (PERSONAL_DATA_PATTERNS.some((pattern) => pattern.test(note))) {
    return CANHOTO_REVIEW_NOTE_ERROR.PERSONAL_DATA
  }

  return undefined
}
