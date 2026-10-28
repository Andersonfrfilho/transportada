/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 285: a automação do fluxo semanal de um contratante, como a API devolve. */
export type ContractorAutomation = Readonly<{
  billingDueDays: number
  enabled: boolean
  id: string
  name: string
  nfseCity: string | null
  partSize: number
  recipients: readonly string[]
  xmlKind: 'cte'
}>

/** O que a tela envia: o mesmo corpo do cadastro e da edição. */
export type ContractorAutomationInput = Readonly<Omit<ContractorAutomation, 'id'>>

export const CONTRACTOR_AUTOMATION_LIMITS = {
  dueDaysMax: 120,
  partSizeMax: 100,
  recipientsMax: 50,
} as const

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export function isContractorAutomation(value: unknown): value is ContractorAutomation {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.enabled === 'boolean' &&
    typeof candidate.billingDueDays === 'number' &&
    typeof candidate.partSize === 'number' &&
    candidate.xmlKind === 'cte' &&
    (candidate.nfseCity === null || typeof candidate.nfseCity === 'string') &&
    Array.isArray(candidate.recipients) &&
    candidate.recipients.every((recipient) => typeof recipient === 'string')
  )
}

/** Um e-mail por linha (ou separado por vírgula, ponto e vírgula, espaço), em minúsculas e sem repetição. */
export function parseRecipients(text: string): readonly string[] {
  const parts = text
    .split(/[\s,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '')
  return [...new Set(parts)]
}

export type ContractorAutomationFormValues = Readonly<{
  billingDueDays: string
  enabled: boolean
  name: string
  nfseCity: string
  partSize: string
  recipients: string
}>

export type ContractorAutomationFormError =
  | 'billingDueDays'
  | 'name'
  | 'partSize'
  | 'recipientFormat'
  | 'recipientLimit'

export const EMPTY_CONTRACTOR_AUTOMATION_FORM: ContractorAutomationFormValues = {
  billingDueDays: '15',
  enabled: false,
  name: '',
  nfseCity: '',
  partSize: '100',
  recipients: '',
}

export function toFormValues(automation: ContractorAutomation): ContractorAutomationFormValues {
  return {
    billingDueDays: String(automation.billingDueDays),
    enabled: automation.enabled,
    name: automation.name,
    nfseCity: automation.nfseCity ?? '',
    partSize: String(automation.partSize),
    recipients: automation.recipients.join('\n'),
  }
}

function wholeNumber(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null
}

/** Valida do mesmo jeito que a API (`1..120` dias, `1..100` por parte, até 50 e-mails). */
export function toInput(
  values: ContractorAutomationFormValues,
):
  | Readonly<{ error: ContractorAutomationFormError; ok: false }>
  | Readonly<{ input: ContractorAutomationInput; ok: true }> {
  const name = values.name.trim()
  if (name === '' || name.length > 120) return { error: 'name', ok: false }
  const billingDueDays = wholeNumber(values.billingDueDays)
  if (
    billingDueDays === null ||
    billingDueDays < 1 ||
    billingDueDays > CONTRACTOR_AUTOMATION_LIMITS.dueDaysMax
  ) {
    return { error: 'billingDueDays', ok: false }
  }
  const partSize = wholeNumber(values.partSize)
  if (partSize === null || partSize < 1 || partSize > CONTRACTOR_AUTOMATION_LIMITS.partSizeMax) {
    return { error: 'partSize', ok: false }
  }
  const recipients = parseRecipients(values.recipients)
  if (recipients.length > CONTRACTOR_AUTOMATION_LIMITS.recipientsMax) {
    return { error: 'recipientLimit', ok: false }
  }
  if (recipients.some((recipient) => !EMAIL_PATTERN.test(recipient))) {
    return { error: 'recipientFormat', ok: false }
  }
  const nfseCity = values.nfseCity.trim()

  return {
    input: {
      billingDueDays,
      enabled: values.enabled,
      name,
      nfseCity: nfseCity === '' ? null : nfseCity,
      partSize,
      recipients,
      xmlKind: 'cte',
    },
    ok: true,
  }
}
