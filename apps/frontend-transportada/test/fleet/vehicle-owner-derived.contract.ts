/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const OWNER_FIELDS_PATH = 'src/modules/fleet/components/VehicleOwnerFields.component.tsx'
const OWNER_SERVICE = '../../src/modules/fleet/shared/vehicleOwner.service'

/**
 * O proprietário do veículo agregado é a ficha do motorista, não um segundo cadastro digitado: o
 * operador escolhe a pessoa e os cinco campos do grupo do MDF-e saem dela.
 */
const DRIVER = {
  address: {
    city: 'Barrinha',
    complement: '',
    district: 'Centro',
    number: '100',
    postalCode: '14710000',
    state: 'SP',
    street: 'Rua das Palmeiras',
  },
  anttCategory: '1',
  birthDate: null,
  createdAt: '2026-08-01T12:00:00.000Z',
  email: 'motorista@example.com',
  id: '00000000-0000-4000-8000-000000000931',
  licenseExpiresAt: null,
  licenseNumber: '',
  linkedLegalName: '',
  linkedTaxId: '',
  membershipId: null,
  name: 'Joaquim Agregado',
  phone: '16999990000',
  rntrc: '12345678',
  status: 'active',
  taxId: '39053344705',
  updatedAt: '2026-08-01T12:00:00.000Z',
  version: '1',
} as const

/** Campo digitado que o grupo do proprietário não pode mais oferecer: o dado vem da ficha. */
const REMOVED_INPUTS = [
  'onChange={(ownerName)',
  'onChange={(ownerRntrc)',
  'onChange={(ownerState)',
  'onChange={(ownerTaxRegime)',
  'MDFE_OWNER_TAX_REGIME',
  'normalizeTaxId',
] as const

type DerivedOwner = Readonly<{
  ownerName: string
  ownerRntrc: string
  ownerState: string
  ownerTaxId: string
  ownerTaxRegime: string
}>

type OwnerModule = Readonly<{
  findVehicleOwnerDriver: (
    input: Readonly<{ drivers: readonly Record<string, unknown>[]; ownerTaxId: string }>,
  ) => Record<string, unknown> | undefined
  toVehicleOwnerFields: (driver: Record<string, unknown>) => DerivedOwner
}>

async function readOwnerFields(): Promise<string> {
  return await Bun.file(new URL(OWNER_FIELDS_PATH, APPLICATION_ROOT)).text()
}

async function loadOwnerModule(): Promise<OwnerModule> {
  return await loadFutureModule<OwnerModule>(OWNER_SERVICE)
}

describe('o proprietário do veículo é derivado do motorista', () => {
  test('lê nome, documento, RNTRC, UF e categoria ANTT da ficha', async () => {
    const { toVehicleOwnerFields } = await loadOwnerModule()

    expect(toVehicleOwnerFields({ ...DRIVER })).toEqual({
      ownerName: 'Joaquim Agregado',
      ownerRntrc: '12345678',
      ownerState: 'SP',
      ownerTaxId: '39053344705',
      ownerTaxRegime: '1',
    })
  })

  test('prefere a empresa vinculada quando o motorista tem uma', async () => {
    const { toVehicleOwnerFields } = await loadOwnerModule()

    expect(
      toVehicleOwnerFields({
        ...DRIVER,
        linkedLegalName: 'Agregado Transportes Ltda',
        linkedTaxId: '12ABC34501DE35',
      }),
    ).toMatchObject({
      ownerName: 'Agregado Transportes Ltda',
      ownerTaxId: '12ABC34501DE35',
    })
  })

  test('cai no nome da pessoa quando a empresa vinculada não tem razão social', async () => {
    const { toVehicleOwnerFields } = await loadOwnerModule()

    expect(
      toVehicleOwnerFields({ ...DRIVER, linkedLegalName: '', linkedTaxId: '12ABC34501DE35' }),
    ).toMatchObject({ ownerName: 'Joaquim Agregado', ownerTaxId: '12ABC34501DE35' })
  })

  test('ficha sem categoria ANTT vale TAC agregado, o padrão do formulário', async () => {
    const { toVehicleOwnerFields } = await loadOwnerModule()

    expect(toVehicleOwnerFields({ ...DRIVER, anttCategory: '' }).ownerTaxRegime).toBe('0')
  })

  test('acha o motorista por qualquer um dos dois documentos, e ignora os vazios', async () => {
    const { findVehicleOwnerDriver } = await loadOwnerModule()
    const linked = { ...DRIVER, id: 'linked', linkedTaxId: '12ABC34501DE35', taxId: '' }
    const blank = { ...DRIVER, id: 'blank', linkedTaxId: '', taxId: '' }
    const drivers = [blank, { ...DRIVER }, linked]

    expect(findVehicleOwnerDriver({ drivers, ownerTaxId: '39053344705' })?.id).toBe(DRIVER.id)
    expect(findVehicleOwnerDriver({ drivers, ownerTaxId: '12ABC34501DE35' })?.id).toBe('linked')
    expect(findVehicleOwnerDriver({ drivers, ownerTaxId: '' })).toBeUndefined()
  })

  test('o formulário do veículo não pede mais o proprietário na mão', async () => {
    const source = await readOwnerFields()

    for (const removed of REMOVED_INPUTS) expect(source).not.toContain(removed)
    expect(source).toContain('toVehicleOwnerFields')
    expect(source).toContain('styles.ownerSummary')
  })
})
