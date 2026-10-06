/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3e (RF11b): a busca e os filtros-pílula da aba Tipos, combináveis, como função pura.
 * Dados sintéticos.
 */
import { describe, expect, test } from 'bun:test'

import type {
  OccurrenceAttachmentOverrides,
  OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceExceptionPeople } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import {
  countActiveOccurrenceTypeFilters,
  EMPTY_OCCURRENCE_TYPE_FILTERS,
  isOccurrenceTypeFilterChipPressed,
  toggleOccurrenceTypeFilterChip,
  type OccurrenceTypeFilters,
} from '@/modules/trip/shared/occurrenceTypeFilterChips.service'
import { filterOccurrenceTypes } from '@/modules/trip/shared/occurrenceTypeFilter.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'

function buildType(overrides: Partial<OccurrenceType> & Pick<OccurrenceType, 'id' | 'name'>) {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
    ...overrides,
  } satisfies OccurrenceType
}

const REFUSAL = buildType({
  attachmentMode: 'required',
  id: 'refusal',
  moments: ['document', 'stop'],
  name: 'Recusa total',
  notifies: true,
  signatureMode: 'required',
})
const DAMAGE = buildType({ id: 'damage', moments: ['document'], name: 'Avaria na entrega' })
const SHORTAGE = buildType({
  active: false,
  id: 'shortage',
  moments: ['separation'],
  name: 'Falta no galpão',
  stage: 'separation',
})
const NO_MOMENTS_STOP = buildType({ flow: 'stop', id: 'stop-legacy', name: 'Cliente ausente' })
const TYPES = [REFUSAL, DAMAGE, SHORTAGE, NO_MOMENTS_STOP] as const

const PEOPLE: OccurrenceExceptionPeople = {
  contractors: [{ displayName: 'Indústria Aurora', id: 'contractor-1', taxId: '98765432000110' }],
  contractorsStatus: 'ready',
  recipients: [{ displayName: 'Supermercados Ponto Certo', taxId: '12345678000190' }],
  recipientsStatus: 'ready',
}

const EXCEPTIONS = new Map<string, OccurrenceAttachmentOverrides>([
  [
    'refusal',
    {
      contractorOverrides: [{ attachmentMode: 'off', contractorId: 'contractor-1' }],
      recipientOverrides: [{ attachmentMode: 'required', taxId: '12345678000190' }],
    },
  ],
  ['damage', { contractorOverrides: [], recipientOverrides: [] }],
])

function run(
  filters: Partial<OccurrenceTypeFilters>,
  exceptions: ReadonlyMap<string, OccurrenceAttachmentOverrides> | null = EXCEPTIONS,
): string[] {
  return filterOccurrenceTypes({
    context: { exceptionsByTypeId: exceptions ?? undefined, people: PEOPLE },
    filters: { ...EMPTY_OCCURRENCE_TYPE_FILTERS, ...filters },
    types: TYPES,
  }).map((type) => type.id)
}

describe('filtros da aba Tipos (RF11b)', () => {
  test('sem filtro devolve todos, na ordem', () => {
    expect(run({})).toEqual(['refusal', 'damage', 'shortage', 'stop-legacy'])
  })

  test('momento: qualquer um dos escolhidos; tipo sem `moments` lê o grupo e o fluxo', () => {
    expect(run({ moments: ['separation'] })).toEqual(['shortage'])
    expect(run({ moments: ['stop'] })).toEqual(['refusal', 'stop-legacy'])
    expect(run({ moments: ['document', 'separation'] })).toEqual(['refusal', 'damage', 'shortage'])
  })

  test('ativo e inativo', () => {
    expect(run({ activity: 'inactive' })).toEqual(['shortage'])
    expect(run({ activity: 'active' })).toEqual(['refusal', 'damage', 'stop-legacy'])
  })

  test('exigência: só `required` conta, e as escolhidas valem juntas', () => {
    expect(run({ requirements: ['photo'] })).toEqual(['refusal'])
    expect(run({ requirements: ['photo', 'signature'] })).toEqual(['refusal'])
    expect(run({ requirements: ['photo', 'items'] })).toEqual([])
    expect(run({ requirements: ['note'] })).toEqual([])
  })

  test('avisa e não avisa', () => {
    expect(run({ notification: 'notifies' })).toEqual(['refusal'])
    expect(run({ notification: 'silent' })).toEqual(['damage', 'shortage', 'stop-legacy'])
  })

  test('tem exceção: só o tipo com ao menos uma, e sem exceções carregadas nenhum casa', () => {
    expect(run({ hasException: true })).toEqual(['refusal'])
    expect(run({ hasException: true }, null)).toEqual([])
  })

  test('as pílulas se combinam entre si e com a busca', () => {
    expect(run({ activity: 'active', moments: ['document'], notification: 'notifies' })).toEqual([
      'refusal',
    ])
    expect(run({ activity: 'active', moments: ['document'], query: 'avaria' })).toEqual(['damage'])
    expect(run({ moments: ['document'], query: 'galpão' })).toEqual([])
  })

  test('busca pelo nome do tipo, sem caixa nem acento', () => {
    expect(run({ query: 'RECUSA' })).toEqual(['refusal'])
    expect(run({ query: 'ausênte' })).toEqual(['stop-legacy'])
    expect(run({ query: '  falta ' })).toEqual(['shortage'])
  })

  test('busca pelo nome de quem tem exceção, contratante ou destinatário', () => {
    expect(run({ query: 'ponto certo' })).toEqual(['refusal'])
    expect(run({ query: 'aurora' })).toEqual(['refusal'])
  })

  test('busca pelo CNPJ da exceção, com e sem máscara', () => {
    expect(run({ query: '12.345.678/0001-90' })).toEqual(['refusal'])
    expect(run({ query: '12345678000190' })).toEqual(['refusal'])
    expect(run({ query: '12345678' })).toEqual(['refusal'])
    expect(run({ query: '98.765.432/0001-10' })).toEqual(['refusal'])
    expect(run({ query: '98765432000110' })).toEqual(['refusal'])
    expect(run({ query: '11111111000111' })).toEqual([])
  })

  test('texto com número não vira CNPJ: só dígitos e máscara contam como documento', () => {
    expect(run({ query: 'ponto 12' })).toEqual([])
  })

  test('sem exceções carregadas a busca ainda acha pelo nome do tipo', () => {
    expect(run({ query: 'recusa' }, null)).toEqual(['refusal'])
    expect(run({ query: '12345678000190' }, null)).toEqual([])
  })

  test('as pílulas ligam e desligam; atividade e aviso são excludentes', () => {
    let filters = toggleOccurrenceTypeFilterChip(EMPTY_OCCURRENCE_TYPE_FILTERS, 'moment:stop')
    expect(isOccurrenceTypeFilterChipPressed(filters, 'moment:stop')).toBe(true)
    filters = toggleOccurrenceTypeFilterChip(filters, 'moment:stop')
    expect(filters).toEqual(EMPTY_OCCURRENCE_TYPE_FILTERS)

    filters = toggleOccurrenceTypeFilterChip(filters, 'activity:active')
    filters = toggleOccurrenceTypeFilterChip(filters, 'activity:inactive')
    expect(isOccurrenceTypeFilterChipPressed(filters, 'activity:active')).toBe(false)
    expect(isOccurrenceTypeFilterChipPressed(filters, 'activity:inactive')).toBe(true)
    filters = toggleOccurrenceTypeFilterChip(filters, 'activity:inactive')
    expect(filters.activity).toBe('all')

    filters = toggleOccurrenceTypeFilterChip(EMPTY_OCCURRENCE_TYPE_FILTERS, 'notification:notifies')
    filters = toggleOccurrenceTypeFilterChip(filters, 'notification:silent')
    expect(filters.notification).toBe('silent')
  })

  test('a contagem soma busca e pílulas ligadas', () => {
    expect(countActiveOccurrenceTypeFilters(EMPTY_OCCURRENCE_TYPE_FILTERS)).toBe(0)
    expect(
      countActiveOccurrenceTypeFilters({
        activity: 'active',
        hasException: true,
        moments: ['stop', 'document'],
        notification: 'all',
        query: ' x ',
        requirements: ['photo'],
      }),
    ).toBe(6)
  })
})
