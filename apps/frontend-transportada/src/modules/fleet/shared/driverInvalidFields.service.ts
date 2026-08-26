/* Copyright (c) 2026 Ada Technology. MIT License. */
import { toInvalidFields } from './fleetRequestError.service'

/**
 * O caminho que a API devolve é o do corpo (`address.city`), e o rótulo é o que está impresso no
 * campo. Sem este mapa o aviso mostraria o nome interno, que não é o que o operador leu na ficha.
 */
const LABEL_KEY_BY_FIELD: Readonly<Record<string, string>> = {
  'address.city': 'driverAddressCity',
  'address.complement': 'driverAddressComplement',
  'address.district': 'driverAddressDistrict',
  'address.number': 'driverAddressNumber',
  'address.postalCode': 'driverAddressPostalCode',
  'address.state': 'driverAddressState',
  'address.street': 'driverAddressStreet',
  anttCategory: 'driverAnttCategory',
  birthCity: 'driverBirthCity',
  birthDate: 'driverBirthDate',
  birthState: 'driverBirthState',
  email: 'driverEmail',
  fatherName: 'driverFatherName',
  firstLicenseAt: 'driverFirstLicenseAt',
  identityDocument: 'driverIdentityDocument',
  identityDocumentIssuer: 'driverIdentityDocumentIssuer',
  identityDocumentState: 'driverIdentityDocumentState',
  licenseCategory: 'driverLicenseCategory',
  licenseExpiresAt: 'driverLicenseExpiresAt',
  licenseIssuedCity: 'driverLicenseIssuedCity',
  licenseIssuedState: 'driverLicenseIssuedState',
  licenseNumber: 'driverLicense',
  'linkedAddress.city': 'driverAddressCity',
  'linkedAddress.complement': 'driverAddressComplement',
  'linkedAddress.district': 'driverAddressDistrict',
  'linkedAddress.number': 'driverAddressNumber',
  'linkedAddress.postalCode': 'driverAddressPostalCode',
  'linkedAddress.state': 'driverAddressState',
  'linkedAddress.street': 'driverAddressStreet',
  linkedLegalName: 'driverLinkedLegalName',
  linkedTaxId: 'driverLinkedTaxId',
  motherName: 'driverMotherName',
  name: 'driverName',
  nationality: 'driverNationality',
  phone: 'driverPhone',
  pixKey: 'driverPixKey',
  profile: 'driverProfile',
  rntrc: 'driverRntrc',
  taxId: 'driverTaxId',
}

/**
 * Campo sem rótulo conhecido não some do aviso: ele sai com o nome que a API usou. Esconder o campo
 * desconhecido devolveria o operador ao aviso genérico, que é exatamente o que este caminho conserta.
 */
export function toDriverInvalidFieldLabels(error: unknown): readonly string[] {
  return toInvalidFields(error).map((field) => LABEL_KEY_BY_FIELD[field] ?? field)
}

export function isDriverFieldLabelKey(value: string): boolean {
  return Object.values(LABEL_KEY_BY_FIELD).includes(value)
}
