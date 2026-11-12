/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T1 (D2, D4c, CA01): as duas marcas do tipo de ocorrência.
 *
 * - `blocksContractorNotice`: o tipo nunca avisa a contratante. A regra é uma função só,
 *   `occurrenceTypeNeverNotifiesContractor`, lida pelos quatro pontos de aviso (cada um com o próprio contrato:
 *   `automatic-mail`/`automatic-group`, `occurrence-mail`, `occurrence-chat-mail`, `contractor-portal-message` e,
 *   no worker, `contractor-notice-block.contract.ts`). Aqui: a regra, o nome da coluna que o worker copia e o cadastro.
 * - `countsCargoOnPickupTrip`: gravado como veio no tipo sem coleta; a regra do tipo com coleta (T2, marca
 *   `createsCanhotoPickup`) mora em `canhoto-pickup.contract.ts`.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyOccurrenceTypes } from '../../src/database/trip.schema.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { toSaveOccurrenceTypeValues } from '../../src/trips/application/save-occurrence-type-values.mapper.js'
import {
  saveOccurrenceTypeWithTemplate,
  type CurrentOccurrenceTypeShape,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { occurrenceTypeNeverNotifiesContractor } from '../../src/trips/domain/occurrence-contractor-notice.policy.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'

const COMPANY = '00000000-0000-4000-8000-000000321001'
const TYPE_ID = '00000000-0000-4000-8000-000000321002'

const BASE_VALUES: SaveOccurrenceTypeValues = {
  active: true,
  emailTemplateKey: null,
  name: 'Canhoto retido pelo cliente',
  notifies: false,
  occurrenceTypeId: null,
  stage: 'delivery',
}

function putRequest(extra: Record<string, unknown>): Request {
  return new Request('http://localhost/company-settings/occurrence-types', {
    body: JSON.stringify({
      active: true,
      emailTemplateKey: null,
      flow: 'document',
      name: 'Canhoto retido pelo cliente',
      notifies: false,
      occurrenceTypeId: null,
      stage: 'delivery',
      ...extra,
    }),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

function run(params: {
  readonly stored: CurrentOccurrenceTypeShape | null
  readonly values: Partial<SaveOccurrenceTypeValues>
}) {
  const saved: SaveOccurrenceTypeValues[] = []
  const reads: string[] = []
  const promise = saveOccurrenceTypeWithTemplate({
    companyId: COMPANY,
    findCurrentType: async ({ occurrenceTypeId }) => {
      reads.push(occurrenceTypeId)
      return params.stored
    },
    save: async (values) => {
      saved.push(values)
      return { ...BASE_VALUES, id: TYPE_ID } as unknown as OccurrenceTypeRecord
    },
    templates: {
      findContractorTemplate: async () => null,
      hasActiveEmailTemplate: async () => true,
    },
    values: { ...BASE_VALUES, ...params.values },
  })
  return { promise, reads, saved }
}

const STORED_SHAPE: CurrentOccurrenceTypeShape = {
  itemsMode: 'off',
  redeliveryPolicy: 'unset',
  stage: 'delivery',
}

describe('a regra única do aviso à contratante (spec 321 D2)', () => {
  test.each([
    [{ blocksContractorNotice: true }, true],
    [{ blocksContractorNotice: false }, false],
    [{}, false],
    [{ blocksContractorNotice: undefined }, false],
  ] as const)('%j → nunca avisa: %p', (type, expected) => {
    expect(occurrenceTypeNeverNotifiesContractor(type)).toBe(expected)
  })

  test('a marca não é `notifies` nem `emails_contractor`: tipo que avisa a equipe e a contratante, marcado, não avisa a contratante', () => {
    expect(
      occurrenceTypeNeverNotifiesContractor({
        blocksContractorNotice: true,
        emailsContractor: true,
        notifies: true,
      } as { blocksContractorNotice: boolean }),
    ).toBe(true)
  })

  test('o nome e o padrão da coluna são os que o SQL do worker copia', () => {
    const columns = getTableConfig(companyOccurrenceTypes).columns
    const block = columns.find((column) => column.name === 'blocks_contractor_notice')
    const cargo = columns.find((column) => column.name === 'counts_cargo_on_pickup_trip')
    expect(block?.notNull).toBe(true)
    expect(block?.default).toBe(false)
    expect(cargo?.notNull).toBe(true)
    expect(cargo?.default).toBe(true)
  })
})

describe('o cadastro do tipo grava as duas marcas (spec 321 RF1)', () => {
  test('a fronteira aceita as duas; ausentes são "não mexa"', async () => {
    const parsed = await parseOccurrenceTypeRequest(
      putRequest({ blocksContractorNotice: true, countsCargoOnPickupTrip: false }),
    )
    expect(parsed.blocksContractorNotice).toBe(true)
    expect(parsed.countsCargoOnPickupTrip).toBe(false)

    const untouched = await parseOccurrenceTypeRequest(putRequest({}))
    expect(untouched.blocksContractorNotice).toBeUndefined()
    expect(untouched.countsCargoOnPickupTrip).toBeUndefined()
  })

  test('a fronteira recusa valor que não é booleano', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ blocksContractorNotice: 'sim' })),
    ).rejects.toMatchObject({ status: 400 })
  })

  test('o mapeamento da composição repassa as duas, sem perder campo', () => {
    const values = toSaveOccurrenceTypeValues({
      ...BASE_VALUES,
      blocksContractorNotice: true,
      countsCargoOnPickupTrip: false,
    })
    expect(values.blocksContractorNotice).toBe(true)
    expect(values.countsCargoOnPickupTrip).toBe(false)
  })

  test('criar o tipo da coleta (`true`/`false`) grava como veio', async () => {
    const { promise, saved } = run({
      stored: null,
      values: { blocksContractorNotice: true, countsCargoOnPickupTrip: false },
    })
    await promise
    expect(saved[0]?.blocksContractorNotice).toBe(true)
    expect(saved[0]?.countsCargoOnPickupTrip).toBe(false)
  })
})

describe('no tipo sem coleta, `countsCargoOnPickupTrip` não tem efeito e grava como veio (spec 321 T2)', () => {
  test('ligar de volta (`true`) um tipo sem coleta gravado com `false` é aceito', async () => {
    const { promise, saved } = run({
      stored: { ...STORED_SHAPE, countsCargoOnPickupTrip: false, createsCanhotoPickup: false },
      values: { countsCargoOnPickupTrip: true, occurrenceTypeId: TYPE_ID },
    })
    await promise
    expect(saved[0]?.countsCargoOnPickupTrip).toBe(true)
  })

  test('desligar (`false`) é sempre aceito', async () => {
    const { promise, saved } = run({
      stored: { ...STORED_SHAPE, countsCargoOnPickupTrip: true },
      values: { countsCargoOnPickupTrip: false, occurrenceTypeId: TYPE_ID },
    })
    await promise
    expect(saved[0]?.countsCargoOnPickupTrip).toBe(false)
  })
})
