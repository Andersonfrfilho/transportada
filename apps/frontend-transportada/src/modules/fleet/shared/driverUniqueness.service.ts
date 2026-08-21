/* Copyright (c) 2026 Ada Technology. MIT License. */
import { FLEET_FEEDBACK_KEY_BY_ERROR } from './fleet.constant'
import type { FleetDriverAvailability } from './fleet.types'

export const DRIVER_UNIQUE_FIELDS = ['email', 'licenseNumber', 'taxId'] as const

export type DriverUniqueField = (typeof DRIVER_UNIQUE_FIELDS)[number]

export const DRIVER_UNIQUE_FEEDBACK_KEY: Readonly<Record<DriverUniqueField, string>> = {
  email: 'emailTaken',
  licenseNumber: 'licenseNumberTaken',
  taxId: 'taxIdTaken',
}

/**
 * Todo erro de campo tem um campo dono. Sem este mapa a mensagem só cabe no rodapé, e o operador
 * percorre a ficha inteira procurando qual dos campos é o repetido — ou qual falta preencher.
 */
const FIELD_BY_ERROR: Readonly<Record<string, DriverUniqueField>> = {
  // O convite abre o usuário no Keycloak, e é de lá que vem o e-mail repetido
  COMPANY_USER_CONTACT_TAKEN: 'email',
  FLEET_DRIVER_CONTACT_REQUIRED: 'email',
  FLEET_DRIVER_EMAIL_TAKEN: 'email',
  FLEET_DRIVER_LICENSE_NUMBER_TAKEN: 'licenseNumber',
  FLEET_DRIVER_TAX_ID_TAKEN: 'taxId',
}

const TAKEN_KEY_BY_FIELD: Readonly<Record<DriverUniqueField, keyof FleetDriverAvailability>> = {
  email: 'emailTaken',
  licenseNumber: 'licenseNumberTaken',
  taxId: 'taxIdTaken',
}

export type DriverFieldError = Readonly<{
  feedbackKey: string
  field: DriverUniqueField
}>

export function resolveDriverFieldError(error: unknown): DriverFieldError | null {
  const code = error instanceof Error ? error.message : ''
  const field = FIELD_BY_ERROR[code]
  if (field === undefined) return null
  // A mensagem sai do mesmo mapa do rodapé: duas listas diriam coisas diferentes sobre o mesmo 409
  const feedbackKey = FLEET_FEEDBACK_KEY_BY_ERROR[code]
  return feedbackKey === undefined ? null : { feedbackKey, field }
}

export type RevealableField = Readonly<{
  focus: (options: { readonly preventScroll: boolean }) => void
  scrollIntoView: (options: { readonly block: 'center' }) => void
}>

/**
 * Marcar o campo não basta: numa ficha de vinte campos o que falhou fica fora da tela, e o operador
 * lê o aviso do rodapé sem saber para onde rolar. O foco vem sem rolagem própria — ela para o campo
 * na borda —, e a centralização é feita depois, que é onde o olho já está.
 */
export function revealField(element: null | RevealableField | undefined): boolean {
  if (element === null || element === undefined) return false
  element.focus({ preventScroll: true })
  element.scrollIntoView({ block: 'center' })
  return true
}

export function toDriverFieldErrors(
  availability: FleetDriverAvailability,
): Partial<Record<DriverUniqueField, string>> {
  const errors: Partial<Record<DriverUniqueField, string>> = {}
  for (const field of DRIVER_UNIQUE_FIELDS) {
    if (availability[TAKEN_KEY_BY_FIELD[field]]) errors[field] = DRIVER_UNIQUE_FEEDBACK_KEY[field]
  }
  return errors
}
