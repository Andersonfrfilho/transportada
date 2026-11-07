/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'

/**
 * O que a pessoa digitou na inserção rápida. A chave (44 caracteres, ou o link do QR Code) vai à
 * API; o número de nota é resolvido aqui, sobre as notas que ainda estão livres — as mesmas que a
 * busca oferece, para os dois caminhos concordarem sobre o que é "nota disponível".
 */
export type TypedNoteLookup =
  | Readonly<{ accessKey: string; kind: 'accessKey' }>
  | Readonly<{ kind: 'empty' }>
  | Readonly<{ kind: 'matches'; matches: readonly NfeDocumentListItem[] }>
  | Readonly<{ kind: 'unrecognized' }>

/** `48214`, `048214` e `48214/1` são a mesma nota; a série, quando vem, separa números repetidos. */
const NOTE_NUMBER_PATTERN = /^(\d{1,9})(?:\s*[/-]\s*(\d{1,3}))?$/u

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=\d)/u, '')
}

export function isTypedNoteNumber(text: string): boolean {
  return NOTE_NUMBER_PATTERN.test(text.trim())
}

export function resolveTypedNote(input: {
  readonly documents: readonly NfeDocumentListItem[]
  readonly text: string
}): TypedNoteLookup {
  const text = input.text.trim()
  if (text === '') return { kind: 'empty' }

  const accessKey = extractNfeAccessKey(text)
  if (accessKey !== undefined) return { accessKey, kind: 'accessKey' }

  const parsed = NOTE_NUMBER_PATTERN.exec(text)
  if (parsed === null) return { kind: 'unrecognized' }

  const number = stripLeadingZeros(parsed[1] ?? '')
  const series = parsed[2] === undefined ? undefined : stripLeadingZeros(parsed[2])
  const matches = input.documents.filter(
    (document) =>
      stripLeadingZeros(document.number) === number &&
      (series === undefined || stripLeadingZeros(document.series) === series),
  )

  return { kind: 'matches', matches }
}

/** O que a inserção rápida diz depois de um número que não virou linha. Ausência é "deu certo". */
export type TypedNoteFeedback =
  | Readonly<{ candidates: readonly NfeDocumentListItem[]; kind: 'ambiguous' }>
  | Readonly<{ kind: 'notFound' }>
  | Readonly<{ kind: 'unrecognized' }>
