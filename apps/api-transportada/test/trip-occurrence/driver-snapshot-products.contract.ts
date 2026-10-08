/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.6 (RF11): o snapshot do motorista traz os produtos de cada nota e o tipo efetivo com os
 * campos novos. A conta é a do servidor (`resolveDocumentProductPricing`); o aparelho só a espelha.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveFieldOccurrenceTypes,
  type FieldOccurrenceTypeOverrides,
} from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import {
  readSettingsResolution,
  type SettingsResolutionPort,
} from '../../src/trips/application/read-settings-resolution.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  buildDriverDocumentProducts,
  refineDeclaredAmountScopeForDocument,
  type DriverDocumentProductRow,
} from '../../src/trips/domain/driver-document-products.policy.js'

const TYPE_ID = '00000000-0000-4000-8000-0000000000a1'
const CONTRACTOR = '00000000-0000-4000-8000-0000000000c1'
/** O teto de bytes de `products` de uma nota: o plano manda paginar acima de 256 KiB por viagem. */
const NOTE_PRODUCTS_BYTE_LIMIT = 100_000
const BIGGEST_PLAUSIBLE_NOTE_ITEMS = 300

function row(overrides: Partial<DriverDocumentProductRow>): DriverDocumentProductRow {
  return {
    code: 'P1',
    commercialUnit: 'CX',
    description: 'Biscoito',
    ordinal: 1,
    quantity: '3.0000',
    unitValue: '19.9950',
    ...overrides,
  }
}

function type(overrides: Partial<OccurrenceTypeRecord>): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    declaredAmountLabel: 'Valor pago',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'item',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: TYPE_ID,
    itemsMinimumCount: null,
    itemsMode: 'optional',
    name: 'Qualquer nome',
    noteMode: 'off',
    notifies: false,
    photoMinimumCount: 1,
    redeliveryPolicy: 'unset',
    referenceNumberLabel: 'Número da NFD',
    referenceNumberMode: 'required',
    signatureMode: 'off',
    stage: 'delivery',
    ...overrides,
  } as OccurrenceTypeRecord
}

describe('os produtos da nota no snapshot do motorista (spec 247 T4.6)', () => {
  test('um produto por código, na ordem da nota, com o preço da linha de menor ordinal', () => {
    const products = buildDriverDocumentProducts([
      row({
        code: 'P3',
        commercialUnit: 'FD',
        description: 'Fardo B',
        ordinal: 4,
        quantity: '1.0000',
        unitValue: '12.0000',
      }),
      row({ code: 'P1', ordinal: 1 }),
      row({
        code: 'P3',
        commercialUnit: 'FD',
        description: 'Fardo A',
        ordinal: 3,
        quantity: '1.0000',
        unitValue: '10.0000',
      }),
    ])

    expect(products).toEqual([
      {
        code: 'P1',
        description: 'Biscoito',
        hasVaryingUnitValue: false,
        quantity: '3.0000',
        unit: 'CX',
        unitValue: '19.9950',
      },
      {
        code: 'P3',
        description: 'Fardo A',
        hasVaryingUnitValue: true,
        quantity: '2.0000',
        unit: 'FD',
        unitValue: '10.0000',
      },
    ])
  })

  test('nota sem produto é lista vazia, nunca ausente', () => {
    expect(buildDriverDocumentProducts([])).toEqual([])
  })

  test('o código é comparado sem espaço nas pontas, como a ocorrência o aponta', () => {
    const products = buildDriverDocumentProducts([
      row({ code: ' P1', ordinal: 1, quantity: '1.0000' }),
      row({ code: 'P1 ', ordinal: 2, quantity: '2.0000' }),
    ])

    expect(products).toHaveLength(1)
    expect(products[0]).toMatchObject({
      code: 'P1',
      hasVaryingUnitValue: false,
      quantity: '3.0000',
    })
  })

  test('a maior nota plausível (300 itens, descrições longas) cabe no teto de bytes', () => {
    const rows = Array.from({ length: BIGGEST_PLAUSIBLE_NOTE_ITEMS }, (_, index) =>
      row({
        code: `COD-${String(index + 1).padStart(6, '0')} ${index % 7}`,
        description:
          `PRODUTO DE DESCRIÇÃO LONGA PARA A MEDIÇÃO DO SNAPSHOT ${index + 1} – CAIXA COM 12 UNIDADES 500G`.padEnd(
            120,
            'X',
          ),
        ordinal: index + 1,
        quantity: '1250.0000',
        unitValue: '1234.5678',
      }),
    )
    const bytes = new TextEncoder().encode(JSON.stringify(buildDriverDocumentProducts(rows))).length

    expect(bytes).toBeLessThan(NOTE_PRODUCTS_BYTE_LIMIT)
  })
})

describe('o tipo efetivo do snapshot com os campos novos (spec 247 T4.6)', () => {
  test('publica número, valor pago, escopo e rótulos do tipo, com os modos já resolvidos pela exceção', () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: [
        {
          attachmentMode: 'off',
          contractorId: CONTRACTOR,
          declaredAmountMode: 'required',
          occurrenceTypeId: TYPE_ID,
          referenceNumberMode: 'optional',
        },
      ],
      recipientOverrides: [],
    }

    const [effective] = resolveFieldOccurrenceTypes({
      contractorId: CONTRACTOR,
      moment: 'document',
      overrides,
      recipientTaxId: '',
      types: [type({})],
    })

    expect(effective).toMatchObject({
      declaredAmountLabel: 'Valor pago',
      declaredAmountMode: 'required',
      declaredAmountScope: 'item',
      referenceNumberLabel: 'Número da NFD',
      referenceNumberMode: 'optional',
    })
  })

  test('o escopo publicado é o efetivo: Produtos desligado pela exceção leva o valor pago à ocorrência', () => {
    const overrides: FieldOccurrenceTypeOverrides = {
      contractorOverrides: [
        {
          attachmentMode: 'off',
          contractorId: CONTRACTOR,
          itemsMinimumCount: null,
          itemsMode: 'off',
          occurrenceTypeId: TYPE_ID,
        },
      ],
      recipientOverrides: [],
    }

    const [effective] = resolveFieldOccurrenceTypes({
      contractorId: CONTRACTOR,
      moment: 'document',
      overrides,
      recipientTaxId: '',
      types: [type({ declaredAmountScope: 'item', itemsMode: 'required' })],
    })

    expect(effective?.itemsMode).toBe('off')
    expect(effective?.declaredAmountScope).toBe('occurrence')
    expect(effective?.declaredAmountMode).toBe('optional')
  })

  test('nota sem produto também leva o valor pago à ocorrência; o escopo da ocorrência não muda', () => {
    const [itemScoped] = resolveFieldOccurrenceTypes({ moment: 'document', types: [type({})] })
    const [occurrenceScoped] = resolveFieldOccurrenceTypes({
      moment: 'document',
      types: [type({ declaredAmountScope: 'occurrence' })],
    })
    if (itemScoped === undefined || occurrenceScoped === undefined)
      throw new Error('EXPECTED_TYPES')

    expect(
      refineDeclaredAmountScopeForDocument({ productCount: 0, type: itemScoped })
        .declaredAmountScope,
    ).toBe('occurrence')
    expect(
      refineDeclaredAmountScopeForDocument({ productCount: 2, type: itemScoped })
        .declaredAmountScope,
    ).toBe('item')
    expect(
      refineDeclaredAmountScopeForDocument({ productCount: 2, type: occurrenceScoped })
        .declaredAmountScope,
    ).toBe('occurrence')
  })
})

const SETTINGS_RESOLUTION_GOLDEN_URL = new URL(
  '../fixtures/settings-resolution.golden.json',
  import.meta.url,
)

const VERIFICATION_PROOF = {
  canhotoOcrEnabled: false,
  cargo: 'off',
  cargoMinimumCount: 1,
  latePenaltyPoints: 5,
  missingAfterHours: 24,
  missingPenaltyPoints: 10,
  photo: 'optional',
  proofRadiusMeters: 300,
  proofWindowMinutes: 60,
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

describe('a verificação com os campos novos é o JSON de referência dos parsers (spec 247 T4.6)', () => {
  test('o tipo resolvido leva os onze campos e a camada de cada um', async () => {
    const port: SettingsResolutionPort = {
      deliveryProof: {
        listContractorOverrides: async () => [],
        listOverrides: async () => [],
        readSettings: async () => VERIFICATION_PROOF,
      },
      occurrenceTypeOverrides: {
        listOverridesForTypes: async () => ({
          contractorOverrides: [
            {
              attachmentMode: 'off',
              contractorId: CONTRACTOR,
              declaredAmountMode: 'required',
              occurrenceTypeId: TYPE_ID,
              referenceNumberMode: 'optional',
            },
          ],
          recipientOverrides: [],
        }),
      },
      occurrenceTypes: {
        listOccurrenceTypes: async () => [type({ iconName: 'money' })],
      },
    }

    const result = await readSettingsResolution({
      companyId: '00000000-0000-4000-8000-000000000001',
      contractorId: CONTRACTOR,
      port,
      recipientTaxId: '12345678000190',
    })

    const golden = (await Bun.file(SETTINGS_RESOLUTION_GOLDEN_URL).json()) as unknown
    expect(JSON.parse(JSON.stringify(result))).toEqual(golden as Record<string, unknown>)
  })
})

const FIXTURE_COPIES = [
  ['driver-snapshot-document.golden.json', 'frontend-driver'],
  ['driver-snapshot-document.golden.json', 'frontend-transportada'],
  ['settings-resolution.golden.json', 'frontend-transportada'],
  ['occurrence-detail-values.golden.json', 'frontend-transportada'],
] as const

describe('os JSONs de referência são os mesmos nas apps (spec 247 T4.6, T7.2 R2)', () => {
  test.each(FIXTURE_COPIES)('%s na %s é igual ao da API', async (name, app) => {
    const own = await Bun.file(new URL(`../fixtures/${name}`, import.meta.url)).text()
    const copy = await Bun.file(
      new URL(`../../../${app}/test/fixtures/${name}`, import.meta.url),
    ).text()

    expect(copy).toBe(own)
  })
})
