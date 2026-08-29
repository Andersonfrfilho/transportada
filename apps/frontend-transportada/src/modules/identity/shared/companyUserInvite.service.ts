/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isCompletePhone, stripPhone } from '@/modules/shared/phone.service'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { CPF_LENGTH } from './companyUsers.constant'
import type { ContactChannel } from './companyUsers.types'

export const INVITE_FIELD = {
  EMAIL: 'email',
  NAME: 'name',
  PHONE: 'phone',
  ROLES: 'roles',
  TAX_ID: 'taxId',
} as const
export type InviteField = (typeof INVITE_FIELD)[keyof typeof INVITE_FIELD]

export const INVITE_ISSUE = {
  INCOMPLETE: 'incomplete',
  INVALID: 'invalid',
  REQUIRED: 'required',
} as const
export type InviteIssueCode = (typeof INVITE_ISSUE)[keyof typeof INVITE_ISSUE]

export type InviteIssue = Readonly<{ code: InviteIssueCode; field: InviteField }>

export type InviteDraft = Readonly<{
  channel: string
  email: string
  name: string
  phone: string
  roles: readonly string[]
  taxId: string
}>

/**
 * O canal escolhe por qual campo o convite sai, e é esse campo que passa a ser obrigatório. Antes
 * havia um "Contato" ao lado de "E-mail" e "Telefone": três campos parecidos, um só exigido, e quem
 * preenchia o e-mail via o botão continuar apagado sem nada na tela dizendo o porquê.
 */
const CONTACT_FIELD_BY_CHANNEL: Readonly<Record<ContactChannel, InviteField>> = {
  email: INVITE_FIELD.EMAIL,
  sms: INVITE_FIELD.PHONE,
  whatsapp: INVITE_FIELD.PHONE,
}

export function resolveInviteContactField(channel: string): InviteField {
  return CONTACT_FIELD_BY_CHANNEL[channel as ContactChannel] ?? INVITE_FIELD.EMAIL
}

/** A API guarda só dígito: mandar a máscara faria a mesma pessoa entrar duas vezes. */
export function resolveInviteContact(input: InviteDraft): string {
  return resolveInviteContactField(input.channel) === INVITE_FIELD.PHONE
    ? stripPhone(input.phone)
    : input.email.trim()
}

/** Só formato: quem valida de verdade é a API, e acusar antes disso é conveniência, não regra. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

export function isBlankOrValidEmail(value: string): boolean {
  return value.trim() === '' || EMAIL_PATTERN.test(value.trim())
}

export function isBlankOrCompletePhone(value: string): boolean {
  return stripPhone(value) === '' || isCompletePhone(value)
}

export function isBlankOrCompleteTaxId(value: string): boolean {
  const digits = normalizeTaxId(value)
  return digits === '' || digits.length === CPF_LENGTH
}

/**
 * A ordem é a da tela: o aviso que lista o que falta lê daqui, e uma lista fora da ordem visual
 * manda o operador procurar de baixo para cima.
 */
export function collectInviteIssues(draft: InviteDraft): readonly InviteIssue[] {
  const contactField = resolveInviteContactField(draft.channel)
  const issues: InviteIssue[] = []

  if (draft.name.trim() === '')
    issues.push({ code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.NAME })

  if (contactField === INVITE_FIELD.EMAIL && draft.email.trim() === '')
    issues.push({ code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.EMAIL })
  else if (!isBlankOrValidEmail(draft.email))
    issues.push({ code: INVITE_ISSUE.INVALID, field: INVITE_FIELD.EMAIL })

  if (contactField === INVITE_FIELD.PHONE && stripPhone(draft.phone) === '')
    issues.push({ code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.PHONE })
  else if (!isBlankOrCompletePhone(draft.phone))
    issues.push({ code: INVITE_ISSUE.INCOMPLETE, field: INVITE_FIELD.PHONE })

  if (!isBlankOrCompleteTaxId(draft.taxId))
    issues.push({ code: INVITE_ISSUE.INCOMPLETE, field: INVITE_FIELD.TAX_ID })

  if (draft.roles.length === 0)
    issues.push({ code: INVITE_ISSUE.REQUIRED, field: INVITE_FIELD.ROLES })

  return issues
}

export function findInviteIssue(
  issues: readonly InviteIssue[],
  field: InviteField,
): InviteIssue | undefined {
  return issues.find((issue) => issue.field === field)
}
