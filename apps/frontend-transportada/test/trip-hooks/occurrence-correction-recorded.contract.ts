/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.2 (A1, A2): a correção nasce preenchida com o que está gravado (número, valor pago da ocorrência
 * ou das linhas), com os rótulos do TIPO, e o nível do valor pago nasce onde está gravado. Trocar de nível
 * limpa o outro com `null` explícito — o servidor recusa os dois juntos e "ausente" é "mantém". Limpar é um
 * botão, não um gesto escondido. Montado de verdade, com a API dublada. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { SETTINGS_MANAGE_PERMISSION } from '@/modules/company-settings/shared/companySettings.constant'
import type { OccurrenceType } from '@/modules/trip/shared/occurrenceType.types'
import { TRIP_MANAGE_PERMISSION } from '@/modules/trip/shared/trip.constant'
import type { TripOccurrenceDetail } from '@/modules/trip/shared/tripOccurrenceFeed.service'

import {
  buttonByText,
  click,
  DetailHarness,
  installServerDouble,
  listedItems,
  stubVisibleLayout,
} from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const TYPE_ID = 'type-devolucao'
const SCOPE_LABEL = 'Onde se digita o valor pago'
const GENERIC_REFERENCE = 'Número do documento do cliente'
const LINE_696 = '696 — Valor pago'

const LINE_VALUES: NonNullable<TripOccurrenceDetail['itemValues']> = [
  { declaredAmount: '50.00', productCode: '696', quantity: '3.000', unitValue: '1.0000' },
  { declaredAmount: null, productCode: '697', quantity: '1.000', unitValue: '10.0000' },
]

function buildType(extra: Partial<OccurrenceType> = {}): OccurrenceType {
  return {
    active: true,
    allowsMultipleItems: true,
    attachmentMode: 'off',
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    flow: 'document',
    id: TYPE_ID,
    leavesDocumentBehind: false,
    name: 'Devolução',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
    ...extra,
  }
}

type OpenOptions = Readonly<{
  detail?: Partial<TripOccurrenceDetail>
  permissions?: readonly string[]
  types?: readonly OccurrenceType[]
}>

async function openForm(options: OpenOptions = {}) {
  const server = installServerDouble(
    { occurrenceTypeId: TYPE_ID, ...options.detail },
    options.types ?? [],
  )
  const rendered = await renderWithQueryClient(
    createElement(DetailHarness, { permissions: options.permissions ?? [TRIP_MANAGE_PERMISSION] }),
  )
  await waitFor(() => expect(listedItems()).toEqual(['696:3.000', '697:-']))
  await click(buttonByText('Corrigir'))
  await waitFor(() =>
    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
  )
  return { ...server, rendered }
}

function maybeField(label: string): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
}

function field(label: string): HTMLInputElement {
  const found = maybeField(label)
  if (found === null) throw new Error(`FIELD_NOT_FOUND:${label}`)
  return found
}

async function typeInto(label: string, value: string): Promise<void> {
  const target = field(label)
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  await act(async () => {
    descriptor?.set?.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

async function save(): Promise<void> {
  await click(buttonByText('Salvar correção'))
  await settle()
}

async function choose(triggerLabel: string, optionText: string): Promise<void> {
  const trigger = document.querySelector<HTMLElement>(`button[aria-label="${triggerLabel}"]`)
  if (trigger === null) throw new Error(`TRIGGER_NOT_FOUND:${triggerLabel}`)
  await click(trigger)
  let option: HTMLElement | undefined
  await waitFor(() => {
    option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent?.trim() === optionText,
    )
    expect(option === undefined).toBe(false)
  })
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${optionText}`)
  await click(option)
}

function clearButton(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="Limpar: ${label}"]`)
  if (found === null) throw new Error(`CLEAR_NOT_FOUND:${label}`)
  return found
}

function pageText(): string {
  return document.body.textContent ?? ''
}

function scenario(body: () => Promise<void>): () => Promise<void> {
  return async () => {
    const restoreLayout = stubVisibleLayout()
    try {
      await body()
    } finally {
      restoreLayout()
    }
  }
}

describe('a correção nasce preenchida com o que está gravado (A2)', () => {
  test(
    'número e valor pago da linha vêm do detalhe, e salvar sem mexer não manda nada de valor',
    scenario(async () => {
      const { calls, rendered } = await openForm({
        detail: { itemValues: LINE_VALUES, referenceNumber: 'NFD 45029' },
      })

      expect(field(GENERIC_REFERENCE).value).toBe('NFD 45029')
      expect(field(LINE_696).value).toBe('50,00')
      expect(field('697 — Valor pago').value).toBe('')
      expect(pageText()).toContain('Nada gravado.')
      await save()

      expect(calls).toHaveLength(1)
      expect(calls[0]).not.toHaveProperty('referenceNumber')
      expect(calls[0]).not.toHaveProperty('declaredAmount')
      for (const item of calls[0]?.items ?? []) expect(item).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    'o valor pago da ocorrência vem do detalhe, inclusive o zero ("a loja não pagou")',
    scenario(async () => {
      const { rendered } = await openForm({ detail: { declaredAmount: '0.00' } })
      expect(field('Valor pago da ocorrência').value).toBe('0,00')
      expect(pageText()).not.toContain('Será limpo ao salvar.')
      rendered.unmount()
    }),
  )

  test(
    'os rótulos são os do tipo da ocorrência, quando o operador pode ler o catálogo',
    scenario(async () => {
      const types = [
        buildType({
          declaredAmountLabel: 'Valor pago pela loja',
          referenceNumberLabel: 'Número da NFD',
        }),
      ]
      const { rendered } = await openForm({
        detail: { itemValues: LINE_VALUES },
        permissions: [TRIP_MANAGE_PERMISSION, SETTINGS_MANAGE_PERMISSION],
        types,
      })
      await waitFor(() => expect(maybeField('Número da NFD')).not.toBeNull())
      expect(maybeField('696 — Valor pago pela loja')).not.toBeNull()
      expect(maybeField(GENERIC_REFERENCE)).toBeNull()
      rendered.unmount()
    }),
  )

  test(
    'sem permissão para o catálogo, ou com tipo que a lista não traz, valem os rótulos genéricos',
    scenario(async () => {
      const types = [buildType({ referenceNumberLabel: 'Número da NFD' })]
      const withoutPermission = await openForm({ types })
      await settle()
      expect(maybeField(GENERIC_REFERENCE)).not.toBeNull()
      expect(maybeField('Número da NFD')).toBeNull()
      withoutPermission.rendered.unmount()

      const unknownType = await openForm({
        detail: { occurrenceTypeId: 'outro-tipo' },
        permissions: [TRIP_MANAGE_PERMISSION, SETTINGS_MANAGE_PERMISSION],
        types,
      })
      await settle()
      expect(maybeField(GENERIC_REFERENCE)).not.toBeNull()
      unknownType.rendered.unmount()
    }),
  )

  test(
    'Limpar é botão explícito: o número vai nulo e a linha vai nula, e o campo diz que será limpo',
    scenario(async () => {
      const { calls, rendered } = await openForm({
        detail: { itemValues: LINE_VALUES, referenceNumber: 'NFD 45029' },
      })
      await click(clearButton(GENERIC_REFERENCE))
      await click(clearButton(LINE_696))
      expect(field(GENERIC_REFERENCE).value).toBe('')
      expect(pageText()).toContain('Será limpo ao salvar.')
      await save()

      expect(calls[0]).toHaveProperty('referenceNumber')
      expect(calls[0]?.referenceNumber).toBeNull()
      expect(calls[0]?.items[0]).toHaveProperty('declaredAmount')
      expect(calls[0]?.items[0]?.declaredAmount).toBeNull()
      expect(calls[0]).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    'campo vazio sem nada gravado não oferece Limpar e diz "Nada gravado."',
    scenario(async () => {
      const { rendered } = await openForm({})
      expect(document.querySelector(`button[aria-label="Limpar: ${GENERIC_REFERENCE}"]`)).toBeNull()
      expect(pageText()).toContain('Nada gravado.')
      rendered.unmount()
    }),
  )
})

describe('o nível do valor pago nasce onde está gravado e a troca limpa o outro (A1)', () => {
  test(
    'gravado na linha: nasce "Por linha"; (a) trocar para "Um só" e digitar 40,00 manda a ocorrência e linhas nulas',
    scenario(async () => {
      const { calls, rendered } = await openForm({ detail: { itemValues: LINE_VALUES } })
      expect(document.querySelector(`button[aria-label="${SCOPE_LABEL}"]`)?.textContent).toContain(
        'Por linha de produto',
      )
      await choose(SCOPE_LABEL, 'Um só, pela ocorrência')
      expect(pageText()).toContain('Há valor pago gravado nas linhas.')
      await typeInto('Valor pago da ocorrência', '4000')
      await save()

      expect(calls[0]?.declaredAmount).toBe('40.00')
      expect(calls[0]?.items).toHaveLength(2)
      for (const item of calls[0]?.items ?? []) {
        expect(item).toHaveProperty('declaredAmount')
        expect(item.declaredAmount).toBeNull()
      }
      rendered.unmount()
    }),
  )

  test(
    'gravado na ocorrência: nasce "Um só"; (b) trocar para "Por linha" e digitar numa linha manda a ocorrência nula',
    scenario(async () => {
      const { calls, rendered } = await openForm({ detail: { declaredAmount: '40.00' } })
      expect(field('Valor pago da ocorrência').value).toBe('40,00')
      expect(document.querySelector(`button[aria-label="${SCOPE_LABEL}"]`)?.textContent).toContain(
        'Um só, pela ocorrência',
      )
      await choose(SCOPE_LABEL, 'Por linha de produto')
      expect(pageText()).toContain('Há um valor pago gravado na ocorrência.')
      await typeInto(LINE_696, '5000')
      await save()

      expect(calls[0]).toHaveProperty('declaredAmount')
      expect(calls[0]?.declaredAmount).toBeNull()
      expect(calls[0]?.items[0]?.declaredAmount).toBe('50.00')
      expect(calls[0]?.items[1]).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    'trocar de nível sem digitar valor não apaga o gravado',
    scenario(async () => {
      const { calls, rendered } = await openForm({ detail: { itemValues: LINE_VALUES } })
      await choose(SCOPE_LABEL, 'Um só, pela ocorrência')
      await save()

      expect(calls[0]).not.toHaveProperty('declaredAmount')
      for (const item of calls[0]?.items ?? []) expect(item).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    '(c) limpar tudo: Limpar na linha manda só a linha nula; Limpar na ocorrência manda só a ocorrência nula',
    scenario(async () => {
      const line = await openForm({ detail: { itemValues: LINE_VALUES } })
      await click(clearButton(LINE_696))
      await save()
      expect(line.calls[0]?.items[0]?.declaredAmount).toBeNull()
      expect(line.calls[0]).not.toHaveProperty('declaredAmount')
      line.rendered.unmount()

      const occurrence = await openForm({ detail: { declaredAmount: '40.00' } })
      await click(clearButton('Valor pago da ocorrência'))
      await save()
      expect(occurrence.calls[0]).toHaveProperty('declaredAmount')
      expect(occurrence.calls[0]?.declaredAmount).toBeNull()
      for (const item of occurrence.calls[0]?.items ?? []) {
        expect(item).not.toHaveProperty('declaredAmount')
      }
      occurrence.rendered.unmount()
    }),
  )

  test(
    'sem nada gravado o nível nasce onde o tipo o pede, e sem tipo é por linha',
    scenario(async () => {
      const byType = await openForm({
        permissions: [TRIP_MANAGE_PERMISSION, SETTINGS_MANAGE_PERMISSION],
        types: [buildType({ declaredAmountScope: 'occurrence' })],
      })
      await waitFor(() => expect(maybeField('Valor pago da ocorrência')).not.toBeNull())
      expect(maybeField(LINE_696)).toBeNull()
      byType.rendered.unmount()

      const withoutType = await openForm({})
      expect(maybeField(LINE_696)).not.toBeNull()
      withoutType.rendered.unmount()
    }),
  )
})

describe('o valor que vai no e-mail (RF9 espelhada) fica ao lado da soma geral', () => {
  test(
    'o valor pago digitado entra no e-mail e não muda a soma geral',
    scenario(async () => {
      const { rendered } = await openForm({ detail: { itemValues: LINE_VALUES } })
      await choose('696 — Unidade', 'CX')
      expect(pageText()).toContain('Soma geral: R$ 13,00')
      /** 696 pago 50,00 no lugar da soma da linha (3,00) + 697 pela nota (10,00). */
      expect(pageText()).toContain('Valor que vai no e-mail: R$ 60,00')

      await typeInto(LINE_696, '000')
      expect(pageText()).toContain('Soma geral: R$ 13,00')
      expect(pageText()).toContain('Valor que vai no e-mail: R$ 10,00')
      rendered.unmount()
    }),
  )

  test(
    'o valor pago da ocorrência vale como está, zero inclusive',
    scenario(async () => {
      const { rendered } = await openForm({ detail: { declaredAmount: '40.00' } })
      expect(pageText()).toContain('Valor que vai no e-mail: R$ 40,00')
      await typeInto('Valor pago da ocorrência', '000')
      expect(pageText()).toContain('Valor que vai no e-mail: R$ 0,00')
      rendered.unmount()
    }),
  )
})
