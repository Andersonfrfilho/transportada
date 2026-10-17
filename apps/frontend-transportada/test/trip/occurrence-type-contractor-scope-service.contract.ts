/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.1/T3.2: a regra pura do "Vale para" do tipo — o problema que o editor mostra (espelha a
 * recusa da API), as opções do seletor múltiplo (nome · CNPJ, inativa marcada, selecionada fora da lista
 * carregada continua visível) e o resumo do chip "Só: …".
 */
import { describe, expect, it } from 'bun:test'

import { OCCURRENCE_TEMPLATE_NONE } from '@/modules/trip/shared/occurrenceTemplate.service'
import { buildOccurrenceTypeCreateInput } from '@/modules/trip/shared/occurrenceTypeCreate.service'
import {
  buildContractorScopeOptions,
  readContractorScopeProblem,
  summarizeContractorScope,
} from '@/modules/trip/shared/occurrenceTypeContractorScope.service'

const ZARAGOZA = { displayName: 'ZARAGOZA', id: 'z', status: 'active', taxId: '12345678000195' }
const RIBER = { displayName: 'RIBER PET', id: 'r', status: 'active', taxId: '11222333000181' }
const ALFA = { displayName: 'ALFA', id: 'a', status: 'inactive', taxId: '22333444000155' }
const BETA = { displayName: 'BETA', id: 'b', status: 'active', taxId: '33444555000166' }

describe('readContractorScopeProblem (spec 270 T3.1)', () => {
  it('todas as contratantes não tem problema, com ou sem lista guardada', () => {
    expect(
      readContractorScopeProblem({ contractorIds: [], moments: ['document'], scope: 'all' }),
    ).toBeNull()
  })

  it('só estas sem nenhuma contratante é problema', () => {
    expect(
      readContractorScopeProblem({ contractorIds: [], moments: ['document'], scope: 'listed' }),
    ).toBe('empty')
  })

  it('tipo só de parada não pode ser restrito', () => {
    expect(
      readContractorScopeProblem({ contractorIds: ['z'], moments: ['stop'], scope: 'listed' }),
    ).toBe('needsDocument')
  })

  it('parada com escritório pode ser restrito: o escopo vale no lote do escritório', () => {
    expect(
      readContractorScopeProblem({
        contractorIds: ['z'],
        moments: ['stop', 'office'],
        scope: 'listed',
      }),
    ).toBeNull()
  })

  it('o problema da lista vazia vem antes do da parada', () => {
    expect(
      readContractorScopeProblem({ contractorIds: [], moments: ['stop'], scope: 'listed' }),
    ).toBe('empty')
  })
})

describe('buildContractorScopeOptions (spec 270 T3.1)', () => {
  const labels = { inactive: 'inativa' }

  it('rotula "Nome · CNPJ" para a busca achar nome e CNPJ', () => {
    const options = buildContractorScopeOptions({
      contractors: [ZARAGOZA],
      labels,
      selected: [],
    })

    expect(options).toEqual([{ label: 'ZARAGOZA · 12.345.678/0001-95', value: 'z' }])
  })

  it('a selecionada fora da lista carregada continua na lista, com o nome que a API trouxe', () => {
    const options = buildContractorScopeOptions({
      contractors: [ZARAGOZA],
      labels,
      selected: [RIBER],
    })

    expect(options.map((option) => option.value)).toEqual(['z', 'r'])
    expect(options[1]?.label).toBe('RIBER PET · 11.222.333/0001-81')
  })

  it('a inativa que está na lista aparece marcada', () => {
    const options = buildContractorScopeOptions({
      contractors: [ZARAGOZA],
      labels,
      selected: [ALFA],
    })

    expect(options.find((option) => option.value === 'a')?.label).toBe(
      'ALFA (inativa) · 22.333.444/0001-55',
    )
  })

  it('a contratante que está nas duas listas não repete', () => {
    const options = buildContractorScopeOptions({
      contractors: [ZARAGOZA, RIBER],
      labels,
      selected: [RIBER],
    })

    expect(options.map((option) => option.value)).toEqual(['z', 'r'])
  })
})

describe('summarizeContractorScope — o chip "Só: …" (spec 270 T3.2)', () => {
  it('tipo geral não tem chip', () => {
    expect(summarizeContractorScope({ contractors: [], scope: 'all' })).toBeNull()
    expect(summarizeContractorScope({ contractors: [ZARAGOZA], scope: undefined })).toBeNull()
  })

  it('com uma contratante, mostra o nome', () => {
    expect(summarizeContractorScope({ contractors: [ZARAGOZA], scope: 'listed' })).toEqual({
      fullNames: ['ZARAGOZA'],
      hiddenCount: 0,
      shownNames: ['ZARAGOZA'],
    })
  })

  it('com duas, mostra as duas', () => {
    expect(
      summarizeContractorScope({ contractors: [ZARAGOZA, RIBER], scope: 'listed' })?.shownNames,
    ).toEqual(['ZARAGOZA', 'RIBER PET'])
  })

  it('com mais de duas, mostra duas e conta o resto; o título leva todas', () => {
    expect(
      summarizeContractorScope({ contractors: [ZARAGOZA, RIBER, ALFA, BETA], scope: 'listed' }),
    ).toEqual({
      fullNames: ['ZARAGOZA', 'RIBER PET', 'ALFA', 'BETA'],
      hiddenCount: 2,
      shownNames: ['ZARAGOZA', 'RIBER PET'],
    })
  })

  it('listed sem lista (API sem os nomes) ainda avisa que é restrito', () => {
    expect(summarizeContractorScope({ contractors: undefined, scope: 'listed' })).toEqual({
      fullNames: [],
      hiddenCount: 0,
      shownNames: [],
    })
  })
})

describe('buildOccurrenceTypeCreateInput com o escopo (spec 270 T3.1)', () => {
  const DRAFT = {
    allowsMultipleItems: true,
    attachmentMode: 'off',
    contractorIds: ['z'],
    contractorScope: 'listed',
    emailTemplateKey: OCCURRENCE_TEMPLATE_NONE,
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Procedimento',
    noteMode: 'optional',
    notifies: false,
    redeliveryPolicy: 'unset',
    signatureMode: 'off',
  } as const
  const SUPPORT = {
    hasContractorScope: true,
    hasItemsMode: true,
    hasMoments: true,
    hasRequirementModes: true,
  }

  it('o tipo restrito manda escopo e lista juntos', () => {
    const input = buildOccurrenceTypeCreateInput({ draft: DRAFT, support: SUPPORT })

    expect(input.contractorScope).toBe('listed')
    expect(input.contractorIds).toEqual(['z'])
  })

  it('o tipo geral não manda nada: nasce all na API', () => {
    const input = buildOccurrenceTypeCreateInput({
      draft: { ...DRAFT, contractorIds: [], contractorScope: 'all' },
      support: SUPPORT,
    })

    expect(input).not.toHaveProperty('contractorScope')
    expect(input).not.toHaveProperty('contractorIds')
  })

  it('API anterior ao campo não recebe o escopo, mesmo restrito no rascunho', () => {
    const input = buildOccurrenceTypeCreateInput({
      draft: DRAFT,
      support: { ...SUPPORT, hasContractorScope: false },
    })

    expect(input).not.toHaveProperty('contractorScope')
  })
})
