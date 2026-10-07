/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10, D6): as duas listas da entrada por e-mail. Quem encaminha é endereço exato;
 * o remetente original é endereço ou domínio exato, nunca padrão nem subdomínio (o worker casa assim). As
 * faixas são as do CHECK do banco — 3 a 254 caracteres, sem controle, espaço, vírgula, `<>` ou `|`.
 */
import {
  PREVIEW_ALLOWLIST_ISSUE,
  PREVIEW_ALLOWLIST_KIND,
  PREVIEW_ALLOWLIST_LIMITS as LIMITS,
  type PreviewAllowlistIssueReason,
  type PreviewAllowlistKind,
} from './contractor-preview-email.constant.js'

export type PreviewAllowlistIssue = {
  readonly entry: string
  readonly index: number
  readonly reason: PreviewAllowlistIssueReason
}

export type NormalizedPreviewAllowlist = {
  readonly entries: readonly string[]
  readonly hasTooManyEntries: boolean
  readonly issues: readonly PreviewAllowlistIssue[]
}

const FORBIDDEN_CHARACTER = /[\p{Cc}\s,<>|]/u
const MAILBOX = /^[^@]+@[^@]+$/u
const INVALID_DOMAIN_EDGE = /^\.|\.$|\*/u

export function normalizePreviewAllowlist(input: {
  readonly entries: readonly string[]
  readonly kind: PreviewAllowlistKind
}): NormalizedPreviewAllowlist {
  const valid = new Set<string>()
  const issues: PreviewAllowlistIssue[] = []

  input.entries.forEach((raw, index) => {
    const entry = raw.trim().toLowerCase()
    const reason = findIssue({ entry, kind: input.kind })
    if (reason === undefined) valid.add(entry)
    else issues.push({ entry, index, reason })
  })

  return {
    entries: [...valid],
    hasTooManyEntries: valid.size > LIMITS.maxEntries,
    issues,
  }
}

function findIssue(input: {
  readonly entry: string
  readonly kind: PreviewAllowlistKind
}): PreviewAllowlistIssueReason | undefined {
  const { entry } = input
  if (entry.length < LIMITS.entryMinLength) return PREVIEW_ALLOWLIST_ISSUE.tooShort
  if (entry.length > LIMITS.entryMaxLength) return PREVIEW_ALLOWLIST_ISSUE.tooLong
  if (FORBIDDEN_CHARACTER.test(entry)) return PREVIEW_ALLOWLIST_ISSUE.forbiddenCharacter

  const isMailbox = entry.includes('@')
  if (isMailbox) return isValidMailbox(entry) ? undefined : PREVIEW_ALLOWLIST_ISSUE.notAMailbox
  if (input.kind === PREVIEW_ALLOWLIST_KIND.forwarder) return PREVIEW_ALLOWLIST_ISSUE.notAMailbox
  return INVALID_DOMAIN_EDGE.test(entry) ? PREVIEW_ALLOWLIST_ISSUE.notADomain : undefined
}

function isValidMailbox(entry: string): boolean {
  if (!MAILBOX.test(entry)) return false
  const domain = entry.slice(entry.indexOf('@') + 1)
  return !INVALID_DOMAIN_EDGE.test(domain)
}
