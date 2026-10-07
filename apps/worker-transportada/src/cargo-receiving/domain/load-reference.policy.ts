/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (ADR-0094 §2; revisão de segurança da Fase 4a, S3): o `NroCarga` sai do `infCpl`
 * por uma gramática fechada — o texto do perfil, literal, até 5 espaços e 1 a 30 letras ou dígitos.
 * Nenhuma expressão do usuário roda: a busca é linear sobre os primeiros 2 000 caracteres.
 */
import { findArrivalReferenceLabelIssue } from './arrival-reference-label.policy.js'
import { LOAD_REFERENCE_INPUT_MAX_LENGTH } from './cargo-preview-matching.constant.js'

const REGEXP_SYNTAX_CHARACTER = /[\\^$.*+?()[\]{}|/]/gu
const LOAD_REFERENCE_VALUE = '\\s{0,5}([A-Za-z0-9]{1,30})'

function escapeLiteral(text: string): string {
  return text.replace(REGEXP_SYNTAX_CHARACTER, '\\$&')
}

export function extractLoadReference(input: {
  readonly additionalInfo: string | undefined
  readonly label: string | null
}): string | undefined {
  const { additionalInfo, label } = input
  if (label === null || additionalInfo === undefined) return undefined
  if (findArrivalReferenceLabelIssue(label) !== undefined) return undefined
  const grammar = new RegExp(`${escapeLiteral(label)}${LOAD_REFERENCE_VALUE}`, 'iu')
  return grammar.exec(additionalInfo.slice(0, LOAD_REFERENCE_INPUT_MAX_LENGTH))?.[1]
}
