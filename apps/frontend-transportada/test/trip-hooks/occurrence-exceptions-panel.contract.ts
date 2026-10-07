/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3, T5.3b, T5.3c: o painel de tipos montado de verdade — tipos recolhidos com a linha-resumo,
 * exceções à vista lidas numa consulta só, cada campo da exceção editável com "Igual ao tipo", o cliente
 * escolhido entre os cadastrados, e o conjunto de momentos. Dados sintéticos.
 */
import { act, createElement, useState } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeCatalogPanel } from '@/modules/trip/components/OccurrenceTypeCatalogPanel.component'
import type {
  OccurrenceAttachmentOverridesByType,
  OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeSaveInput } from '@/modules/trip/shared/occurrenceTypeUpdate.service'

import { OCCURRENCE_REQUIREMENT_DEFAULTS } from '../fixtures/occurrenceRequirementDefaults.fixture'
import { click, stubVisibleLayout } from './occurrenceCorrectionHarness.helper'
import {
  buildDeliveryClient,
  chooseFrom,
  chooseOpenOption,
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
    moments: ['document'],
    name: 'Recusa total',
    notifies: true,
    redeliveryPolicy: 'blocked',
    stage: 'delivery',
    ...overrides,
  }
}

const CONTRACTOR = {
  displayName: 'Distribuidora Aurora',
  id: 'contractor-1',
  taxId: '11222333000144',
}
const PONTO_CERTO = '12345678000190'
const FARMACIA = '98765432000110'

const BATCH: OccurrenceAttachmentOverridesByType = [
  {
    contractorOverrides: [
      {
        attachmentMode: 'optional',
        contractorId: CONTRACTOR.id,
        itemsMinimumCount: 2,
        itemsMode: 'required',
        noteMode: 'required',
        photoMinimumCount: null,
        signatureMode: null,
      },
    ],
    occurrenceTypeId: 'type-1',
    recipientOverrides: [
      {
        attachmentMode: 'off',
        itemsMinimumCount: null,
        itemsMode: null,
        noteMode: null,
        photoMinimumCount: null,
        signatureMode: null,
        taxId: PONTO_CERTO,
      },
    ],
  },
]

const CLIENTS = [
  buildDeliveryClient({ displayName: 'Supermercados Ponto Certo', taxId: PONTO_CERTO }),
  buildDeliveryClient({ displayName: 'Farmácia Vida Nova', taxId: FARMACIA }),
]

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
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
  await waitFor(() => expect(exceptionDouble.batchCalls).toBeGreaterThan(0))
  await waitFor(() => expect(document.body.textContent?.includes('carregando')).toBe(false))
}

/** O painel com a lista de tipos trocável: a gravação devolve o mesmo tipo com outro grupo. */
async function mountReplaceable(
  initial: readonly OccurrenceType[],
): Promise<Readonly<{ rerender: (types: readonly OccurrenceType[]) => Promise<void> }>> {
  let replaceTypes: (types: readonly OccurrenceType[]) => void = () => undefined
  function Harness() {
    const [types, setTypes] = useState(initial)
    replaceTypes = setTypes
    return createElement(OccurrenceTypeCatalogPanel, {
      canManage: true,
      isSaving: false,
      loadStatus: 'ready',
      onRetry: () => undefined,
      onSave: (input) => saved.push(input),
      saveFeedbackKey: null,
      types,
    })
  }
  mounted.push(await renderWithQueryClient(createElement(Harness)))
  await waitFor(() => expect(exceptionDouble.batchCalls).toBeGreaterThan(0))
  return {
    rerender: async (types) => {
      await act(async () => {
        replaceTypes(types)
        await Promise.resolve()
      })
    },
  }
}

function summaries(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button[aria-controls]')]
}

function pageText(): string {
  return document.body.textContent ?? ''
}

describe('exceções à vista: uma consulta por tela (RF11c)', () => {
  test(
    'com 1 tipo e com 3 tipos o cliente recebe uma chamada em lote só',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType()])
      expect(exceptionDouble.batchCalls).toBe(1)
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      installExceptionsDouble({ byType: BATCH })
      await mount([buildType(), buildType({ id: 'type-2' }), buildType({ id: 'type-3' })])
      await expandAllTypes()
      expect(exceptionDouble.batchCalls).toBe(1)
    }),
  )

  test(
    'a linha recolhida traz a contagem e o marcador de inativo; a lista só aparece ao abrir',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType(), buildType({ active: false, id: 'type-2', name: 'Avaria antiga' })])
      const [first, second] = summaries()
      expect(first?.textContent?.includes('2 exceções')).toBe(true)
      expect(first?.textContent?.includes('Motorista, numa nota')).toBe(true)
      expect(second?.textContent?.includes('sem exceção')).toBe(true)
      expect(second?.textContent?.includes('Inativo')).toBe(true)
      expect(first?.getAttribute('aria-expanded')).toBe('false')
      expect(document.querySelector('section[aria-label^="Exceções por cliente"]')).toBeNull()

      if (first === undefined) throw new Error('SUMMARY_NOT_FOUND')
      await click(first)
      expect(first.getAttribute('aria-expanded')).toBe('true')
      expect(document.querySelector('section[aria-label^="Exceções por cliente"]')).not.toBeNull()
    }),
  )

  test(
    'a lista mostra nome e CNPJ formatado de contratante e destinatário, e o modo de cada campo',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      await waitFor(() =>
        expect(pageText().includes('Distribuidora Aurora · 11.222.333/0001-44')).toBe(true),
      )
      await waitFor(() =>
        expect(pageText().includes('Supermercados Ponto Certo · 12.345.678/0001-90')).toBe(true),
      )
      expect(exceptionControls('Foto')[1]?.textContent?.includes('Desligado')).toBe(true)
      expect(exceptionControls('Observação')[0]?.textContent?.includes('Obrigatório')).toBe(true)
      expect(exceptionControls('Observação')[1]?.textContent?.includes('Igual ao tipo')).toBe(true)
    }),
  )
})

describe('exceções: cada campo editável, nulo herda (RF11, RF4)', () => {
  test(
    'trocar Observação do destinatário manda as duas listas inteiras, com o resto como estava',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      const recipientNote = exceptionControls('Observação')[1]
      if (recipientNote === undefined) throw new Error('CONTROL_NOT_FOUND')
      await chooseFrom(recipientNote, 'Obrigatório')

      const call = exceptionDouble.replaceCalls[0]
      expect(exceptionDouble.replaceCalls).toHaveLength(1)
      expect(call?.occurrenceTypeId).toBe('type-1')
      expect(call?.contractorOverrides).toEqual(BATCH[0]?.contractorOverrides ?? [])
      expect(call?.recipientOverrides[0]?.noteMode).toBe('required')
      expect(call?.recipientOverrides[0]?.itemsMode).toBeNull()
      expect(call?.recipientOverrides[0]?.signatureMode).toBeNull()
    }),
  )

  test(
    'o mínimo de produtos fica desligado, com o motivo à vista, quando a exceção herda Produtos',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      const [contractorMinimum, recipientMinimum] = exceptionControls('Produtos exigidos')
      expect(contractorMinimum?.hasAttribute('disabled')).toBe(false)
      expect(recipientMinimum?.hasAttribute('disabled')).toBe(true)

      const group = recipientMinimum?.closest('[role="group"]')
      const reasonId = group?.getAttribute('aria-describedby') ?? ''
      expect(document.getElementById(reasonId)?.textContent).toContain(
        'só vale quando Produtos é Obrigatório nesta exceção',
      )
    }),
  )

  test(
    'sair de Produtos obrigatório na exceção manda itemsMinimumCount nulo explícito',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      const contractorItems = exceptionControls('Produtos')[0]
      if (contractorItems === undefined) throw new Error('CONTROL_NOT_FOUND')
      await chooseFrom(contractorItems, 'Opcional')

      const entry = exceptionDouble.replaceCalls[0]?.contractorOverrides[0]
      expect(entry?.itemsMode).toBe('optional')
      expect(entry).toHaveProperty('itemsMinimumCount')
      expect(entry?.itemsMinimumCount).toBeNull()
    }),
  )

  test(
    'remover manda a lista sem aquela exceção',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      const removeSelector =
        'button[aria-label="Remover exceção de Supermercados Ponto Certo · 12.345.678/0001-90"]'
      /** O nome vem do diretório de clientes, que só carrega com o tipo aberto. */
      await waitFor(() => expect(document.querySelector(removeSelector) !== null).toBe(true))
      const remove = document.querySelector<HTMLElement>(removeSelector)
      if (remove === null) throw new Error('REMOVE_NOT_FOUND')
      await click(remove)
      expect(exceptionDouble.replaceCalls[0]?.recipientOverrides).toHaveLength(0)
      expect(exceptionDouble.replaceCalls[0]?.contractorOverrides).toHaveLength(1)
    }),
  )
})

describe('os diretórios de clientes e contratantes (revisão do painel M7)', () => {
  test(
    'nada é carregado ao abrir a aba; as listas só vêm quando um tipo é aberto',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
      })
      expect(exceptionDouble.clientListCalls).toBe(0)
      expect(exceptionDouble.contractorListCalls).toBe(0)

      await expandAllTypes()
      await waitFor(() => expect(exceptionDouble.clientListCalls).toBeGreaterThan(0))
      expect(exceptionDouble.contractorListCalls).toBeGreaterThan(0)
    }),
  )

  test(
    'lista de clientes cortada no teto avisa na tela que pode estar incompleta',
    scenario(async () => {
      const many = Array.from({ length: 3000 }, (_, index) =>
        buildDeliveryClient({
          displayName: `Cliente ${String(index)}`,
          taxId: String(10_000_000_000_000 + index),
        }),
      )
      installExceptionsDouble({ byType: BATCH, clients: many, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      await waitFor(() =>
        expect(pageText().includes('A lista de clientes pode estar incompleta')).toBe(true),
      )
    }),
  )
})

describe('destinatário da exceção: escolhido, nunca digitado (RF1f, T5.3c)', () => {
  test(
    'a lista tem os clientes cadastrados por nome e CNPJ, sem repetir quem já tem exceção, e manda só dígitos',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      expect(document.querySelector('input[aria-label*="CNPJ"]')).toBeNull()

      await waitFor(() => expect(control('Cliente')?.hasAttribute('disabled')).toBe(false))
      const picker = control('Cliente')
      if (picker === null) throw new Error('PICKER_NOT_FOUND')
      await click(picker)
      const optionTexts = [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent ?? '',
      )
      expect(optionTexts.some((text) => text.includes('Farmácia Vida Nova'))).toBe(true)
      expect(optionTexts.some((text) => text.includes('Ponto Certo'))).toBe(false)

      await chooseOpenOption('Farmácia Vida Nova · 98.765.432/0001-10')
      const add = [...document.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === 'Adicionar exceção',
      )
      if (add === undefined) throw new Error('ADD_NOT_FOUND')
      await click(add)

      const recipients = exceptionDouble.replaceCalls[0]?.recipientOverrides ?? []
      expect(recipients).toHaveLength(2)
      expect(recipients[1]?.taxId).toBe(FARMACIA)
      expect(recipients[1]?.attachmentMode).toBe('optional')
      expect(recipients[0]).toEqual(BATCH[0]?.recipientOverrides[0])
    }),
  )

  test(
    'a exceção nova nasce "Igual ao tipo" em todos os campos que herdam, e o PUT manda nulo explícito (A1)',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: CLIENTS, contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      await waitFor(() => expect(control('Cliente')?.hasAttribute('disabled')).toBe(false))
      const picker = control('Cliente')
      if (picker === null) throw new Error('PICKER_NOT_FOUND')
      await chooseFrom(picker, 'Farmácia Vida Nova · 98.765.432/0001-10')
      const add = [...document.querySelectorAll<HTMLElement>('button')].find(
        (button) => button.textContent?.trim() === 'Adicionar exceção',
      )
      if (add === undefined) throw new Error('ADD_NOT_FOUND')
      await click(add)

      const created = exceptionDouble.replaceCalls[0]?.recipientOverrides[1]
      for (const field of ['itemsMode', 'noteMode', 'photoMinimumCount', 'signatureMode']) {
        expect(created).toHaveProperty(field)
        expect((created as Record<string, unknown> | undefined)?.[field]).toBeNull()
      }
      expect(created).toHaveProperty('itemsMinimumCount')

      await waitFor(() => expect(exceptionControls('Observação')).toHaveLength(3))
      for (const label of ['Observação', 'Assinatura', 'Produtos']) {
        const last = exceptionControls(label)[2]
        expect(last?.textContent?.includes('Igual ao tipo')).toBe(true)
      }
    }),
  )

  test(
    'se a consulta de clientes falha, a tela diz o motivo e não oferece campo livre',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH, clients: 'failure', contractors: [CONTRACTOR] })
      await mount([buildType()])
      await expandAllTypes()
      await waitFor(() =>
        expect(pageText().includes('Não foi possível carregar os clientes cadastrados')).toBe(true),
      )
      expect(control('Cliente')?.hasAttribute('disabled')).toBe(true)
      expect(document.querySelector('input[type="text"][aria-label*="CNPJ"]')).toBeNull()
      expect(document.querySelector('[role="status"]')?.textContent).toContain('cliente cadastrado')
    }),
  )
})

async function pressButton(text: string): Promise<void> {
  const found = [...document.querySelectorAll<HTMLElement>('button')].find(
    (button) => button.textContent?.trim() === text,
  )
  if (found === undefined) throw new Error(`BUTTON_NOT_FOUND:${text}`)
  await click(found)
}

describe('momentos do tipo (RF0, RF1h, T5.3b)', () => {
  const MOMENTS_LABEL = 'Quem registra, e onde'

  async function toggleOption(text: string): Promise<void> {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
      item.textContent?.includes(text),
    )
    if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${text}`)
    await click(option)
  }

  async function openMoments(): Promise<void> {
    const trigger = control(MOMENTS_LABEL)
    if (trigger === null) throw new Error('MOMENTS_NOT_FOUND')
    await click(trigger)
  }

  test(
    'sem moments na listagem (API antiga) o seletor não aparece; com moments mostra a nota de rua',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      const { moments, ...withoutMoments } = buildType()
      void moments
      await mount([withoutMoments])
      await expandAllTypes()
      expect(control(MOMENTS_LABEL)).toBeNull()
      mounted.splice(0).forEach((rendered) => rendered.unmount())

      installExceptionsDouble({ byType: BATCH })
      await mount([buildType()])
      await expandAllTypes()
      expect(control(MOMENTS_LABEL)?.textContent).toContain('1 momentos')
      expect(pageText()).toContain('só quando o motorista registra')
    }),
  )

  test(
    'tirar o último momento é recusado na tela, com o motivo à vista, e nada é gravado',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType({ moments: ['document'] })])
      await expandAllTypes()
      await openMoments()
      await toggleOption('Motorista, numa nota')

      expect(saved).toHaveLength(0)
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'Escolha ao menos um momento',
      )
    }),
  )

  test(
    'nota e parada juntas são recusadas na tela; o conjunto válido grava só moments',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType({ moments: ['document'] })])
      await expandAllTypes()
      await openMoments()

      await toggleOption('Motorista, na parada')
      expect(saved).toHaveLength(0)
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'não podem estar juntas',
      )

      await toggleOption('Motorista, numa nota')
      expect(saved).toHaveLength(0)
      await pressButton('Aplicar momentos')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.moments).toEqual(['stop'])
      expect(saved[0]).not.toHaveProperty('noteMode')
    }),
  )

  test(
    'cada toque só muda o rascunho: nada grava, o seletor segue aberto, e o Aplicar grava uma vez (M1)',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType({ moments: ['document'] })])
      await expandAllTypes()
      await openMoments()
      await toggleOption('Escritório')
      await toggleOption('Separador')

      expect(saved).toHaveLength(0)
      expect(document.querySelectorAll('[role="option"]').length).toBeGreaterThan(0)
      await pressButton('Aplicar momentos')
      expect(saved).toHaveLength(1)
      expect(saved[0]?.moments).toEqual(['separation', 'document', 'office'])
    }),
  )

  test(
    'o rascunho recusado volta ao gravado com Desfazer, e o aviso some (M1)',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType({ moments: ['document'] })])
      await expandAllTypes()
      await openMoments()
      await toggleOption('Motorista, numa nota')
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'Escolha ao menos um momento',
      )

      await pressButton('Desfazer')
      expect(document.querySelector('[role="alert"]')).toBeNull()
      expect(control(MOMENTS_LABEL)?.textContent).toContain('1 momentos')
      expect(saved).toHaveLength(0)
    }),
  )

  test(
    'o botão de tirar cada momento diz qual momento é (B3)',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      await mount([buildType({ moments: ['document'] })])
      await expandAllTypes()
      expect(control('Tirar momento Motorista, numa nota') !== null).toBe(true)
    }),
  )

  test(
    'o tipo continua aberto quando a gravação o muda de grupo (M1)',
    scenario(async () => {
      installExceptionsDouble({ byType: BATCH })
      const view = await mountReplaceable([buildType({ moments: ['document'] })])
      await expandAllTypes()
      expect(control(MOMENTS_LABEL) !== null).toBe(true)

      await view.rerender([buildType({ moments: ['separation'], stage: 'separation' })])
      expect(control(MOMENTS_LABEL) !== null).toBe(true)
    }),
  )
})
