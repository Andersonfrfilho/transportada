/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b: o corpo das listas recusa chave desconhecida (inclusive `companyId` e o hash) e nomeia cada
 * entrada inválida pelo índice, antes do banco; a lista de recusas aceita só `limit`, de 1 a 50.
 */
import { z } from 'zod'

import { invalidRequest, readListQuery } from '../../http/request-parsing.service.js'
import {
  PREVIEW_ALLOWLIST_FIELD,
  PREVIEW_ALLOWLIST_ISSUE,
  PREVIEW_ALLOWLIST_KIND,
  PREVIEW_ALLOWLIST_LIMITS as LIMITS,
  PREVIEW_EMAIL_INTAKE_LIMIT,
  type PreviewAllowlistIssueReason,
  type PreviewAllowlistKind,
} from '../domain/contractor-preview-email.constant.js'
import { normalizePreviewAllowlist } from '../domain/preview-email-allowlist.policy.js'

const ISSUE_MESSAGES: Readonly<Record<PreviewAllowlistIssueReason, string>> = {
  [PREVIEW_ALLOWLIST_ISSUE.forbiddenCharacter]:
    'it has a control character, space, comma, < > or |',
  [PREVIEW_ALLOWLIST_ISSUE.nonAscii]:
    'it must use only visible ASCII characters; write an international domain in punycode (xn--)',
  [PREVIEW_ALLOWLIST_ISSUE.notADomain]: 'it must be an exact domain, without * or a leading dot',
  [PREVIEW_ALLOWLIST_ISSUE.notAMailbox]: 'it must be a complete e-mail address',
  [PREVIEW_ALLOWLIST_ISSUE.tooLong]: `it must have at most ${LIMITS.entryMaxLength} characters`,
  [PREVIEW_ALLOWLIST_ISSUE.tooShort]: `it must have at least ${LIMITS.entryMinLength} characters`,
}
const REFLECTED_ENTRY_MAX_LENGTH = 60
const NOT_VISIBLE_ASCII = /[^\x21-\x7e]/gu
const INTAKE_LIMIT = /^(?:[1-9]|[1-4][0-9]|50)$/u

function allowlistSchema(kind: PreviewAllowlistKind) {
  return z
    .array(z.string().max(LIMITS.inputEntryMaxLength))
    .max(LIMITS.inputMaxEntries)
    .superRefine((entries, context) => {
      /** Lista ou entrada acima do teto já foi recusada pelo `max`: validar cada entrada de um corpo hostil só repetiria a recusa. */
      if (entries.length > LIMITS.inputMaxEntries) return
      if (entries.some((entry) => entry.length > LIMITS.inputEntryMaxLength)) return
      const result = normalizePreviewAllowlist({ entries, kind })
      for (const issue of result.issues.slice(0, LIMITS.maxReportedIssues)) {
        context.addIssue({
          code: 'custom',
          message: `Invalid entry "${printable(issue.entry)}": ${ISSUE_MESSAGES[issue.reason]}`,
          path: [issue.index],
        })
      }
      if (result.hasTooManyEntries) {
        context.addIssue({
          code: 'custom',
          message: `Use at most ${LIMITS.maxEntries} different entries`,
        })
      }
    })
    .transform((entries) => normalizePreviewAllowlist({ entries, kind }).entries)
}

function printable(entry: string): string {
  return entry.replace(NOT_VISIBLE_ASCII, '?').slice(0, REFLECTED_ENTRY_MAX_LENGTH)
}

export const previewEmailAllowlistsSchema = z
  .object({
    [PREVIEW_ALLOWLIST_FIELD.forwarder]: allowlistSchema(PREVIEW_ALLOWLIST_KIND.forwarder),
    [PREVIEW_ALLOWLIST_FIELD.sender]: allowlistSchema(PREVIEW_ALLOWLIST_KIND.sender),
  })
  .strict()

/** O pedido de gerar não leva dado nenhum: qualquer chave é recusa. */
export const generateInboundTokenSchema = z.object({}).strict()

export function parsePreviewEmailIntakeLimit(url: URL): number {
  const value = readListQuery(url, new Set(['limit'])).get('limit')
  if (value === null) return PREVIEW_EMAIL_INTAKE_LIMIT.default
  if (!INTAKE_LIMIT.test(value)) throw invalidRequest()
  return Number(value)
}
