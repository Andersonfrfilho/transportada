/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.5 (plan § Rótulos, D10): o momento diz **quem registra, e onde** — não a hora nem a etapa da nota.
 * O contrato monta a aba Tipos de verdade e PROCURA o rótulo no controle, na linha recolhida, no filtro e no
 * cadastro do tipo novo; todos leem a mesma chave. Os valores gravados (`separation`, `document`, `stop`,
 * `office`) não mudam. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  control,
  expandAllTypes,
  installExceptionsDouble,
  resetExceptionsDouble,
} from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

const TITLE = 'Quem registra, e onde'
const LABELS = {
  document: 'Motorista, numa nota',
  office: 'Escritório, pelo motorista',
  separation: 'Separador, no galpão',
  stop: 'Motorista, na parada',
} as const
const HINTS = {
  document: 'Na frente do cliente: o mercado devolveu dois fardos daquela NF.',
  office: 'O operador registra no painel em nome dele.',
  separation: 'Caixa amassada achada na conferência, antes de a carga sair.',
  stop: 'Sobre o lugar, sem nota: portão fechado.',
} as const
const OLD_LABELS = [
  'Em que momento pode acontecer',
  'Separação no galpão',
  'Entrega da nota',
  'Chegada à parada',
] as const

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'optional',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'optional',
    leavesDocumentBehind: false,
    moments: ['document', 'office'],
    name: 'Devolução parcial',
    notifies: false,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    installExceptionsDouble()
    try {
      await body()
    } finally {
      restoreLayout()
      for (const rendered of mounted.splice(0)) rendered.unmount()
      saved.length = 0
      resetExceptionsDouble()
    }
  }
}

async function mount(types: readonly OccurrenceType[]): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        loadStatus: 'ready',
        onRetry: () => undefined,
        onSave: (input) => saved.push(input),
        saveFeedbackKey: null,
        types,
      }),
    ),
  )
}

function pageText(): string {
  return document.body.textContent ?? ''
}

function options(): string[] {
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.textContent ?? '',
  )
}

describe('o controle do tipo aberto diz quem registra, e onde (spec 247 D10)', () => {
  test(
    'o controle tem o título novo, as pílulas e as quatro opções com o rótulo novo',
    scenario(async () => {
      await mount([buildType()])
      await expandAllTypes()

      const trigger = control(TITLE)
      expect(trigger).not.toBeNull()
      for (const old of OLD_LABELS) expect(control(old)).toBeNull()
      expect(control(`Tirar momento ${LABELS.document}`)).not.toBeNull()
      expect(control(`Tirar momento ${LABELS.office}`)).not.toBeNull()

      await click(trigger as HTMLElement)
      await waitFor(() => expect(options()).toHaveLength(4))
      const texts = options()
      for (const label of Object.values(LABELS)) {
        expect(texts.some((text) => text.includes(label))).toBe(true)
      }
      for (const old of OLD_LABELS) expect(texts.some((text) => text.includes(old))).toBe(false)
    }),
  )

  test(
    'cada momento tem a dica do exemplo à vista, e nenhum rótulo antigo sobra na tela',
    scenario(async () => {
      await mount([buildType()])
      await expandAllTypes()

      /** Dentro do bloco do tipo aberto — o cadastro do tipo novo também mostra as dicas, e não vale por ele. */
      const block = document.querySelector('section[aria-label="Quem registra, e onde"]')
      for (const hint of Object.values(HINTS)) expect(block?.textContent ?? '').toContain(hint)
      for (const old of OLD_LABELS) expect(pageText()).not.toContain(old)
    }),
  )

  test(
    'a nota de exigência de tipo misto usa os rótulos novos',
    scenario(async () => {
      await mount([buildType({ moments: ['separation', 'document'] })])
      await expandAllTypes()

      expect(pageText()).toContain(`${LABELS.document} e ${LABELS.stop}`)
      expect(pageText()).not.toContain('entrega da nota')
    }),
  )

  test(
    'a recusa de nota e parada juntas fala com os rótulos novos',
    scenario(async () => {
      await mount([buildType({ moments: ['document'] })])
      await expandAllTypes()
      await click(control(TITLE) as HTMLElement)
      const stop = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
        option.textContent?.includes(LABELS.stop),
      )
      if (stop === undefined) throw new Error('OPTION_NOT_FOUND')
      await click(stop)

      const alert = document.querySelector('[role="alert"]')?.textContent ?? ''
      expect(alert).toContain(LABELS.document)
      expect(alert).toContain(LABELS.stop)
      expect(alert).toContain('não podem estar juntas')
    }),
  )
})

describe('a linha recolhida e o filtro leem a mesma chave (spec 247 D10)', () => {
  test(
    'a linha recolhida mostra os rótulos novos dos momentos do tipo',
    scenario(async () => {
      await mount([buildType()])
      const summary = document.querySelector<HTMLElement>('button[aria-controls]')
      const text = summary?.textContent ?? ''

      expect(text).toContain(LABELS.document)
      expect(text).toContain(LABELS.office)
      for (const old of OLD_LABELS) expect(text).not.toContain(old)
    }),
  )

  test(
    'o filtro Momento tem as quatro pílulas com o mesmo rótulo do controle, inclusive o Escritório inteiro',
    scenario(async () => {
      await mount([buildType()])
      const chips = [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].map(
        (chip) => (chip.textContent ?? '').replace(/^[+✓]/u, '').trim(),
      )

      for (const label of Object.values(LABELS)) expect(chips).toContain(label)
      for (const old of OLD_LABELS) expect(chips).not.toContain(old)
      expect(chips).not.toContain('Escritório')
    }),
  )
})

describe('o cadastro do tipo novo diz o mesmo (spec 247 D10)', () => {
  test(
    'o controle de momentos do tipo novo tem o título, as opções e as dicas novos',
    scenario(async () => {
      await mount([buildType()])
      const triggers = document.querySelectorAll<HTMLElement>(`button[aria-label="${TITLE}"]`)
      expect(triggers.length).toBeGreaterThan(0)

      const creator = [...triggers].at(-1)
      await click(creator as HTMLElement)
      await waitFor(() => expect(options()).toHaveLength(4))
      for (const label of Object.values(LABELS)) {
        expect(options().some((text) => text.includes(label))).toBe(true)
      }
      for (const hint of Object.values(HINTS)) expect(pageText()).toContain(hint)
    }),
  )
})
