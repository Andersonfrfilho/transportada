/* Copyright (c) 2026 Ada Technology. MIT License. */

export const DRIVER_TRIP_PATH = '/minha-viagem'

/**
 * Spec 057, RF-6: quem só tem o par do campo **não pode cair na tela de NF-e**. Ele abre o produto
 * no celular, de pé, e a primeira coisa que precisa ver é a viagem dele.
 *
 * A checagem é por permissão, não por papel: `driver` e `aggregate` têm o mesmo par, e um papel novo
 * de campo amanhã entra sozinho. E é `trip.report` **sem** `trip.manage` — o separador tem as duas e
 * é gente de barracão, com a tela de viagem inteira para usar.
 */
export function isFieldOnlyUser(permissions: readonly string[]): boolean {
  return permissions.includes('trip.report') && !permissions.includes('trip.manage')
}
