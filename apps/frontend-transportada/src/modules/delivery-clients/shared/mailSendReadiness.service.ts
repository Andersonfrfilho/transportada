/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ContractorMailCheckItem,
  ContractorMailCheckKey,
  ContractorMailSettingsSummary,
} from './contractorMailSettings.types'
import type {
  ContractorMailTemplate,
  ContractorMailTemplateType,
} from './contractorMailTemplates.types'

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

export type MailSendReadinessShortcutTarget = 'checklist' | 'templates'

const REASON_SHORTCUT_TARGET: Readonly<
  Record<MailSendReadinessReason, MailSendReadinessShortcutTarget>
> = {
  not_configured: 'checklist',
  sending_not_verified: 'checklist',
  template_missing: 'templates',
}

/** T404: cada motivo leva a uma única seção — configuração/verificação para a lista, sem modelo para "Modelos" (T403). */
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
  mailType: ContractorMailTemplateType
  /** `null`: nunca salva (equivale ao `settings: undefined` da API). */
  settings: ContractorMailSettingsSummary | null
  templates: readonly ContractorMailTemplate[]
}>

function resolveFailingChecklistKeys(
  checks: readonly ContractorMailCheckItem[],
): readonly ContractorMailCheckKey[] {
  return SENDING_VERIFICATION_GATE_KEYS.filter(
    (key) => checks.find((check) => check.key === key)?.status !== 'ok',
  )
}

/** RF17/T402: arquivado, de outro tipo ou sem marca de padrão não contam como modelo pronto. */
function findDefaultActiveTemplate(
  templates: readonly ContractorMailTemplate[],
  mailType: ContractorMailTemplateType,
): ContractorMailTemplate | undefined {
  return templates.find(
    (template) =>
      template.mailType === mailType && template.status === 'active' && template.isDefault,
  )
}

/**
 * Espelha `resolveMailSendReadiness` da API (RF16/RF17): `not_configured` sem cadastro salvo,
 * `sending_not_verified` sem a chave e o domínio aceitos (T401), `template_missing` sem modelo
 * ativo padrão do tipo (T402). O `status` da ida e volta (143) nunca entra aqui — ver
 * `isMailRoundTripConfigured`.
 */
export function resolveMailSendReadinessView(
  params: MailSendReadinessViewParams,
): MailSendReadinessView {
  const { checks, mailType, settings, templates } = params

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
  if (findDefaultActiveTemplate(templates, mailType) === undefined) {
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
