/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T5.4 (RF13, P5): a correção montada de verdade ganha o número do documento do cliente e o valor
 * pago — por linha ou um só pela ocorrência —, em três estados (ausente mantém, apagado limpa, texto vale),
 * com a soma da linha como referência. O valor da ocorrência e o de linha nunca vão juntos. Dados sintéticos.
 */
import { act, createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import {
  buttonByText,
  click,
  DetailHarness,
  installServerDouble,
  listedItems,
  stubVisibleLayout,
  typeQuantity,
} from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'
import { tripHookFakes } from './tripClientMocks.helper'

const REFERENCE_LABEL = 'Número do documento do cliente'
const OCCURRENCE_AMOUNT_LABEL = 'Valor pago da ocorrência'
const SCOPE_LABEL = 'Onde se digita o valor pago'

async function openForm(): Promise<{ unmount: () => void }> {
  const rendered = await renderWithQueryClient(createElement(DetailHarness))
  await waitFor(() => expect(listedItems()).toEqual(['696:3.000', '697:-']))
  await click(buttonByText('Corrigir'))
  await waitFor(() =>
    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
  )
  return rendered
}

function field(label: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
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

function pageText(): string {
  return document.body.textContent ?? ''
}

/** O DOM do teste devolve retângulos zerados e o `Select` fecha na hora: o remendo vale em cada cenário. */
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

describe('a correção ganha número e valor pago (spec 247 RF13)', () => {
  test(
    'a seção mostra os campos vazios, e sem digitar nada o corpo é o de sempre',
    scenario(async () => {
      const { calls } = installServerDouble()
      const rendered = await openForm()

      expect(field(REFERENCE_LABEL).value).toBe('')
      expect(field('696 — Valor pago').value).toBe('')
      expect(field('697 — Valor pago').value).toBe('')
      await save()

      expect(calls).toHaveLength(1)
      expect(calls[0]?.items).toEqual([
        { code: '696', quantity: '3.000', unit: 'box' },
        { code: '697' },
      ])
      expect(calls[0]).not.toHaveProperty('referenceNumber')
      expect(calls[0]).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    'o número digitado vai aparado; digitado e apagado vai nulo (limpa)',
    scenario(async () => {
      const { calls } = installServerDouble()
      const rendered = await openForm()
      await typeInto(REFERENCE_LABEL, '  NFD 45029 ')
      await save()
      expect(calls[0]?.referenceNumber).toBe('NFD 45029')
      rendered.unmount()

      const second = installServerDouble()
      const reopened = await openForm()
      await typeInto(REFERENCE_LABEL, 'NFD 1')
      await typeInto(REFERENCE_LABEL, '')
      await save()
      expect(second.calls[0]).toHaveProperty('referenceNumber')
      expect(second.calls[0]?.referenceNumber).toBeNull()
      reopened.unmount()
    }),
  )

  test(
    'número com símbolo fora de [A-Za-z0-9 ./-] avisa no campo e trava o salvar',
    scenario(async () => {
      const { calls } = installServerDouble()
      const rendered = await openForm()
      await typeInto(REFERENCE_LABEL, 'NFD#1')

      expect(field(REFERENCE_LABEL).getAttribute('aria-invalid')).toBe('true')
      expect(document.querySelector('[role="alert"]')?.textContent).toContain('letras, números')
      expect(buttonByText('Salvar correção').disabled).toBe(true)
      await save()
      expect(calls).toHaveLength(0)

      await typeInto(REFERENCE_LABEL, 'NFD 1')
      expect(buttonByText('Salvar correção').disabled).toBe(false)
      rendered.unmount()
    }),
  )

  test(
    'valor por linha: máscara pt-BR na digitação, texto no corpo, e só a linha editada leva valor',
    scenario(async () => {
      const { calls } = installServerDouble()
      const rendered = await openForm()
      await typeInto('696 — Valor pago', '5000')
      expect(field('696 — Valor pago').value).toBe('50,00')
      await save()

      expect(calls[0]?.items).toEqual([
        { code: '696', declaredAmount: '50.00', quantity: '3.000', unit: 'box' },
        { code: '697' },
      ])
      expect(typeof calls[0]?.items[0]?.declaredAmount).toBe('string')
      expect(calls[0]).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    'zero é valor (a loja não pagou) e vai como 0.00; apagado depois de digitado vai nulo',
    scenario(async () => {
      const { calls } = installServerDouble()
      const rendered = await openForm()
      await typeInto('696 — Valor pago', '000')
      await typeInto('697 — Valor pago', '1500')
      await typeInto('697 — Valor pago', '')
      await save()

      expect(calls[0]?.items[0]?.declaredAmount).toBe('0.00')
      expect(calls[0]?.items[1]).toHaveProperty('declaredAmount')
      expect(calls[0]?.items[1]?.declaredAmount).toBeNull()
      rendered.unmount()
    }),
  )

  test(
    '"Um só, pela ocorrência": o campo da ocorrência aparece, os de linha somem, e só o da ocorrência vai',
    scenario(async () => {
      const { calls } = installServerDouble()
      const rendered = await openForm()
      await typeInto('696 — Valor pago', '1000')
      await choose(SCOPE_LABEL, 'Um só, pela ocorrência')

      expect(document.querySelector('input[aria-label="696 — Valor pago"]')).toBeNull()
      await typeInto(OCCURRENCE_AMOUNT_LABEL, '19999')
      expect(field(OCCURRENCE_AMOUNT_LABEL).value).toBe('199,99')
      await save()

      expect(calls[0]?.declaredAmount).toBe('199.99')
      for (const item of calls[0]?.items ?? []) expect(item).not.toHaveProperty('declaredAmount')
      rendered.unmount()
    }),
  )

  test(
    'a soma da linha aparece como referência, em inteiro, e some quando a unidade não é a da nota',
    scenario(async () => {
      installServerDouble()
      const rendered = await openForm()
      /** 696 está em caixa (unidade de fallback): sem unidade da nota não há conta confiável. */
      expect(pageText()).not.toContain('Soma da linha: R$ 3,00')
      /** 697 sem quantidade é a linha inteira da nota: o vProd. */
      expect(pageText()).toContain('Soma da linha: R$ 10,00')

      await typeQuantity('697 — Quantidade', '5')
      expect(pageText()).toContain('Soma da linha: R$ 5,00')
      expect(pageText()).not.toContain('Soma geral')
      rendered.unmount()
    }),
  )

  test(
    'com todas as linhas na unidade da nota, a soma geral soma as linhas já arredondadas',
    scenario(async () => {
      installServerDouble()
      const rendered = await openForm()
      await choose('696 — Unidade', 'CX')

      expect(pageText()).toContain('Soma da linha: R$ 3,00')
      expect(pageText()).toContain('Soma da linha: R$ 10,00')
      expect(pageText()).toContain('Soma geral: R$ 13,00')
      rendered.unmount()
    }),
  )

  test(
    'a recusa do servidor por dois níveis de valor aparece com frase própria',
    scenario(async () => {
      installServerDouble()
      tripHookFakes.tripClient = {
        ...tripHookFakes.tripClient,
        correctTripOccurrenceItems: () =>
          Promise.reject(new Error('DECLARED_AMOUNT_SELECTION_CONFLICT')),
      }
      const rendered = await openForm()
      await typeInto('696 — Valor pago', '1000')
      await save()

      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'não podem vir juntos',
      )
      rendered.unmount()
    }),
  )
})
