/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PREVIEW_ALLOWLIST_KIND,
  PREVIEW_EMAIL_ALLOWLIST_LIMITS as LIMITS,
  type PreviewAllowlistKind,
} from './previewEmail.types'

export type AllowlistIssueCode =
  | 'forbiddenCharacter'
  | 'notADomain'
  | 'notAMailbox'
  | 'tooLong'
  | 'tooMany'
  | 'tooShort'

/** `entry` é vazia em `tooMany`, que é da lista, e nunca de uma linha. */
export type AllowlistIssue = Readonly<{ code: AllowlistIssueCode; entry: string }>

export type ValidatedAllowlist = Readonly<{
  entries: readonly string[]
  issues: readonly AllowlistIssue[]
}>

const LINE_BREAK = /\r?\n/u
const FORBIDDEN_CHARACTER = /[\p{Cc}\s,<>|]/u
const MAILBOX = /^[^@]+@[^@]+$/u
const INVALID_DOMAIN_EDGE = /^\.|\.$|\*/u

/** Uma entrada por linha: apara, passa para minúsculas, ignora linha vazia e tira a duplicata, na ordem. */
export function parseAllowlistText(text: string): readonly string[] {
  const entries = text
    .split(LINE_BREAK)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '')
  return [...new Set(entries)]
}

/** As mesmas regras da API (e do CHECK do banco): o erro aparece no campo, nomeando a entrada, antes da rede. */
export function validateAllowlistText(
  input: Readonly<{ kind: PreviewAllowlistKind; text: string }>,
): ValidatedAllowlist {
  const parsed = parseAllowlistText(input.text)
  const valid: string[] = []
  const issues: AllowlistIssue[] = []
  for (const entry of parsed) {
    const code = findIssue({ entry, kind: input.kind })
    if (code === undefined) valid.push(entry)
    else issues.push({ code, entry })
  }
  if (valid.length > LIMITS.maxEntries) issues.push({ code: 'tooMany', entry: '' })
  return { entries: valid, issues }
}

function findIssue(
  input: Readonly<{ entry: string; kind: PreviewAllowlistKind }>,
): AllowlistIssueCode | undefined {
  const { entry } = input
  if (entry.length < LIMITS.entryMinLength) return 'tooShort'
  if (entry.length > LIMITS.entryMaxLength) return 'tooLong'
  if (FORBIDDEN_CHARACTER.test(entry)) return 'forbiddenCharacter'
  if (entry.includes('@')) return isValidMailbox(entry) ? undefined : 'notAMailbox'
  if (input.kind === PREVIEW_ALLOWLIST_KIND.forwarder) return 'notAMailbox'
  return INVALID_DOMAIN_EDGE.test(entry) ? 'notADomain' : undefined
}

function isValidMailbox(entry: string): boolean {
  if (!MAILBOX.test(entry)) return false
  return !INVALID_DOMAIN_EDGE.test(entry.slice(entry.indexOf('@') + 1))
}
