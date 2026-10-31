/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ContractorMailCheckItem,
  ContractorMailCheckKey,
  ContractorMailSettingsSummary,
} from './contractorMailSettings.types'

/**
 * Espelha `contractor-mail/domain/mail-send-readiness.policy.ts` da API (spec 150, RF16/RF17) —
 * cópia por valor, o bundle não importa código de lá. Contrato de paridade:
 * `test/delivery-clients/mail-send-readiness-parity.contract.ts`.
 */
export const MAIL_SEND_READINESS_REASONS = [
  'not_configured',
  'sending_not_verified',
  'template_missing',
] as const
export type MailSendReadinessReason = (typeof MAIL_SEND_READINESS_REASONS)[number]

/** Os dois itens da lista (RF12) que, juntos ok, liberam `sendingVerifiedAt` (T401). */
const SENDING_VERIFICATION_GATE_KEYS: readonly ContractorMailCheckKey[] = [
  'api_key',
  'sender_domain',
]

export type MailSendReadinessShortcutTarget = 'checklist' | 'notifications'

const REASON_SHORTCUT_TARGET: Readonly<
  Record<MailSendReadinessReason, MailSendReadinessShortcutTarget>
> = {
  not_configured: 'checklist',
  sending_not_verified: 'checklist',
  template_missing: 'notifications',
}

/** T404: cada motivo leva a um único lugar — configuração/verificação para a lista, sem modelo para Notificações (spec 286). */
export function resolveMailSendReadinessShortcutTarget(
  reason: MailSendReadinessReason,
): MailSendReadinessShortcutTarget {
  return REASON_SHORTCUT_TARGET[reason]
}

export type MailSendReadinessView =
  | Readonly<{ ready: true }>
  | Readonly<{
      /** Só populado em `sending_not_verified` — qual dos dois itens da lista ainda falta. */
      failingChecklistKeys: readonly ContractorMailCheckKey[]
      reason: MailSendReadinessReason
      ready: false
    }>

export type MailSendReadinessViewParams = Readonly<{
  checks: readonly ContractorMailCheckItem[]
  /** `null`: nunca salva (equivale ao `settings: undefined` da API). */
  settings: ContractorMailSettingsSummary | null
  /** O módulo de notificação tem um modelo utilizável para o e-mail de correção (spec 286). */
  templateUsable: boolean
}>

function resolveFailingChecklistKeys(
  checks: readonly ContractorMailCheckItem[],
): readonly ContractorMailCheckKey[] {
  return SENDING_VERIFICATION_GATE_KEYS.filter(
    (key) => checks.find((check) => check.key === key)?.status !== 'ok',
  )
}

/**
 * Espelha `resolveMailSendReadiness` da API (RF16/RF17): `not_configured` sem cadastro salvo,
 * `sending_not_verified` sem a chave e o domínio aceitos (T401), `template_missing` sem modelo
 * utilizável no módulo de notificação (spec 286). O `status` da ida e volta (143) nunca entra aqui — ver
 * `isMailRoundTripConfigured`.
 */
export function resolveMailSendReadinessView(
  params: MailSendReadinessViewParams,
): MailSendReadinessView {
  const { checks, settings, templateUsable } = params

  if (settings === null) {
    return {
      failingChecklistKeys: resolveFailingChecklistKeys(checks),
      reason: 'not_configured',
      ready: false,
    }
  }
  if (settings.sendingVerifiedAt === null) {
    return {
      failingChecklistKeys: resolveFailingChecklistKeys(checks),
      reason: 'sending_not_verified',
      ready: false,
    }
  }
  if (!templateUsable) {
    return { failingChecklistKeys: [], reason: 'template_missing', ready: false }
  }
  return { ready: true }
}

const REASON_LOCALE_KEY: Readonly<Record<MailSendReadinessReason, string>> = {
  not_configured: 'contractorMail.sendReadiness.reasonNotConfigured',
  sending_not_verified: 'contractorMail.sendReadiness.reasonSendingNotVerified',
  template_missing: 'contractorMail.sendReadiness.reasonTemplateMissing',
}

export function mailSendReadinessReasonLocaleKey(reason: MailSendReadinessReason): string {
  return REASON_LOCALE_KEY[reason]
}

/**
 * RF16: o envio nunca dependeu da ida e volta (143) — este estado é só informativo, mostrado
 * separado do "Pronto para enviar", e nunca bloqueia o envio.
 */
export function isMailRoundTripConfigured(settings: ContractorMailSettingsSummary | null): boolean {
  return settings?.status === 'active'
}

export type OccurrenceMailNotice = 'blocked' | 'none' | 'sandbox'

/**
 * Spec 268 RF8: o e-mail de ocorrência só depende da configuração (chave aceita e remetente verificado), não do
 * modelo. Sem ela, `sandbox` quando o ambiente de teste manda o e-mail ao Mailpit (a API só informa `sandboxDelivery`
 * nesse caso), `blocked` quando nenhum e-mail sai.
 */
export function resolveOccurrenceMailNotice(
  params: Readonly<{ sandboxDelivery: boolean; settings: ContractorMailSettingsSummary | null }>,
): OccurrenceMailNotice {
  if (params.sandboxDelivery) return 'sandbox'
  if (params.settings === null || params.settings.sendingVerifiedAt === null) return 'blocked'
  return 'none'
}
