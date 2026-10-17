/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.1 (RF1, RF2, RF5, RF10): o "Vale para" do tipo aberto — Todas as contratantes ou Só estas,
 * num seletor múltiplo das cadastradas; rascunho com Aplicar; a recusa à vista antes de gravar; travado no
 * tipo só de parada. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCreateForm } from '@/modules/trip/components/OccurrenceTypeCreateForm.component'
import { OccurrenceTypeRow } from '@/modules/trip/components/OccurrenceTypeRow.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { EMPTY_EXCEPTIONS_STATE } from '../fixtures/occurrenceExceptionsState.fixture'
import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { buttonByText, click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

const ZARAGOZA = { displayName: 'ZARAGOZA', id: 'c-z', taxId: '12345678000195' }
const RIBER = { displayName: 'RIBER PET', id: 'c-r', taxId: '11222333000181' }

const EXCEPTIONS: OccurrenceTypeExceptionsState = {
  ...EMPTY_EXCEPTIONS_STATE,
  people: { ...EMPTY_EXCEPTIONS_STATE.people, contractors: [ZARAGOZA, RIBER] },
}

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    attachmentMode: 'optional',
    contractorScope: 'all',
    contractors: [],
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Recusa total',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function withoutScope(type: OccurrenceType): OccurrenceType {
  const { contractors, contractorScope, ...rest } = type
  void [contractors, contractorScope]
  return rest
}

function scenario(type: OccurrenceType, body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      mounted.push(
        await renderWithQueryClient(
          createElement(OccurrenceTypeRow, {
            canManage: true,
            exceptions: EXCEPTIONS,
            isSaving: false,
            onSave: (input) => saved.push(input),
            templates: { options: [], status: 'ready' },
            type,
          }),
        ),
      )
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
    }
  }
}

function scopeSection(): HTMLElement {
  const section = document.querySelector<HTMLElement>('section[aria-label="Vale para"]')
  if (section === null) throw new Error('SCOPE_SECTION_NOT_FOUND')
  return section
}

function scopeTrigger(): HTMLElement {
  const trigger = scopeSection().querySelector<HTMLElement>('button[aria-label="Vale para"]')
  if (trigger === null) throw new Error('SCOPE_TRIGGER_NOT_FOUND')
  return trigger
}

function pickerTrigger(): HTMLElement | null {
  return scopeSection().querySelector<HTMLElement>('button[aria-label="Contratantes do tipo"]')
}

async function chooseOption(text: string): Promise<void> {
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(text),
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${text}`)
  await click(option)
}

async function chooseListed(): Promise<void> {
  await click(scopeTrigger())
  await chooseOption('Só estas contratantes')
}

describe('o "Vale para" do tipo aberto (spec 270 T3.1)', () => {
  test(
    'vem depois dos momentos e antes de "O que exige"',
    scenario(buildType(), async () => {
      await Promise.resolve()
      const titles = [...document.querySelectorAll('section[aria-label]')].map((section) =>
        section.getAttribute('aria-label'),
      )

      expect(titles.slice(0, 4)).toEqual([
        'Identificação',
        'Quem registra, e onde',
        'Vale para',
        'O que exige',
      ])
    }),
  )

  test(
    'API anterior ao campo não manda contractorScope: o bloco não aparece',
    scenario(withoutScope(buildType()), async () => {
      await Promise.resolve()
      expect(document.querySelector('section[aria-label="Vale para"]')).toBeNull()
    }),
  )

  test(
    'Todas as contratantes é o padrão e não mostra seletor nem pendência',
    scenario(buildType(), async () => {
      await Promise.resolve()
      expect(pickerTrigger()).toBeNull()
      expect(scopeSection().textContent).toContain('Todas as contratantes')
      expect(scopeSection().querySelector('[role="status"]')).toBeNull()
    }),
  )

  test(
    'escolher Só estas abre o seletor, recusa a lista vazia à vista e não grava',
    scenario(buildType(), async () => {
      await Promise.resolve()
      await chooseListed()

      expect(pickerTrigger()).not.toBeNull()
      expect(scopeSection().textContent).toContain('Escolha ao menos uma contratante')
      expect(buttonByText('Aplicar').disabled).toBe(true)
      expect(saved).toHaveLength(0)
    }),
  )

  test(
    'o seletor acha a contratante por nome e por CNPJ, e Aplicar grava escopo e lista juntos',
    scenario(buildType(), async () => {
      await Promise.resolve()
      await chooseListed()
      const picker = pickerTrigger()
      if (picker === null) throw new Error('PICKER_NOT_FOUND')
      await click(picker)

      const labels = [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
        (option) => option.textContent,
      )
      expect(labels).toEqual(['ZARAGOZA · 12.345.678/0001-95', 'RIBER PET · 11.222.333/0001-81'])

      await chooseOption('RIBER PET')
      await click(picker)
      expect(scopeSection().textContent).toContain('Mudança em Vale para ainda não aplicada')
      await click(buttonByText('Aplicar'))

      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorScope).toBe('listed')
      expect(saved[0]?.contractorIds).toEqual(['c-r'])
    }),
  )

  test(
    'tipo restrito mostra a lista guardada, com a inativa marcada, e voltar para Todas apaga a lista',
    scenario(
      buildType({
        contractorScope: 'listed',
        contractors: [
          { displayName: 'ZARAGOZA', id: 'c-z', status: 'active', taxId: '12345678000195' },
          { displayName: 'ALFA', id: 'c-a', status: 'inactive', taxId: '22333444000155' },
        ],
      }),
      async () => {
        await Promise.resolve()
        const picker = pickerTrigger()
        if (picker === null) throw new Error('PICKER_NOT_FOUND')
        expect(picker.textContent).toContain('2 contratantes')
        await click(picker)
        expect(
          [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
            (option) => option.textContent,
          ),
        ).toContain('ALFA (inativa) · 22.333.444/0001-55')
        await click(picker)

        await click(scopeTrigger())
        await chooseOption('Todas as contratantes')
        await click(buttonByText('Aplicar'))

        expect(saved[0]?.contractorScope).toBe('all')
        expect(saved[0]?.contractorIds).toEqual([])
      },
    ),
  )

  test(
    'Desfazer volta ao gravado e some a pendência',
    scenario(buildType(), async () => {
      await Promise.resolve()
      await chooseListed()
      await click(buttonByText('Desfazer'))

      expect(pickerTrigger()).toBeNull()
      expect(scopeSection().querySelector('[role="status"]')).toBeNull()
    }),
  )

  test(
    'tipo só de parada fica travado em Todas, com a frase do RF5',
    scenario(buildType({ flow: 'stop', moments: ['stop'] }), async () => {
      await Promise.resolve()
      expect(scopeTrigger().hasAttribute('disabled')).toBe(true)
      expect(scopeSection().textContent).toContain(
        'Na parada não há contratante: este tipo vale para todas.',
      )
    }),
  )

  test(
    'tipo com parada e escritório pode ser restrito, e a tela diz que na parada vale para todas',
    scenario(buildType({ flow: 'stop', moments: ['stop', 'office'] }), async () => {
      await Promise.resolve()
      expect(scopeTrigger().hasAttribute('disabled')).toBe(false)
      expect(scopeSection().textContent).toContain(
        'Na parada este tipo vale para todas as contratantes',
      )
    }),
  )
})

async function mountCreateForm(supportsScope: boolean): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCreateForm, {
        isSaving: false,
        onSave: (input) => saved.push(input),
        onScopeListedChange: (isListed) => listedChanges.push(isListed),
        people: EXCEPTIONS.people,
        support: {
          hasContractorScope: supportsScope,
          hasItemsMode: true,
          hasMoments: true,
          hasRequirementModes: true,
        },
        templateOptions: [],
      }),
    ),
  )
}

const listedChanges: boolean[] = []

function nameField(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]')
  if (input === null) throw new Error('NAME_NOT_FOUND')
  return input
}

async function typeNewName(value: string): Promise<void> {
  const input = nameField()
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

function createScope(): HTMLElement | null {
  return (
    [...document.querySelectorAll<HTMLElement>('p')].find(
      (node) => node.textContent === 'Vale para',
    )?.parentElement ?? null
  )
}

describe('o "Vale para" do tipo novo (spec 270 T3.1)', () => {
  test('nasce em Todas as contratantes e o cadastro não manda escopo nem lista', async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await mountCreateForm(true)
      await typeNewName('Procedimento novo')
      expect(createScope()?.textContent).toContain('Todas as contratantes')
      await click(buttonByText('Cadastrar tipo'))

      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorScope).toBeUndefined()
      expect(saved[0]?.contractorIds).toBeUndefined()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
      listedChanges.length = 0
    }
  })

  test('Só estas sem nenhuma contratante bloqueia o cadastro com o motivo à vista, e avisa o painel', async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await mountCreateForm(true)
      await typeNewName('Procedimento novo')
      const scope = createScope()
      const trigger = scope?.querySelector<HTMLElement>('button[aria-label="Vale para"]')
      if (trigger === null || trigger === undefined) throw new Error('TRIGGER_NOT_FOUND')
      await click(trigger)
      await chooseOption('Só estas contratantes')

      expect(listedChanges.at(-1)).toBe(true)
      expect(createScope()?.textContent).toContain('Escolha ao menos uma contratante')
      expect(buttonByText('Cadastrar tipo').disabled).toBe(true)

      const picker = createScope()?.querySelector<HTMLElement>(
        'button[aria-label="Contratantes do tipo"]',
      )
      if (picker === null || picker === undefined) throw new Error('PICKER_NOT_FOUND')
      await click(picker)
      await chooseOption('ZARAGOZA')
      await click(picker)
      await click(buttonByText('Cadastrar tipo'))

      expect(saved).toHaveLength(1)
      expect(saved[0]?.contractorScope).toBe('listed')
      expect(saved[0]?.contractorIds).toEqual(['c-z'])
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
      listedChanges.length = 0
    }
  })

  test('API anterior ao campo: o cadastro não oferece o "Vale para"', async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await mountCreateForm(false)
      expect(createScope()).toBeNull()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
    }
  })
})
