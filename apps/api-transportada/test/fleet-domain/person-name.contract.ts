/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O nome tem duas grafias de propósito: o banco guarda a canônica em minúscula e quem lê recebe a
 * do nome. As duas moram no mesmo serviço, e a tabela de casos abaixo é a mesma que o frontend
 * repete em `test/shared/person-name.contract.ts` — a paridade é comportamento, não diff de texto.
 */
import { describe, expect, test } from 'bun:test'

import type { fleetDrivers } from '../../src/database/fleet.schema.js'
import { mapDriver, toDriverColumns } from '../../src/fleet/infrastructure/fleet.mapper.js'
import type { FleetDriverInput } from '../../src/fleet/application/fleet.port.js'
import {
  PERSON_NAME_CONNECTIVES,
  toDisplayPersonName,
  toStoredPersonName,
} from '../../src/shared/person-name.service.js'

type DriverRecord = typeof fleetDrivers.$inferSelect

const TIMESTAMP = new Date('2026-08-21T12:00:00.000Z')

const RECORD: DriverRecord = {
  anttCategory: '',
  birthCity: '',
  birthDate: null,
  birthState: '',
  city: '',
  companyId: '00000000-0000-4000-8000-000000000901',
  complement: '',
  createdAt: TIMESTAMP,
  district: '',
  email: '',
  fatherName: '',
  id: '00000000-0000-4000-8000-000000000921',
  licenseCategory: '',
  firstLicenseAt: null,
  identityDocument: '',
  identityDocumentIssuer: '',
  identityDocumentState: '',
  licenseExpiresAt: null,
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
  linkedCity: '',
  linkedComplement: '',
  linkedDistrict: '',
  linkedLegalName: '',
  linkedNumber: '',
  linkedPostalCode: '',
  linkedState: '',
  linkedStreet: '',
  linkedTaxId: '',
  membershipId: null,
  motherName: '',
  name: 'josé da silva',
  nationality: '',
  number: '',
  phone: '',
  pixKey: '',
  pixKeyType: '',
  postalCode: '',
  rntrc: '',
  state: '',
  status: 'active',
  street: '',
  taxId: '12345678901',
  updatedAt: TIMESTAMP,
  version: 1n,
}

const EMPTY_ADDRESS = {
  city: '',
  complement: '',
  district: '',
  number: '',
  postalCode: '',
  state: '',
  street: '',
} as const

const DRIVER_INPUT: FleetDriverInput = {
  address: EMPTY_ADDRESS,
  linkedAddress: EMPTY_ADDRESS,
  anttCategory: '',
  birthCity: '',
  birthDate: null,
  birthState: '',
  email: '',
  fatherName: 'ANTÔNIO DA SILVA',
  licenseCategory: '',
  firstLicenseAt: null,
  identityDocument: '',
  identityDocumentIssuer: '',
  identityDocumentState: '',
  licenseExpiresAt: null,
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
  linkedLegalName: '',
  linkedTaxId: '',
  membershipId: null,
  motherName: 'MARIA DOS SANTOS',
  name: 'José da Silva',
  nationality: '',
  phone: '',
  pixKey: '',
  pixKeyType: '',
  rntrc: '',
  taxId: '12345678901',
}

/** Tabela compartilhada com o frontend: mudou um caso aqui, mude lá. */
const DISPLAY_CASES: readonly (readonly [string, string])[] = [
  ['', ''],
  ['josé', 'José'],
  ['JOSÉ DA SILVA', 'José da Silva'],
  ['maria dos santos e souza', 'Maria dos Santos e Souza'],
  ['ANA PAULA', 'Ana Paula'],
  // Ligação no começo do campo de sobrenome continua minúscula: `Da Silva` não é grafia de nome
  ['da silva', 'da Silva'],
  ["d'ávila", "D'Ávila"],
  ['silva-souza', 'Silva-Souza'],
  // O espaço sobrevive porque a função corre a cada tecla, no meio da digitação
  ['ana ', 'Ana '],
  ['ana  paula', 'Ana  Paula'],
]

describe('person name contract', () => {
  test('writes the display spelling the operator reads', () => {
    for (const [input, expected] of DISPLAY_CASES) {
      expect(toDisplayPersonName(input)).toBe(expected)
    }
  })

  /** Grafia é idempotente: aplicar de novo no que já está grafado não muda nada. */
  test('leaves an already spelled name untouched', () => {
    for (const [, expected] of DISPLAY_CASES) {
      expect(toDisplayPersonName(expected)).toBe(expected)
    }
  })

  test('keeps every connective in lower case', () => {
    for (const connective of PERSON_NAME_CONNECTIVES) {
      expect(toDisplayPersonName(`joão ${connective} souza`)).toBe(`João ${connective} Souza`)
    }
  })

  /** Espaço sobrando e caixa alta viram uma forma só — senão a busca por nome enxerga dois nomes. */
  test('reduces the stored name to one canonical form', () => {
    expect(toStoredPersonName('  José   da  Silva ')).toBe('josé da silva')
    expect(toStoredPersonName('JOSÉ DA SILVA')).toBe('josé da silva')
    expect(toStoredPersonName('josé da silva')).toBe('josé da silva')
    expect(toStoredPersonName('')).toBe('')
  })

  test('stores the canonical form and reads back the display one', () => {
    expect(toDriverColumns(DRIVER_INPUT).name).toBe('josé da silva')
    expect(mapDriver(RECORD).name).toBe('José da Silva')
  })
})
