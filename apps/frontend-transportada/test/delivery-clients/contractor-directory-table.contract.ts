/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 237 T1.4 (RF9, `web.md` §7): a lista de contratantes — busca por nome ou CNPJ, ordenação por
 * cabeçalho (asc → desc → neutro), filtro de situação com seleção múltipla, "limpar filtros" só com
 * critério aplicado e o estado inteiro refletido na URL. Dados sintéticos: nomes e CNPJs inventados.
 */
import { describe, expect, test } from 'bun:test'

import type { Contractor } from '../../src/modules/delivery-clients/shared/contractorDirectory.types'
import {
  applyContractorTable,
  EMPTY_CONTRACTOR_TABLE_STATE,
  hasContractorTableCriteria,
  parseContractorTableState,
  resolveReceivingBadge,
  serializeContractorTableState,
  toggleContractorSort,
  type ContractorTableState,
} from '../../src/modules/delivery-clients/shared/contractorTable.service'
import type { ReceivingProfile } from '../../src/modules/delivery-clients/shared/receivingProfile.types'

function buildContractor(overrides: Partial<Contractor>): Contractor {
  return {
    closingPeriod: 'monthly',
    displayName: 'Contratante Sintético',
    id: '00000000-0000-4000-8000-000000237001',
    notes: '',
    reportEmail: '',
    status: 'active',
    taxId: '11222333000181',
    ...overrides,
  }
}

const CONTRACTORS: readonly Contractor[] = [
  buildContractor({ displayName: 'Zeta Atacado', id: 'c-zeta', taxId: '45000000000191' }),
  buildContractor({ displayName: 'Álamo Logística', id: 'c-alamo', taxId: '11000000000102' }),
  buildContractor({
    displayName: 'Beta Distribuidora',
    id: 'c-beta',
    status: 'inactive',
    taxId: '22000000000103',
  }),
  buildContractor({ displayName: '', id: 'c-sem-nome', taxId: '33000000000104' }),
]

const NAMES = (contractors: readonly Contractor[]) => contractors.map((item) => item.id)

function stateWith(overrides: Partial<ContractorTableState>): ContractorTableState {
  return { ...EMPTY_CONTRACTOR_TABLE_STATE, ...overrides }
}

describe('ordenação por cabeçalho (web.md §7)', () => {
  test('o mesmo cabeçalho alterna asc, desc e neutro', () => {
    const ascending = toggleContractorSort({ column: 'name', current: null })
    expect(ascending).toEqual({ column: 'name', direction: 'asc' })

    const descending = toggleContractorSort({ column: 'name', current: ascending })
    expect(descending).toEqual({ column: 'name', direction: 'desc' })

    expect(toggleContractorSort({ column: 'name', current: descending })).toBeNull()
  })

  test('outro cabeçalho recomeça em asc', () => {
    expect(
      toggleContractorSort({ column: 'taxId', current: { column: 'name', direction: 'desc' } }),
    ).toEqual({ column: 'taxId', direction: 'asc' })
  })

  test('ordena por nome sem diferenciar acento nem caixa, e desc inverte', () => {
    const ascending = applyContractorTable({
      contractors: CONTRACTORS,
      state: stateWith({ sort: { column: 'name', direction: 'asc' } }),
    })
    expect(NAMES(ascending)).toEqual(['c-sem-nome', 'c-alamo', 'c-beta', 'c-zeta'])

    const descending = applyContractorTable({
      contractors: CONTRACTORS,
      state: stateWith({ sort: { column: 'name', direction: 'desc' } }),
    })
    expect(NAMES(descending)).toEqual(['c-zeta', 'c-beta', 'c-alamo', 'c-sem-nome'])
  })

  test('ordena por CNPJ e por situação', () => {
    expect(
      NAMES(
        applyContractorTable({
          contractors: CONTRACTORS,
          state: stateWith({ sort: { column: 'taxId', direction: 'asc' } }),
        }),
      ),
    ).toEqual(['c-alamo', 'c-beta', 'c-sem-nome', 'c-zeta'])

    expect(
      NAMES(
        applyContractorTable({
          contractors: CONTRACTORS,
          state: stateWith({ sort: { column: 'status', direction: 'desc' } }),
        }),
      )[0],
    ).toBe('c-beta')
  })

  test('neutro mantém a ordem da API e não muta a lista recebida', () => {
    const original = [...CONTRACTORS]
    const result = applyContractorTable({ contractors: CONTRACTORS, state: stateWith({}) })

    expect(NAMES(result)).toEqual(NAMES(original))
    expect([...CONTRACTORS]).toEqual(original)
  })
})

describe('busca por nome ou CNPJ', () => {
  test('acha pelo trecho do nome, sem diferenciar acento nem caixa', () => {
    expect(
      NAMES(
        applyContractorTable({ contractors: CONTRACTORS, state: stateWith({ query: 'ALAMO' }) }),
      ),
    ).toEqual(['c-alamo'])
  })

  test('acha pelo CNPJ, digitado com ou sem máscara', () => {
    for (const query of ['45.000.000/0001-91', '45000000000191', '4500']) {
      expect(
        NAMES(applyContractorTable({ contractors: CONTRACTORS, state: stateWith({ query }) })),
      ).toEqual(['c-zeta'])
    }
  })

  test('busca sem resposta devolve lista vazia, e espaços sozinhos não filtram', () => {
    expect(
      applyContractorTable({
        contractors: CONTRACTORS,
        state: stateWith({ query: 'inexistente' }),
      }),
    ).toEqual([])
    expect(
      applyContractorTable({ contractors: CONTRACTORS, state: stateWith({ query: '   ' }) }),
    ).toHaveLength(CONTRACTORS.length)
  })
})

describe('filtro de situação com seleção múltipla', () => {
  test('uma situação marcada filtra; as duas marcadas mostram tudo; nenhuma, tudo', () => {
    expect(
      NAMES(
        applyContractorTable({
          contractors: CONTRACTORS,
          state: stateWith({ statuses: ['inactive'] }),
        }),
      ),
    ).toEqual(['c-beta'])
    expect(
      applyContractorTable({
        contractors: CONTRACTORS,
        state: stateWith({ statuses: ['active', 'inactive'] }),
      }),
    ).toHaveLength(CONTRACTORS.length)
    expect(
      applyContractorTable({ contractors: CONTRACTORS, state: stateWith({ statuses: [] }) }),
    ).toHaveLength(CONTRACTORS.length)
  })

  test('busca, situação e ordenação combinam', () => {
    const result = applyContractorTable({
      contractors: CONTRACTORS,
      state: { query: '000', sort: { column: 'name', direction: 'asc' }, statuses: ['active'] },
    })

    expect(NAMES(result)).toEqual(['c-sem-nome', 'c-alamo', 'c-zeta'])
  })
})

describe('limpar filtros só aparece com critério aplicado', () => {
  test('estado neutro não tem critério', () => {
    expect(hasContractorTableCriteria(EMPTY_CONTRACTOR_TABLE_STATE)).toBe(false)
    expect(hasContractorTableCriteria(stateWith({ query: '  ' }))).toBe(false)
  })

  test('busca, situação ou ordenação aplicadas são critério', () => {
    expect(hasContractorTableCriteria(stateWith({ query: 'zeta' }))).toBe(true)
    expect(hasContractorTableCriteria(stateWith({ statuses: ['active'] }))).toBe(true)
    expect(
      hasContractorTableCriteria(stateWith({ sort: { column: 'status', direction: 'asc' } })),
    ).toBe(true)
  })
})

describe('o estado da lista na URL (web.md §7)', () => {
  const FULL_STATE: ContractorTableState = {
    query: 'álamo 11',
    sort: { column: 'taxId', direction: 'desc' },
    statuses: ['active', 'inactive'],
  }

  test('serializa só o que foge do padrão e mantém a aba', () => {
    expect(serializeContractorTableState({ search: '', state: EMPTY_CONTRACTOR_TABLE_STATE })).toBe(
      '?tab=contractors',
    )

    const search = serializeContractorTableState({ search: '', state: FULL_STATE })
    const parameters = new URLSearchParams(search)
    expect(parameters.get('tab')).toBe('contractors')
    expect(parameters.get('q')).toBe('álamo 11')
    expect(parameters.get('sort')).toBe('taxId')
    expect(parameters.get('dir')).toBe('desc')
    expect(parameters.get('status')).toBe('active,inactive')
  })

  test('ida e volta devolve o mesmo estado', () => {
    const search = serializeContractorTableState({ search: '', state: FULL_STATE })

    expect(parseContractorTableState(search)).toEqual(FULL_STATE)
  })

  test('mantém parâmetros alheios e remove os próprios quando o filtro some', () => {
    const withFilters = serializeContractorTableState({
      search: '?utm=x',
      state: stateWith({ query: 'zeta' }),
    })
    expect(new URLSearchParams(withFilters).get('utm')).toBe('x')

    const cleared = serializeContractorTableState({
      search: withFilters,
      state: EMPTY_CONTRACTOR_TABLE_STATE,
    })
    expect(cleared).toBe('?utm=x&tab=contractors')
  })

  test('URL inventada não quebra a tela: valor desconhecido é ignorado', () => {
    expect(
      parseContractorTableState('?tab=contractors&sort=banana&dir=up&status=ghost,active,active'),
    ).toEqual(stateWith({ statuses: ['active'] }))
    expect(parseContractorTableState('?sort=name&dir=sideways')).toEqual(
      stateWith({ sort: { column: 'name', direction: 'asc' } }),
    )
    expect(parseContractorTableState('')).toEqual(EMPTY_CONTRACTOR_TABLE_STATE)
  })
})

describe('selo de recebimento lido do perfil', () => {
  const PROFILE: ReceivingProfile = {
    arrivalReferencePattern: null,
    contractorId: 'c-1',
    deliveryDeadlineBusinessDays: 3,
    isEnabled: true,
    matchWindowDays: 15,
    previewColumnMap: null,
    previewEnabled: false,
    previewSheetName: null,
    requiresDamageCheck: false,
    separationWindowHours: 24,
    updatedAt: '2026-10-03T12:00:00.000Z',
    weightTolerancePercent: 0,
  }

  test('sem perfil é "none"; perfil ligado é "enabled"; perfil desligado é "disabled"', () => {
    expect(resolveReceivingBadge(null)).toBe('none')
    expect(resolveReceivingBadge(PROFILE)).toBe('enabled')
    expect(resolveReceivingBadge({ ...PROFILE, isEnabled: false })).toBe('disabled')
  })
})
