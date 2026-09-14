/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { IconName } from '@/components/ui/icon'

import {
  CONTRACTOR_MAIL_CHECK_KEYS,
  type ContractorMailCheckItem,
  type ContractorMailCheckKey,
  type ContractorMailCheckReason,
  type ContractorMailCheckStatus,
} from './contractorMailSettings.types'

const TEST_EMAIL_GATE_KEY: ContractorMailCheckKey = 'api_key'

/** A ordem fixa do RF12 — nunca a ordem em que a API happens to serializar. */
export function sortContractorMailChecks(
  checks: readonly ContractorMailCheckItem[],
): readonly ContractorMailCheckItem[] {
  return [...checks].sort(
    (left, right) =>
      CONTRACTOR_MAIL_CHECK_KEYS.indexOf(left.key) - CONTRACTOR_MAIL_CHECK_KEYS.indexOf(right.key),
  )
}

const STATUS_ICON: Readonly<Record<ContractorMailCheckStatus, IconName>> = {
  failed: 'alert',
  ok: 'check',
  pending: 'clock',
}

export function contractorMailCheckStatusIcon(status: ContractorMailCheckStatus): IconName {
  return STATUS_ICON[status]
}

/** Uma chave de locale por `reason` — a lista fechada de `ContractorMailCheckReason`. */
const REASON_LOCALE_KEY: Readonly<Record<ContractorMailCheckReason, string>> = {
  credential_unavailable: 'contractorMail.checkReason.credential_unavailable',
  dkim_absent: 'contractorMail.checkReason.dkim_absent',
  dkim_not_aligned: 'contractorMail.checkReason.dkim_not_aligned',
  dkim_unverifiable: 'contractorMail.checkReason.dkim_unverifiable',
  mx_absent: 'contractorMail.checkReason.mx_absent',
  mx_unreachable: 'contractorMail.checkReason.mx_unreachable',
  not_configured: 'contractorMail.checkReason.not_configured',
  ok: 'contractorMail.checkReason.ok',
  provider_unauthorized: 'contractorMail.checkReason.provider_unauthorized',
  provider_unexpected_response: 'contractorMail.checkReason.provider_unexpected_response',
  provider_unreachable: 'contractorMail.checkReason.provider_unreachable',
  sender_domain_not_found: 'contractorMail.checkReason.sender_domain_not_found',
  sender_domain_not_verified: 'contractorMail.checkReason.sender_domain_not_verified',
  test_not_replied: 'contractorMail.checkReason.test_not_replied',
  test_not_sent: 'contractorMail.checkReason.test_not_sent',
  webhook_never_received: 'contractorMail.checkReason.webhook_never_received',
}

export function contractorMailCheckReasonLocaleKey(reason: ContractorMailCheckReason): string {
  return REASON_LOCALE_KEY[reason]
}

export function contractorMailCheckKeyLocaleKey(key: ContractorMailCheckKey): string {
  return `contractorMail.checkKey.${key}`
}

/** "Enviar e-mail de teste" só aparece com a chave de API já aceita pelo Resend (spec 143, P0). */
export function isContractorMailTestEmailButtonVisible(
  checks: readonly ContractorMailCheckItem[],
): boolean {
  return checks.some((check) => check.key === TEST_EMAIL_GATE_KEY && check.status === 'ok')
}
