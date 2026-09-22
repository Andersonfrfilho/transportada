/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Formatação dos valores de cada item do e-mail de correção (RF10/RF11) — os mesmos textos entram
 * nos blocos fixos do layout e nas variáveis de item do modelo (T402), para os dois nunca divergirem.
 */
import type { AddressFields } from '../application/address-correction.port.js'
import type {
  AddressCorrectionMailItem,
  AddressCorrectionMailReason,
} from './address-correction-mail.types.js'

const METRES_PER_KILOMETRE = 1000

/**
 * `logradouro, número[, complemento] — [bairro —] cidade/UF · CEP`, sem separador sobrando quando
 * complemento ou bairro faltam (T303).
 */
export function formatAddress(fields: AddressFields): string {
  const hasComplement = fields.complement !== null && fields.complement.trim().length > 0
  const streetSegment = hasComplement
    ? `${fields.street}, ${fields.number}, ${fields.complement}`
    : `${fields.street}, ${fields.number}`

  const hasDistrict = fields.district !== null && fields.district.trim().length > 0
  const segments = hasDistrict
    ? [streetSegment, fields.district as string, `${fields.city}/${fields.state}`]
    : [streetSegment, `${fields.city}/${fields.state}`]

  return `${segments.join(' — ')} · ${formatPostalCode(fields.postalCode)}`
}

export function formatPostalCode(postalCode: string): string {
  const digits = postalCode.replaceAll(/\D/gu, '')
  if (digits.length !== 8) return postalCode

  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

/**
 * Motivo em linguagem de leigo (RF11): "localizado a X" só quando o provedor casou rua e número
 * (`rooftop`/`range_interpolated`, `address-finding.policy.ts`). `approximate` e `not_found` viram
 * "endereço não localizado" **mesmo com distância** — `approximate` mede até o centroide do
 * município (`toDistance`, `compare-addresses-batch.use-case.ts`), então o número não descreve uma
 * rua encontrada perto, e mostrá-lo insinuaria uma correspondência que não existe (revisão final).
 * Sem distância útil (`distanceMetres: null`, sem coordenada do provedor para medir) é sempre "não
 * localizado" também. Havendo distância e casamento de rua, abaixo de 1 km sai em metros inteiros; a
 * partir de 1 km, em quilômetros com vírgula decimal e uma casa.
 */
export function formatReason(reason: AddressCorrectionMailReason): string {
  const isStreetLevelMatch =
    reason.matchLevel === 'rooftop' || reason.matchLevel === 'range_interpolated'
  if (!isStreetLevelMatch || reason.distanceMetres === null) return 'endereço não localizado'

  if (reason.distanceMetres < METRES_PER_KILOMETRE) {
    return `localizado a ${Math.round(reason.distanceMetres)} m do endereço informado`
  }

  const kilometres = (reason.distanceMetres / METRES_PER_KILOMETRE).toFixed(1).replace('.', ',')
  return `localizado a ${kilometres} km do endereço informado`
}

/** `null` → o bloco abre pelo endereço correto, sem nome nem "null" (T303). */
export function itemHeading(item: AddressCorrectionMailItem): string {
  return item.recipientName ?? formatAddress(item.proposed)
}

/** Valores das variáveis de item do catálogo (`MAIL_TEMPLATE_CATALOG.address_correction`). */
export function buildItemVariableValues(
  item: AddressCorrectionMailItem,
): Readonly<Record<string, string>> {
  return {
    cep_como_veio: formatPostalCode(item.reported.postalCode),
    cep_correto: formatPostalCode(item.proposed.postalCode),
    cliente: itemHeading(item),
    endereco_como_veio: formatAddress(item.reported),
    endereco_correto: formatAddress(item.proposed),
    motivo: formatReason(item.reason),
    municipio: item.proposed.city,
    uf: item.proposed.state,
  }
}
