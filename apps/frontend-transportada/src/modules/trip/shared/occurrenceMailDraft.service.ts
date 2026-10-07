/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF4, RF5): o rascunho dos três textos do e-mail à contratante — o que a tela confere antes
 * de o servidor conferir (marcador desconhecido, no próprio campo) e a inserção do marcador no cursor.
 */
import {
  OCCURRENCE_MAIL_CONTEXT,
  OCCURRENCE_MAIL_MARKERS,
  type OccurrenceMailContext,
} from './occurrenceMailTemplate.constant'

export type OccurrenceMailDraft = Readonly<{
  emailBody: string
  emailItemLineTemplate: string
  emailSubject: string
}>

/** O corpo de `POST /company-settings/occurrence-types/email-preview` e o que ele devolve. */
export type OccurrenceMailPreviewInput = OccurrenceMailDraft

export type OccurrenceMailPreview = Readonly<{ body: string; subject: string }>

/** Qual dos três textos do rascunho é o de cada campo. */
export const OCCURRENCE_MAIL_DRAFT_KEY = {
  [OCCURRENCE_MAIL_CONTEXT.body]: 'emailBody',
  [OCCURRENCE_MAIL_CONTEXT.itemLine]: 'emailItemLineTemplate',
  [OCCURRENCE_MAIL_CONTEXT.subject]: 'emailSubject',
} as const satisfies Record<OccurrenceMailContext, keyof OccurrenceMailDraft>

export type OccurrenceMailProblems = Readonly<Record<OccurrenceMailContext, readonly string[]>>

/** O mesmo recorte do servidor: só `{{palavra}}` de letras vira marcador; o resto é texto. */
const MARKER_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/gu

export function findUnknownMarkers(
  input: Readonly<{ context: OccurrenceMailContext; text: string }>,
): readonly string[] {
  const known = new Set(OCCURRENCE_MAIL_MARKERS[input.context])
  const unknown = [...input.text.matchAll(MARKER_PATTERN)]
    .map((match) => match[1] ?? '')
    .filter((name) => !known.has(name))
  return [...new Set(unknown)]
}

export function readOccurrenceMailProblems(draft: OccurrenceMailDraft): OccurrenceMailProblems {
  const problemsOf = (context: OccurrenceMailContext) =>
    findUnknownMarkers({ context, text: draft[OCCURRENCE_MAIL_DRAFT_KEY[context]] })
  return {
    [OCCURRENCE_MAIL_CONTEXT.body]: problemsOf(OCCURRENCE_MAIL_CONTEXT.body),
    [OCCURRENCE_MAIL_CONTEXT.itemLine]: problemsOf(OCCURRENCE_MAIL_CONTEXT.itemLine),
    [OCCURRENCE_MAIL_CONTEXT.subject]: problemsOf(OCCURRENCE_MAIL_CONTEXT.subject),
  }
}

export function hasOccurrenceMailProblems(problems: OccurrenceMailProblems): boolean {
  return Object.values(problems).some((names) => names.length > 0)
}

export function isOccurrenceMailDraftChanged(
  draft: OccurrenceMailDraft,
  saved: OccurrenceMailDraft,
): boolean {
  return (
    draft.emailBody !== saved.emailBody ||
    draft.emailItemLineTemplate !== saved.emailItemLineTemplate ||
    draft.emailSubject !== saved.emailSubject
  )
}

/** O marcador entra no lugar da seleção (ou no cursor) e o cursor termina logo depois dele. */
export function insertOccurrenceMailMarker(
  input: Readonly<{ end: number; marker: string; start: number; text: string }>,
): Readonly<{ caret: number; text: string }> {
  const token = `{{${input.marker}}}`
  return {
    caret: input.start + token.length,
    text: `${input.text.slice(0, input.start)}${token}${input.text.slice(input.end)}`,
  }
}
