/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { isCompletePhone, stripPhone } from '@/modules/shared/phone.service'
import { normalizeTaxId } from '@/modules/shared/taxId.service'

import { CPF_LENGTH, USERNAME_PATTERN } from '../shared/companyUsers.constant'
import type {
  CompanyUser,
  ContactChannel,
  InviteCompanyUserInput,
  UpdateCompanyUserProfileInput,
} from '../shared/companyUsers.types'
import { buildRoleChoices } from '../shared/companyUsersViewModel.service'

const DEFAULT_CHANNEL: ContactChannel = 'email'
const DEFAULT_ROLE = 'operator'

export type CompanyUserInviteForm = Readonly<{
  channel: string
  contact: string
  email: string
  isEmailValid: boolean
  isPhoneValid: boolean
  isReady: boolean
  isTaxIdValid: boolean
  name: string
  phone: string
  roleChoices: readonly string[]
  roles: readonly string[]
  taxId: string
  reset: () => void
  setChannel: (value: string) => void
  setContact: (value: string) => void
  setEmail: (value: string) => void
  setName: (value: string) => void
  setPhone: (value: string) => void
  setTaxId: (value: string) => void
  toggleRole: (role: string, checked: boolean) => void
  toInput: () => InviteCompanyUserInput
}>

/** Só formato: quem valida de verdade é a API, e acusar antes disso é conveniência, não regra. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

function isBlankOrValidEmail(value: string): boolean {
  return value.trim() === '' || EMAIL_PATTERN.test(value.trim())
}

function isBlankOrCompletePhone(value: string): boolean {
  return stripPhone(value) === '' || isCompletePhone(value)
}

function isBlankOrCompleteTaxId(value: string): boolean {
  const digits = normalizeTaxId(value)
  return digits === '' || digits.length === CPF_LENGTH
}

export function useCompanyUserInviteForm(): CompanyUserInviteForm {
  const [channel, setChannel] = useState<string>(DEFAULT_CHANNEL)
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [roles, setRoles] = useState<readonly string[]>([DEFAULT_ROLE])
  const [taxId, setTaxId] = useState('')

  function reset(): void {
    setChannel(DEFAULT_CHANNEL)
    setContact('')
    setEmail('')
    setName('')
    setPhone('')
    setRoles([DEFAULT_ROLE])
    setTaxId('')
  }

  const isEmailValid = isBlankOrValidEmail(email)
  const isPhoneValid = isBlankOrCompletePhone(phone)
  const isTaxIdValid = isBlankOrCompleteTaxId(taxId)

  return {
    channel,
    contact,
    email,
    isEmailValid,
    isPhoneValid,
    isReady:
      name.trim() !== '' &&
      contact.trim() !== '' &&
      roles.length > 0 &&
      isEmailValid &&
      isPhoneValid &&
      isTaxIdValid,
    isTaxIdValid,
    name,
    phone,
    reset,
    roleChoices: buildRoleChoices([]),
    roles,
    setChannel,
    setContact,
    setEmail,
    setName,
    setPhone,
    setTaxId,
    taxId,
    toggleRole: (role, checked) => setRoles((current) => toggleValue(current, role, checked)),
    /** A API guarda só dígito; mandar a máscara faria a mesma pessoa entrar duas vezes. */
    toInput: () => ({
      channel: channel as ContactChannel,
      contact: contact.trim(),
      name: name.trim(),
      roles,
      ...(email.trim() === '' ? {} : { email: email.trim() }),
      ...(stripPhone(phone) === '' ? {} : { phone: stripPhone(phone) }),
      ...(normalizeTaxId(taxId) === '' ? {} : { taxId: normalizeTaxId(taxId) }),
    }),
  }
}

export type CompanyUserEditForm = Readonly<{
  channel: string
  contact: string
  email: string
  hasProfileChange: boolean
  hasRoleChange: boolean
  isContactRequired: boolean
  isReady: boolean
  isUsernameValid: boolean
  name: string
  roleChoices: readonly string[]
  roles: readonly string[]
  username: string
  setChannel: (value: string) => void
  setContact: (value: string) => void
  setEmail: (value: string) => void
  setName: (value: string) => void
  setUsername: (value: string) => void
  toggleRole: (role: string, checked: boolean) => void
  toProfilePatch: () => UpdateCompanyUserProfileInput | undefined
}>

/**
 * O contato chega mascarado da API — editá-lo é escrever um valor novo, não corrigir o que está
 * na tela; por isso o campo abre vazio e só entra no PATCH quando alguém digita.
 */
export function useCompanyUserEditForm(user: CompanyUser | null): CompanyUserEditForm {
  const [channel, setChannel] = useState<string>(user?.contact.channel ?? DEFAULT_CHANNEL)
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [name, setName] = useState(user?.name ?? '')
  const [roles, setRoles] = useState<readonly string[]>(user?.roles ?? [])
  const [username, setUsername] = useState(user?.username ?? '')

  useEffect(() => {
    setChannel(user?.contact.channel ?? DEFAULT_CHANNEL)
    setContact('')
    setEmail('')
    setName(user?.name ?? '')
    setRoles(user?.roles ?? [])
    setUsername(user?.username ?? '')
  }, [user])

  const trimmedUsername = username.trim().toLowerCase()
  const isUsernameChanged = user !== null && trimmedUsername !== user.username
  const isUsernameValid = !isUsernameChanged || USERNAME_PATTERN.test(trimmedUsername)
  const isNameChanged = user !== null && name.trim() !== '' && name.trim() !== user.name
  const isChannelChanged = user !== null && channel !== user.contact.channel
  const hasProfileChange =
    isNameChanged ||
    isUsernameChanged ||
    isChannelChanged ||
    contact.trim() !== '' ||
    email.trim() !== ''
  const hasRoleChange = user !== null && !isSameRoleSet(roles, user.roles)
  // Trocar o canal sem novo contato deixaria um e-mail gravado como telefone.
  const isContactRequired = isChannelChanged && contact.trim() === ''

  return {
    channel,
    contact,
    email,
    hasProfileChange,
    hasRoleChange,
    isContactRequired,
    isReady: (hasProfileChange || hasRoleChange) && isUsernameValid && !isContactRequired,
    isUsernameValid,
    name,
    roleChoices: buildRoleChoices(user?.roles ?? []),
    roles,
    setChannel,
    setContact,
    setEmail,
    setName,
    setUsername,
    toggleRole: (role, checked) => setRoles((current) => toggleValue(current, role, checked)),
    toProfilePatch: () => {
      if (user === null || !hasProfileChange || !isUsernameValid || isContactRequired)
        return undefined
      return {
        userId: user.id,
        ...(isNameChanged ? { name: name.trim() } : {}),
        ...(isUsernameChanged ? { username: trimmedUsername } : {}),
        ...(isChannelChanged ? { channel: channel as ContactChannel } : {}),
        ...(contact.trim() === '' ? {} : { contact: contact.trim() }),
        ...(email.trim() === '' ? {} : { email: email.trim() }),
      }
    },
    username,
  }
}

function toggleValue(
  current: readonly string[],
  value: string,
  checked: boolean,
): readonly string[] {
  if (checked) return current.includes(value) ? current : [...current, value]
  return current.filter((entry) => entry !== value)
}

function isSameRoleSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((role) => right.includes(role))
}
