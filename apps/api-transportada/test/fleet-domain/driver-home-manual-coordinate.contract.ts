/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { updateDriverSchema } from '../../src/fleet/presentation/fleet-request.schema.js'

const BASE = {
  address: {
    city: 'Ribeirão Preto',
    complement: '',
    district: 'Jardim Sumaré',
    number: '480',
    postalCode: '14020210',
    state: 'SP',
    street: 'Avenida Independência',
  },
  anttCategory: '',
  securesCargo: false,
  birthCity: '',
  birthDate: null,
  birthState: '',
  email: '',
  expectedVersion: '1',
  fatherName: '',
  firstLicenseAt: null,
  identityDocument: '',
  identityDocumentIssuer: '',
  identityDocumentState: '',
  licenseCategory: '',
  licenseExpiresAt: null,
  licenseIssuedCity: '',
  licenseIssuedState: '',
  licenseNumber: '',
  linkedAddress: {
    city: '',
    complement: '',
    district: '',
    number: '',
    postalCode: '',
    state: '',
    street: '',
  },
  linkedLegalName: '',
  linkedTaxId: '',
  membershipId: null,
  motherName: '',
  pixKey: '',
  pixKeyType: '',
  rntrc: '',
  name: 'Adalberto Rocha',
  nationality: '',
  phone: '',
  status: 'active',
  taxId: '31820947016',
} as const

describe('a coordenada corrigida à mão na ficha do motorista (spec 097 D6)', () => {
  /** O alfinete movido chega como par, e sai com sete casas — a escala da coluna. */
  test('aceita a coordenada e a normaliza na escala do banco', () => {
    const parsed = updateDriverSchema.parse({
      ...BASE,
      homeCoordinate: { latitude: -21.1834475, longitude: -47.8034145 },
    })

    expect(parsed.homeCoordinate).toEqual({
      latitude: '-21.1834475',
      longitude: '-47.8034145',
    })
  })

  /**
   * ⚠️ **Ausente é "não mexeram nela", nunca "apague".** A ficha é salva inteira a cada edição, e um
   * `undefined` lido como ordem de apagar destruiria a coordenada da busca automática toda vez que
   * alguém corrigisse o telefone.
   */
  test('omitir a coordenada é silêncio, não ordem de apagar', () => {
    expect(updateDriverSchema.parse(BASE).homeCoordinate).toBeUndefined()
  })

  /**
   * ⚠️ A caixa é a do Brasil continental, a mesma do CHECK do banco: **coordenada trocada de ordem
   * cai fora dela** e é recusada na fronteira, não descoberta no mapa. Sertãozinho invertida vai
   * parar no Oceano Índico, e o número continua parecendo coordenada.
   */
  test('recusa coordenada fora do Brasil, que é onde a inversão aparece', () => {
    expect(() =>
      updateDriverSchema.parse({
        ...BASE,
        homeCoordinate: { latitude: -47.8034145, longitude: -21.1834475 },
      }),
    ).toThrow()
  })

  /** Meia coordenada não existe: o objeto tem as duas metades ou não vem. */
  test('recusa o par pela metade', () => {
    expect(() =>
      updateDriverSchema.parse({ ...BASE, homeCoordinate: { latitude: -21.18 } }),
    ).toThrow()
  })
})
