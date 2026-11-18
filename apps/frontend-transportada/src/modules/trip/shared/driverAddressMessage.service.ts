/* Copyright (c) 2026 Ada Technology. MIT License. */

export type DriverAddressFields = Readonly<{
  city: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type DriverAddressPoint = Readonly<{ latitude: number; longitude: number }>

/** "Rua X, 123 - Bairro, Cidade/UF, CEP 00000-000": o endereço do formulário numa linha só, sem partes vazias. */
export function composeDriverAddressText(fields: DriverAddressFields): string {
  const street = [fields.street.trim(), fields.number.trim()]
    .filter((part) => part !== '')
    .join(', ')
  const place = [street, fields.district.trim()].filter((part) => part !== '').join(' - ')
  const city = [fields.city.trim(), fields.state.trim().toUpperCase()]
    .filter((part) => part !== '')
    .join('/')
  const postalCode = fields.postalCode.replace(/\D/gu, '')
  return [
    place,
    city,
    postalCode.length === 8 ? `CEP ${postalCode.slice(0, 5)}-${postalCode.slice(5)}` : '',
  ]
    .filter((part) => part !== '')
    .join(', ')
}

/** Spec 343 (T6a): o texto do chat do app com o endereço correto, e o link do mapa (no ponto, quando há) para abrir a rota. */
export function buildDriverAddressChatMessage(
  addressText: string,
  point?: DriverAddressPoint,
): string {
  const text = addressText.trim()
  const query =
    point === undefined ? encodeURIComponent(text) : `${point.latitude},${point.longitude}`
  return `Endereço correto da entrega: ${text}\nAbrir no mapa: https://maps.google.com/?q=${query}`
}
