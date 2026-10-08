/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * O painel compartilhado de filtro de notas renderizado a partir de um controlador falso: cada controle simples
 * aparece e chama o setter certo com o valor certo, e as capacidades escondem o que não se aplica ao hospedeiro.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import { NfeDocumentFilterPanel } from '@/modules/shared/nfe-filter/NfeDocumentFilterPanel.component'
import {
  AMOUNT_OPERATOR_SYMBOL,
  EMPTY_FILTERS,
} from '@/modules/shared/nfe-filter/nfeFilter.constant'
import type { NfeFilterPanelController } from '@/modules/shared/nfe-filter/NfeFilterPanelController.types'
import { formatTaxId } from '@/modules/shared/taxId.service'

import { click, stubVisibleLayout, typeQuantity } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

const t = i18n.getFixedT('pt-BR', 'nfeWorkspace')
const EMITTER_TAX_ID = '12345678000190'

type RecordedCall = Readonly<{ args: readonly unknown[]; setter: string }>

type FakeController = Readonly<{ calls: RecordedCall[]; controller: NfeFilterPanelController }>

function buildFakeController(
  capabilities: NfeFilterPanelController['capabilities'] = { advanced: true, unlinkedOnly: true },
): FakeController {
  const calls: RecordedCall[] = []
  function spy(setter: string): (...args: readonly unknown[]) => void {
    return (...args) => {
      calls.push({ args, setter })
    }
  }
  const controller: NfeFilterPanelController = {
    activeConditionCount: 0,
    addCondition: spy('addCondition'),
    addGroup: spy('addGroup'),
    advancedFilter: { connector: 'and', groups: [] },
    capabilities,
    cityOptions: { emitterCity: ['Recife'], recipientCity: ['Olinda'] },
    clearConditions: spy('clearConditions'),
    emitterOptions: { emitterName: ['Transportes Alfa'], emitterTaxId: [EMITTER_TAX_ID] },
    filters: EMPTY_FILTERS,
    mode: 'simple',
    removeCondition: spy('removeCondition'),
    removeGroup: spy('removeGroup'),
    saveAdvancedFilter: spy('saveAdvancedFilter'),
    setAmountOperator: spy('setAmountOperator'),
    setAmountValue: spy('setAmountValue'),
    setDateRange: spy('setDateRange'),
    setGroupConnector: spy('setGroupConnector'),
    setMode: spy('setMode'),
    setMultiFilter: spy('setMultiFilter'),
    setNumberFrom: spy('setNumberFrom'),
    setNumberTo: spy('setNumberTo'),
    setRootConnector: spy('setRootConnector'),
    setSelectFilter: spy('setSelectFilter'),
    setTextFilter: spy('setTextFilter'),
    setUnlinkedOnly: spy('setUnlinkedOnly'),
    stateOptions: { emitterState: ['PE'], recipientState: ['SP'] },
    textOptions: {
      emitterAddress: ['Rua das Flores, 10'],
      recipientAddress: ['Av. Central, 20'],
      recipientName: ['Mercado Beta'],
    },
    updateCondition: spy('updateCondition'),
  }
  return { calls, controller }
}

async function mountPanel(fake: FakeController): Promise<() => void> {
  const rendered = await renderWithQueryClient(
    createElement(NfeDocumentFilterPanel, { controller: fake.controller }),
  )
  return rendered.unmount
}

function scenario(
  body: (fake: FakeController) => Promise<void> | void,
  capabilities?: NfeFilterPanelController['capabilities'],
): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    const fake = buildFakeController(capabilities)
    const unmount = await mountPanel(fake)
    try {
      await body(fake)
    } finally {
      unmount()
      restoreLayout()
    }
  }
}

function triggerByLabel(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (found === null) throw new Error(`TRIGGER_NOT_FOUND:${label}`)
  return found
}

function optionByText(text: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (option) => (option.textContent ?? '').trim() === text,
  )
  if (found === undefined) throw new Error(`OPTION_NOT_FOUND:${text}`)
  return found
}

async function pickOption(input: { label: string; optionText: string }): Promise<void> {
  await click(triggerByLabel(input.label))
  await click(optionByText(input.optionText))
}

describe('painel compartilhado de filtro de notas', () => {
  test(
    'Sem vínculo chama setUnlinkedOnly com o valor oposto ao atual',
    scenario(async (fake) => {
      const checkbox = [...document.querySelectorAll('label')]
        .find((label) => (label.textContent ?? '').includes(t('filters.unlinkedOnly')))
        ?.querySelector('input')
      if (checkbox === null || checkbox === undefined) throw new Error('UNLINKED_NOT_FOUND')
      await click(checkbox)
      expect(fake.calls).toEqual([{ args: [false], setter: 'setUnlinkedOnly' }])
    }),
  )

  test(
    'CT-e emitido chama setSelectFilter("cteIssued", valor)',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.cteIssued'),
        optionText: t('filters.cteIssuedIssued'),
      })
      expect(fake.calls).toEqual([{ args: ['cteIssued', 'issued'], setter: 'setSelectFilter' }])
    }),
  )

  test(
    'Número de chama setNumberFrom',
    scenario(async (fake) => {
      await typeQuantity(t('documents.numberFrom'), '100')
      expect(fake.calls).toEqual([{ args: ['100'], setter: 'setNumberFrom' }])
    }),
  )

  test(
    'Número até chama setNumberTo',
    scenario(async (fake) => {
      await typeQuantity(t('documents.numberTo'), '200')
      expect(fake.calls).toEqual([{ args: ['200'], setter: 'setNumberTo' }])
    }),
  )

  test(
    'Emissão chama setDateRange ao escolher um dia',
    scenario(async (fake) => {
      await click(triggerByLabel(t('documents.fields.issuedAt')))
      const day = [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(
        (button) => (button.textContent ?? '').trim() === '15',
      )
      if (day === undefined) throw new Error('DAY_NOT_FOUND')
      await click(day)
      expect(fake.calls).toHaveLength(1)
      expect(fake.calls[0]?.setter).toBe('setDateRange')
      expect(fake.calls[0]?.args[0]).toMatch(/^\d{4}-\d{2}-15$/u)
      expect(fake.calls[0]?.args[1]).toBe('')
    }),
  )

  test(
    'operador do valor chama setAmountOperator',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.operator'),
        optionText: AMOUNT_OPERATOR_SYMBOL.gt,
      })
      expect(fake.calls).toEqual([{ args: ['gt'], setter: 'setAmountOperator' }])
    }),
  )

  test(
    'valor chama setAmountValue',
    scenario(async (fake) => {
      await typeQuantity(t('documents.fields.totalAmount'), '150,5')
      expect(fake.calls).toEqual([{ args: ['150,5'], setter: 'setAmountValue' }])
    }),
  )

  test(
    'Emitente (seleção múltipla) chama setMultiFilter("emitterName", [valor])',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.emitterName'),
        optionText: 'Transportes Alfa',
      })
      expect(fake.calls).toEqual([
        { args: ['emitterName', ['Transportes Alfa']], setter: 'setMultiFilter' },
      ])
    }),
  )

  test(
    'CNPJ do emitente (seleção múltipla) chama setMultiFilter("emitterTaxId", [valor])',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.emitterTaxId'),
        optionText: formatTaxId(EMITTER_TAX_ID),
      })
      expect(fake.calls).toEqual([
        { args: ['emitterTaxId', [EMITTER_TAX_ID]], setter: 'setMultiFilter' },
      ])
    }),
  )

  test(
    'Endereço do emitente (busca) chama setTextFilter("emitterAddress", valor)',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.emitterAddress'),
        optionText: 'Rua das Flores, 10',
      })
      expect(fake.calls).toEqual([
        { args: ['emitterAddress', 'Rua das Flores, 10'], setter: 'setTextFilter' },
      ])
    }),
  )

  test(
    'Cidade do emitente chama setSelectFilter("emitterCity", valor)',
    scenario(async (fake) => {
      await pickOption({ label: t('documents.fields.emitterCity'), optionText: 'Recife' })
      expect(fake.calls).toEqual([{ args: ['emitterCity', 'Recife'], setter: 'setSelectFilter' }])
    }),
  )

  test(
    'UF do emitente chama setSelectFilter("emitterState", valor)',
    scenario(async (fake) => {
      await pickOption({ label: t('documents.fields.emitterState'), optionText: 'PE' })
      expect(fake.calls).toEqual([{ args: ['emitterState', 'PE'], setter: 'setSelectFilter' }])
    }),
  )

  test(
    'Destinatário (busca) chama setTextFilter("recipientName", valor)',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.recipientName'),
        optionText: 'Mercado Beta',
      })
      expect(fake.calls).toEqual([
        { args: ['recipientName', 'Mercado Beta'], setter: 'setTextFilter' },
      ])
    }),
  )

  test(
    'Endereço do destinatário (busca) chama setTextFilter("recipientAddress", valor)',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.recipientAddress'),
        optionText: 'Av. Central, 20',
      })
      expect(fake.calls).toEqual([
        { args: ['recipientAddress', 'Av. Central, 20'], setter: 'setTextFilter' },
      ])
    }),
  )

  test(
    'Cidade do destinatário chama setSelectFilter("recipientCity", valor)',
    scenario(async (fake) => {
      await pickOption({ label: t('documents.fields.recipientCity'), optionText: 'Olinda' })
      expect(fake.calls).toEqual([{ args: ['recipientCity', 'Olinda'], setter: 'setSelectFilter' }])
    }),
  )

  test(
    'UF do destinatário chama setSelectFilter("recipientState", valor)',
    scenario(async (fake) => {
      await pickOption({ label: t('documents.fields.recipientState'), optionText: 'SP' })
      expect(fake.calls).toEqual([{ args: ['recipientState', 'SP'], setter: 'setSelectFilter' }])
    }),
  )

  test(
    'Situação chama setSelectFilter("status", valor)',
    scenario(async (fake) => {
      await pickOption({
        label: t('documents.fields.status'),
        optionText: t('documentStatus.authorized'),
      })
      expect(fake.calls).toEqual([{ args: ['status', 'authorized'], setter: 'setSelectFilter' }])
    }),
  )

  test(
    'com capabilities.unlinkedOnly=false o "Sem vínculo" some e o resto continua',
    scenario(
      () => {
        const text = document.body.textContent ?? ''
        expect(text.includes(t('filters.unlinkedOnly'))).toBe(false)
        expect(text.includes(t('filters.fiscalLink'))).toBe(false)
        expect(
          document.querySelectorAll(`[aria-label="${t('documents.numberFrom')}"]`),
        ).toHaveLength(1)
      },
      { advanced: true, unlinkedOnly: false },
    ),
  )

  test(
    'com capabilities.advanced=false o modo avançado some e o simples continua',
    scenario(
      () => {
        const modeBars = document.querySelectorAll(
          `[role="group"][aria-label="${t('documents.filterMode.label')}"]`,
        )
        expect(modeBars).toHaveLength(0)
        expect((document.body.textContent ?? '').includes(t('documents.filterMode.advanced'))).toBe(
          false,
        )
        expect(
          document.querySelectorAll(`[aria-label="${t('documents.numberFrom')}"]`),
        ).toHaveLength(1)
      },
      { advanced: false, unlinkedOnly: true },
    ),
  )
})
