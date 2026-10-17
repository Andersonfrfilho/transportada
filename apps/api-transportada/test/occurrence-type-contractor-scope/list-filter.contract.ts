/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.4 (ADR-0107, D4/D5/R5/R7): as listas de tipos de rua oferecem o tipo `listed` só na nota
 * da contratante da lista; sem nota, só `all`; a parada ignora o escopo; o `contractorId` da query
 * nunca decide o escopo; e o DTO de rua não carrega escopo nem contratantes.
 */
import { describe, expect, test } from 'bun:test'

import {
  listFieldOccurrenceTypes,
  selectFieldOccurrenceTypes,
} from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'

const COMPANY = '00000000-0000-4000-8000-000000000001'
const ZARAGOZA = '11111111-1111-4111-8111-111111111111'
const RIBER = '22222222-2222-4222-8222-222222222222'

function type(overrides: Partial<OccurrenceTypeRecord> & { readonly id: string }) {
  return {
    active: true,
    allowsMultipleItems: true,
    emailTemplateKey: null,
    moments: ['document', 'office'],
    name: overrides.id,
    notifies: false,
    stage: 'delivery',
    ...overrides,
  } satisfies OccurrenceTypeRecord
}

const GENERAL = type({ id: 'general' })
const ZARAGOZA_ONLY = type({ contractorIds: [ZARAGOZA], contractorScope: 'listed', id: 'zaragoza' })
const STOP_AND_OFFICE = type({
  contractorIds: [ZARAGOZA],
  contractorScope: 'listed',
  flow: 'stop',
  id: 'stop-office',
  moments: ['stop', 'office'],
  stage: 'delivery',
})
const STOP_ONLY = type({ flow: 'stop', id: 'stop-only', moments: ['stop'] })
const TYPES = [GENERAL, ZARAGOZA_ONLY, STOP_AND_OFFICE, STOP_ONLY]

function ids(types: readonly OccurrenceTypeRecord[]): readonly string[] {
  return types.map((candidate) => candidate.id)
}

describe('spec 270 T2.4: selectFieldOccurrenceTypes com o escopo de contratantes', () => {
  test('a nota da contratante da lista recebe o geral e o dela', () => {
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'document',
          noteContractorIds: [ZARAGOZA],
          types: TYPES,
        }),
      ),
    ).toEqual(['general', 'zaragoza'])
  })

  test('a nota de outra contratante não recebe o tipo restrito', () => {
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'document',
          noteContractorIds: [RIBER],
          types: TYPES,
        }),
      ),
    ).toEqual(['general'])
  })

  test('a nota sem contratante e a lista sem nota só recebem o geral (D4)', () => {
    expect(
      ids(
        selectFieldOccurrenceTypes({ moment: 'document', noteContractorIds: [null], types: TYPES }),
      ),
    ).toEqual(['general'])
  })

  test('várias notas oferecem a interseção: todas as contratantes precisam estar na lista (D5)', () => {
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'office',
          noteContractorIds: [ZARAGOZA, ZARAGOZA],
          types: TYPES,
        }),
      ),
    ).toEqual(['general', 'zaragoza', 'stop-office'])
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'office',
          noteContractorIds: [ZARAGOZA, RIBER],
          types: TYPES,
        }),
      ),
    ).toEqual(['general'])
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'office',
          noteContractorIds: [ZARAGOZA, null],
          types: TYPES,
        }),
      ),
    ).toEqual(['general'])
  })

  test('a parada ignora o escopo: o tipo stop+office restrito sai no momento stop para qualquer nota', () => {
    expect(
      ids(selectFieldOccurrenceTypes({ moment: 'stop', noteContractorIds: [RIBER], types: TYPES })),
    ).toEqual(['stop-office', 'stop-only'])
  })

  test('a lista do motorista (nota e parada) junta os dois momentos, cada um com a sua regra', () => {
    expect(ids(selectFieldOccurrenceTypes({ noteContractorIds: [RIBER], types: TYPES }))).toEqual([
      'general',
      'stop-office',
      'stop-only',
    ])
  })

  test('sem noteContractorIds o filtro de escopo não se aplica (leitura em lote interna)', () => {
    expect(ids(selectFieldOccurrenceTypes({ moment: 'document', types: TYPES }))).toEqual([
      'general',
      'zaragoza',
    ])
  })

  test('tipo sem escopo no registro (dublê de teste) vale como all', () => {
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'document',
          noteContractorIds: [RIBER],
          types: [type({ id: 'legacy' })],
        }),
      ),
    ).toEqual(['legacy'])
  })

  test('tipo listed com a lista vazia não vale para ninguém', () => {
    expect(
      ids(
        selectFieldOccurrenceTypes({
          moment: 'document',
          noteContractorIds: [ZARAGOZA],
          types: [type({ contractorIds: [], contractorScope: 'listed', id: 'empty' })],
        }),
      ),
    ).toEqual([])
  })
})

describe('spec 270 T2.4: listFieldOccurrenceTypes (a lista de rua)', () => {
  const repository = {
    async listOccurrenceTypes() {
      return TYPES
    },
  }

  test('sem nota, só o geral — o contractorId da query nunca libera o tipo restrito (R5)', async () => {
    const withoutNote = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      moment: 'document',
      repository,
    })
    const withQueryContractor = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      contractorId: ZARAGOZA,
      moment: 'document',
      repository,
    })

    expect(withoutNote.map((candidate) => candidate.id)).toEqual(['general'])
    expect(withQueryContractor.map((candidate) => candidate.id)).toEqual(['general'])
  })

  test('com a contratante lida da nota pelo servidor, o tipo restrito aparece', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      moment: 'document',
      noteContractorIds: [ZARAGOZA],
      repository,
    })

    expect(types.map((candidate) => candidate.id)).toEqual(['general', 'zaragoza'])
  })

  test('o DTO de rua nunca carrega escopo, lista nem contratantes (R7)', async () => {
    const types = await listFieldOccurrenceTypes({
      companyId: COMPANY,
      moment: 'document',
      noteContractorIds: [ZARAGOZA],
      repository,
    })

    for (const dto of types) {
      expect(Object.keys(dto)).not.toContain('contractorScope')
      expect(Object.keys(dto)).not.toContain('contractorIds')
      expect(Object.keys(dto)).not.toContain('contractors')
    }
  })
})

describe('spec 270: a prévia de resolução vale como numa nota da contratante', () => {
  test('o tipo listed aparece na prévia da contratante da lista e some na das outras', async () => {
    const { readSettingsResolution } = await import(
      '../../src/trips/application/read-settings-resolution.use-case.js'
    )
    const port = (types: readonly OccurrenceTypeRecord[]) =>
      ({
        deliveryProof: {
          listContractorOverrides: async () => [],
          listOverrides: async () => [],
          readSettings: async () => ({ photo: 'off' }),
        },
        occurrenceTypeOverrides: {
          listOverridesForTypes: async () => ({ contractorOverrides: [], recipientOverrides: [] }),
        },
        occurrenceTypes: { listOccurrenceTypes: async () => types },
      }) as never
    const read = async (contractorId: string) =>
      (
        await readSettingsResolution({
          companyId: COMPANY,
          contractorId,
          port: port(TYPES),
          recipientTaxId: undefined,
        } as never)
      ).occurrenceTypes.map((entry) => entry.id)

    expect(await read(ZARAGOZA)).toContain('zaragoza')
    expect(await read(RIBER)).not.toContain('zaragoza')
  })
})
