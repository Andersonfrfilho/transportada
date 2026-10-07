/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.1 (RF1, RF3, D8): as linhas "Número do documento do cliente" e "Valor pago" do tipo no
 * mesmo seletor de três estados, o rótulo e o escopo editáveis, a regra do 422
 * `OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS` impedida na tela, e as duas exceções "Igual ao tipo".
 * O contrato monta o painel de verdade e procura o que cada controle mostra. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type {
  OccurrenceAttachmentOverridesByType,
  OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import { resolveTripFeedbackKey } from '@/modules/trip/shared/tripFeedback.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  buildDeliveryClient,
  chooseFrom,
  control,
  exceptionControls,
  exceptionDouble,
  expandAllTypes,
  installExceptionsDouble,
  resetExceptionsDouble,
} from './occurrenceTypesPanelHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const saved: OccurrenceTypeSaveInput[] = []
const mounted: { unmount: () => void }[] = []

const REFERENCE_LABEL = 'Número do documento do cliente'
const AMOUNT_LABEL = 'Valor pago'
const AMOUNT_SCOPE_LABEL = 'Onde se digita o valor pago'
const REFERENCE_TEXT_LABEL = 'Rótulo do número na tela de registro'
const AMOUNT_TEXT_LABEL = 'Rótulo do valor na tela de registro'
const ITEMS_LABEL = 'Produtos'

function buildType(overrides: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    ...OCCURRENCE_REQUIREMENT_DEFAULTS,
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'required',
    declaredAmountLabel: 'Valor pago pela loja',
    declaredAmountMode: 'optional',
    declaredAmountScope: 'item',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: 'type-1',
    itemsMode: 'required',
    leavesDocumentBehind: false,
    moments: ['document'],
    name: 'Devolução parcial',
    notifies: false,
    redeliveryPolicy: 'blocked',
    referenceNumberLabel: 'Número da NFD',
    referenceNumberMode: 'required',
    stage: 'delivery',
    ...overrides,
  }
}

const BATCH: OccurrenceAttachmentOverridesByType = [
  {
    contractorOverrides: [
      {
        attachmentMode: 'optional',
        contractorId: 'contractor-1',
        declaredAmountMode: 'required',
        itemsMinimumCount: null,
        itemsMode: null,
        noteMode: null,
        photoMinimumCount: null,
        referenceNumberMode: null,
        signatureMode: null,
      },
    ],
    occurrenceTypeId: 'type-1',
    recipientOverrides: [],
  },
]

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    installExceptionsDouble({
      byType: BATCH,
      contractors: [
        { displayName: 'Spani Alimentos', id: 'contractor-1', taxId: '12345678000190' },
      ],
    })
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

async function mount(type: OccurrenceType): Promise<void> {
  mounted.push(
    await renderWithQueryClient(
      createElement(OccurrenceTypeCatalogPanel, {
        canManage: true,
        isSaving: false,
        onSave: (input) => saved.push(input),
        saveFeedbackKey: null,
        types: [type],
      }),
    ),
  )
  await waitFor(() => expect(exceptionDouble.batchCalls).toBeGreaterThan(0))
  await expandAllTypes()
}

function shows(label: string, text: string): boolean {
  return control(label)?.textContent?.includes(text) === true
}

function textInput(label: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
}

async function leaveWith(input: HTMLInputElement, value: string): Promise<void> {
  const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    valueDescriptor?.set?.call(input, value)
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await Promise.resolve()
  })
}

function alertText(): string {
  return document.querySelector('[role="alert"]')?.textContent ?? ''
}

function pick(label: string, option: string): Promise<void> {
  const trigger = control(label)
  if (trigger === null) throw new Error(`CONTROL_NOT_FOUND:${label}`)
  return chooseFrom(trigger, option)
}

const RECORD_KEYS = [
  'declaredAmountLabel',
  'declaredAmountMode',
  'declaredAmountScope',
  'referenceNumberLabel',
  'referenceNumberMode',
] as const

describe('as duas linhas do registro no bloco de exigências (spec 247 RF3)', () => {
  test(
    'tipo de nota mostra número e valor pago com o modo gravado, o rótulo e onde se digita',
    scenario(async () => {
      await mount(buildType())
      expect(shows(REFERENCE_LABEL, 'Obrigatório')).toBe(true)
      expect(shows(AMOUNT_LABEL, 'Opcional')).toBe(true)
      expect(shows(AMOUNT_SCOPE_LABEL, 'Por linha de produto')).toBe(true)
      expect(textInput(REFERENCE_TEXT_LABEL)?.value).toBe('Número da NFD')
      expect(textInput(AMOUNT_TEXT_LABEL)?.value).toBe('Valor pago pela loja')
      expect(textInput(REFERENCE_TEXT_LABEL)?.maxLength).toBe(40)
    }),
  )

  test(
    'API sem os campos, tipo só de parada e tipo de galpão não oferecem as linhas',
    scenario(async () => {
      const { declaredAmountMode, referenceNumberMode, ...rest } = buildType()
      void declaredAmountMode
      void referenceNumberMode
      await mount(rest)
      expect(control(REFERENCE_LABEL)).toBeNull()
      expect(control(AMOUNT_LABEL)).toBeNull()
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ flow: 'stop', moments: ['stop'] }))
      expect(control(REFERENCE_LABEL)).toBeNull()
      expect(control(AMOUNT_LABEL)).toBeNull()
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ moments: ['separation'], stage: 'separation' }))
      expect(control(REFERENCE_LABEL)).toBeNull()
      expect(control(AMOUNT_LABEL)).toBeNull()
    }),
  )

  test(
    'o escritório sozinho também mostra as linhas: é lá que a correção completa o número',
    scenario(async () => {
      await mount(buildType({ moments: ['office'] }))
      expect(control(REFERENCE_LABEL)).not.toBeNull()
      expect(control(AMOUNT_LABEL)).not.toBeNull()
    }),
  )
})

describe('cada troca grava só o que mudou (RF1, RF4)', () => {
  test(
    'trocar o número grava só referenceNumberMode; o valor, só declaredAmountMode; o escopo, só declaredAmountScope',
    scenario(async () => {
      await mount(buildType())
      await pick(REFERENCE_LABEL, 'Opcional')
      expect(saved[0]?.referenceNumberMode).toBe('optional')
      await pick(AMOUNT_LABEL, 'Obrigatório')
      expect(saved[1]?.declaredAmountMode).toBe('required')
      await pick(AMOUNT_SCOPE_LABEL, 'Um só, pela ocorrência')
      expect(saved[2]?.declaredAmountScope).toBe('occurrence')

      for (const [index, own] of [
        'referenceNumberMode',
        'declaredAmountMode',
        'declaredAmountScope',
      ].entries()) {
        for (const key of RECORD_KEYS.filter((candidate) => candidate !== own)) {
          expect(saved[index]).not.toHaveProperty(key)
        }
      }
    }),
  )

  test(
    'o rótulo grava ao sair, aparado; vazio ou igual ao gravado volta sem gravar',
    scenario(async () => {
      await mount(buildType())
      const input = textInput(REFERENCE_TEXT_LABEL)
      if (input === null) throw new Error('INPUT_NOT_FOUND')

      await leaveWith(input, '   ')
      expect(saved).toHaveLength(0)
      expect(input.value).toBe('Número da NFD')

      await leaveWith(input, 'Número da NFD')
      expect(saved).toHaveLength(0)

      await leaveWith(input, '  Número da devolução  ')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.referenceNumberLabel).toBe('Número da devolução')
      expect(saved[0]).not.toHaveProperty('declaredAmountLabel')

      const amountInput = textInput(AMOUNT_TEXT_LABEL)
      if (amountInput === null) throw new Error('INPUT_NOT_FOUND')
      await leaveWith(amountInput, 'Crédito da loja')
      expect(saved[1]?.declaredAmountLabel).toBe('Crédito da loja')
    }),
  )
})

describe('valor pago por linha exige produtos: a escolha inválida é impedida (RF1, 422)', () => {
  test(
    'sem produtos e por linha, ligar o valor pago não grava e diz por quê',
    scenario(async () => {
      await mount(buildType({ declaredAmountMode: 'off', itemsMode: 'off' }))
      expect(alertText()).toBe('')
      await pick(AMOUNT_LABEL, 'Opcional')
      expect(saved).toHaveLength(0)
      expect(alertText()).toContain('Valor pago por linha precisa de produtos')
      expect(alertText()).toContain('Um só, pela ocorrência')
    }),
  )

  test(
    'sem produtos, o valor pago da ocorrência inteira é aceito; com produtos, o por linha também',
    scenario(async () => {
      await mount(
        buildType({
          declaredAmountMode: 'off',
          declaredAmountScope: 'occurrence',
          itemsMode: 'off',
        }),
      )
      await pick(AMOUNT_LABEL, 'Opcional')
      expect(saved[0]?.declaredAmountMode).toBe('optional')
      expect(alertText()).toBe('')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ declaredAmountMode: 'off', itemsMode: 'optional' }))
      await pick(AMOUNT_LABEL, 'Obrigatório')
      expect(saved[1]?.declaredAmountMode).toBe('required')
    }),
  )

  test(
    'desligar Produtos com valor pago por linha ligado não grava; com o valor desligado grava',
    scenario(async () => {
      await mount(buildType({ itemsMode: 'optional' }))
      await pick(ITEMS_LABEL, 'Desligado')
      expect(saved).toHaveLength(0)
      expect(alertText()).toContain('Valor pago por linha precisa de produtos')
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      await mount(buildType({ declaredAmountMode: 'off', itemsMode: 'optional' }))
      await pick(ITEMS_LABEL, 'Desligado')
      expect(saved[0]?.itemsMode).toBe('off')
    }),
  )

  test(
    'trocar o escopo para por linha, sem produtos e com o valor ligado, também é recusado',
    scenario(async () => {
      await mount(buildType({ declaredAmountScope: 'occurrence', itemsMode: 'off' }))
      await pick(AMOUNT_SCOPE_LABEL, 'Por linha de produto')
      expect(saved).toHaveLength(0)
      expect(alertText()).toContain('Valor pago por linha precisa de produtos')
    }),
  )

  test(
    'uma edição válida depois da recusa tira o aviso',
    scenario(async () => {
      await mount(buildType({ declaredAmountMode: 'off', itemsMode: 'off' }))
      await pick(AMOUNT_LABEL, 'Opcional')
      expect(alertText()).not.toBe('')
      await pick(REFERENCE_LABEL, 'Opcional')
      expect(saved).toHaveLength(1)
      expect(alertText()).toBe('')
    }),
  )
})

describe('a recusa do servidor também aparece (rede de segurança do 422)', () => {
  test('o código estável vira uma frase própria, não "o servidor recusou"', () => {
    const key = resolveTripFeedbackKey(new Error('OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS'))
    expect(key).toBe('occurrenceTypeDeclaredAmountNeedsItems')
  })
})

describe('exceções: os dois modos novos, "Igual ao tipo" herda (D8)', () => {
  test(
    'a exceção mostra os dois campos com o rótulo do tipo e o que está gravado',
    scenario(async () => {
      await mount(buildType())
      await waitFor(() => expect(exceptionControls('Número da NFD')).toHaveLength(1))
      expect(exceptionControls('Número da NFD')[0]?.textContent).toContain('Igual ao tipo')
      expect(exceptionControls('Valor pago pela loja')[0]?.textContent).toContain('Obrigatório')
    }),
  )

  test(
    'trocar o número na exceção manda a lista inteira, com o valor pago como estava',
    scenario(async () => {
      await mount(buildType())
      await waitFor(() => expect(exceptionControls('Número da NFD')).toHaveLength(1))
      const trigger = exceptionControls('Número da NFD')[0]
      if (trigger === undefined) throw new Error('CONTROL_NOT_FOUND')
      await chooseFrom(trigger, 'Obrigatório')

      const entry = exceptionDouble.replaceCalls[0]?.contractorOverrides[0]
      expect(exceptionDouble.replaceCalls).toHaveLength(1)
      expect(entry?.referenceNumberMode).toBe('required')
      expect(entry?.declaredAmountMode).toBe('required')
    }),
  )

  test(
    'voltar a "Igual ao tipo" manda nulo explícito',
    scenario(async () => {
      await mount(buildType())
      await waitFor(() => expect(exceptionControls('Valor pago pela loja')).toHaveLength(1))
      const trigger = exceptionControls('Valor pago pela loja')[0]
      if (trigger === undefined) throw new Error('CONTROL_NOT_FOUND')
      await chooseFrom(trigger, 'Igual ao tipo')

      const entry = exceptionDouble.replaceCalls[0]?.contractorOverrides[0]
      expect(entry).toHaveProperty('declaredAmountMode')
      expect(entry?.declaredAmountMode).toBeNull()
    }),
  )

  test(
    'tipo de parada e API sem os campos não mostram as duas linhas na exceção',
    scenario(async () => {
      await mount(buildType({ flow: 'stop', moments: ['stop'] }))
      expect(exceptionControls('Número da NFD')).toHaveLength(0)
      expect(exceptionControls('Valor pago pela loja')).toHaveLength(0)
    }),
  )

  test(
    'a exceção nova nasce com os dois modos nulos explícitos',
    scenario(async () => {
      installExceptionsDouble({
        byType: BATCH,
        clients: [
          buildDeliveryClient({ displayName: 'Farmácia Vida Nova', taxId: '98765432000110' }),
        ],
      })
      await mount(buildType())
      await waitFor(() => expect(control('Cliente')?.hasAttribute('disabled')).toBe(false))
      const picker = control('Cliente')
      if (picker === null) throw new Error('PICKER_NOT_FOUND')
      await chooseFrom(picker, 'Farmácia Vida Nova')
      const add = [...document.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === 'Adicionar exceção',
      )
      if (add === undefined) throw new Error('ADD_NOT_FOUND')
      await click(add)

      const created = exceptionDouble.replaceCalls[0]?.recipientOverrides[0]
      expect(created).toHaveProperty('referenceNumberMode')
      expect(created?.referenceNumberMode).toBeNull()
      expect(created).toHaveProperty('declaredAmountMode')
      expect(created?.declaredAmountMode).toBeNull()
    }),
  )
})
