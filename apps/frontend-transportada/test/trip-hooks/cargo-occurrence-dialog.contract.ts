/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (RF8, ADR-0094 §9.4): a avaria na entrada, no celular do separador — o formulário montado de
 * verdade. Item obrigatório, quantidade, foto até 512 KiB, a janela vencida explicada em vez de falhar à toa
 * (e o `422` do servidor tratado), o `Idempotency-Key` estável por tentativa, e a recusa que nomeia TODOS os
 * campos com atalho (`web.md` §11). Nada de `expect(nó).toBeNull()` dentro de `waitFor`.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { windowClosedDueAt } from '../fixtures/cargoOccurrence.fixture'
import { cargoOccurrenceFakes } from './cargoOccurrenceHarness.helper'
import {
  dialog,
  fillValidOccurrence,
  markItem,
  mountSeparation,
  noteArea,
  occurrenceButton,
  openOccurrenceForm,
  pickOption,
  submitOccurrence,
  text,
  typeInArea,
} from './cargoOccurrenceScreen.helper'
import { buttonByText, byLabel, click, networkFailure } from './cargoReceivingHarness.helper'
import { settle, waitFor } from './renderHook.helper'

const OCCURRENCE_DOCUMENT_ID_1001 = '00000000-0000-4000-8000-000000001001'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('o botão "Avaria" na nota', () => {
  test('aparece na nota recebida e na separada, não na esperada, e leva o número da nota', async () => {
    const { rendered } = await mountSeparation()

    expect(occurrenceButton(1001)).not.toBeNull()
    expect(occurrenceButton(1003)).not.toBeNull()
    expect(occurrenceButton(1002)).toBeNull()
    expect(occurrenceButton(1001)?.textContent).toContain('Avaria')
    rendered.unmount()
  })

  test('sem `trip.manage` ninguém abre avaria', async () => {
    const { rendered } = await mountSeparation({ canManage: false })

    expect(document.querySelectorAll('[aria-label^="Registrar avaria"]').length).toBe(0)
    rendered.unmount()
  })

  test('janela vencida: sem botão, e a tela explica com texto neutro', async () => {
    const { rendered } = await mountSeparation({ arrival: { separationDueAt: windowClosedDueAt() } })

    expect(document.querySelectorAll('[aria-label^="Registrar avaria"]').length).toBe(0)
    expect(text()).toContain('O prazo de separação desta chegada terminou: não dá mais para registrar avaria.')
    rendered.unmount()
  })

  test('o alvo de toque do botão vem do token do painel, nunca de um px solto', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(
      new URL('../../src/modules/cargo-receiving/styles/cargoOccurrence.module.css', import.meta.url),
      'utf8',
    )

    expect(css).toMatch(/\.noteAction\s*\{[^}]*min-height:\s*var\(--touch-target\)/u)
    expect(css.replaceAll('1px', '')).not.toMatch(/\d+px/u)
    expect(css).not.toMatch(/@media[^{]*max-width/u)
  })
})

describe('o formulário da avaria', () => {
  test('abre com o tipo, os itens da nota, a observação e a foto — e carrega só o que precisa', async () => {
    const { occurrence, rendered } = await mountSeparation()

    await openOccurrenceForm(1001)

    expect(dialog()?.getAttribute('aria-modal')).toBe('true')
    expect(dialog()?.textContent).toContain('Registrar avaria — NF 1001')
    expect(document.querySelectorAll('[data-product-code]').length).toBe(3)
    expect(dialog()?.textContent).toContain('Biscoito de leite 200 g')
    expect(byLabel('Tipo da ocorrência')).not.toBeNull()
    expect(noteArea()).not.toBeNull()
    expect(occurrence.calls.listProducts).toEqual([OCCURRENCE_DOCUMENT_ID_1001])
    rendered.unmount()
  })

  test('só os tipos de recebimento são oferecidos, e vêm da rota própria', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)

    await click(byLabel('Tipo da ocorrência'))

    expect(
      [...document.querySelectorAll('[role="option"]')].map((item) => item.textContent?.trim()),
    ).toEqual([
      'Item avariado na chegada',
      'Item faltante na chegada',
      'Divergência de quantidade na chegada',
    ])
    expect(occurrence.calls.listTypes).toBeGreaterThan(0)
    rendered.unmount()
  })

  test('enviar vazio recusa tipo, itens e foto de uma vez, nos campos, sem chamar o servidor', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)

    await submitOccurrence()

    expect(occurrence.calls.register).toHaveLength(0)
    for (const field of ['occurrenceTypeId', 'productCodes', 'file']) {
      expect(dialog()?.querySelectorAll(`[data-field="${field}"] [role="alert"]`).length).toBe(1)
    }
    expect(dialog()?.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(3)
    expect(dialog()?.textContent).toContain('Escolha o tipo da ocorrência.')
    expect(dialog()?.textContent).toContain('Marque ao menos um item da nota.')
    expect(dialog()?.textContent).toContain('Tire ou escolha uma foto da avaria.')
    rendered.unmount()
  })

  test('editar o campo limpa o erro dele, e só o dele', async () => {
    const { rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await submitOccurrence()

    await markItem('P-100')

    expect(dialog()?.textContent).not.toContain('Marque ao menos um item da nota.')
    expect(dialog()?.textContent).toContain('Escolha o tipo da ocorrência.')
    rendered.unmount()
  })

  test('foto de mais de 512 KiB é recusada no campo, com o teto, e nada é enviado', async () => {
    const { occurrence, rendered } = await mountSeparation({ occurrence: { photoBytes: 600 * 1024 } })
    await openOccurrenceForm(1001)
    await fillValidOccurrence()

    await submitOccurrence()

    expect(occurrence.calls.register).toHaveLength(0)
    expect(dialog()?.textContent).toContain('A foto passa de 512 KB')
    rendered.unmount()
  })

  test('tipo de um item só: marcar o segundo troca o primeiro', async () => {
    const { rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await pickOption({ label: 'Tipo da ocorrência', option: 'Divergência de quantidade' })

    await markItem('P-100')
    await markItem('P-200')

    const checked = [...document.querySelectorAll<HTMLInputElement>('[data-product-code] input[type="checkbox"]')]
      .filter((input) => input.checked)
      .map((input) => input.closest('[data-product-code]')?.getAttribute('data-product-code'))
    expect(checked).toEqual(['P-200'])
    rendered.unmount()
  })

  test('quantidade inválida é recusada no campo do item, com o texto do campo', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()

    await typeInArea(byLabel('Quantidade de P-100') as HTMLInputElement, '0')
    await submitOccurrence()

    expect(occurrence.calls.register).toHaveLength(0)
    expect(dialog()?.textContent).toContain('Use uma quantidade maior que zero')
    expect(byLabel('Quantidade de P-100').getAttribute('aria-invalid')).toBe('true')
    rendered.unmount()
  })
})

describe('registrar a avaria', () => {
  test('manda o multipart alinhado, fecha o formulário e a nota passa a mostrar "Avaria aberta"', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    await typeInArea(byLabel('Quantidade de P-100') as HTMLInputElement, '2,5')
    await typeInArea(noteArea(), 'Caixa amassada')
    const readsBefore = occurrence.calls.listOccurrences

    await submitOccurrence()
    await waitFor(() => expect(document.querySelectorAll('[role="dialog"]').length).toBe(0))

    expect(occurrence.calls.register).toHaveLength(1)
    const sent = occurrence.calls.register[0]
    expect(sent).toMatchObject({
      codes: ['P-100'],
      documentId: OCCURRENCE_DOCUMENT_ID_1001,
      note: 'Caixa amassada',
      quantities: ['2.5'],
      units: ['CX'],
    })
    expect(sent?.idempotencyKey.length).toBeGreaterThanOrEqual(16)
    await waitFor(() => expect(text()).toContain('Avaria aberta'))
    expect(occurrence.calls.listOccurrences).toBeGreaterThan(readsBefore)
    rendered.unmount()
  })

  test('o servidor fora da janela responde 422: o formulário fica, explica, e a nota não ganha selo', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(new CargoReceivingRequestError('CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED'))

    await submitOccurrence()

    expect(dialog()).not.toBeNull()
    expect(dialog()?.textContent).toContain('O prazo de separação desta chegada terminou')
    expect(text()).not.toContain('Avaria aberta')
    rendered.unmount()
  })

  test('rede caída: o formulário fica com tudo preenchido e "tentar de novo" reenvia o mesmo envio', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(networkFailure())

    await submitOccurrence()
    expect(dialog()?.textContent).toContain('Sem conexão com o servidor.')
    expect(
      (document.querySelector('[data-product-code="P-100"] input[type="checkbox"]') as HTMLInputElement)
        .checked,
    ).toBe(true)

    await submitOccurrence()
    await waitFor(() => expect(document.querySelectorAll('[role="dialog"]').length).toBe(0))

    expect(occurrence.calls.register).toHaveLength(2)
    rendered.unmount()
  })
})

describe('a chave de idempotência é uma por tentativa', () => {
  test('a mesma tentativa repetida reaproveita a chave e o servidor devolve a ocorrência já gravada', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(networkFailure())

    await submitOccurrence()
    await submitOccurrence()

    const [first, second] = occurrence.calls.register
    expect(first?.idempotencyKey).toBe(second?.idempotencyKey)
    expect(occurrence.occurrences).toHaveLength(1)
    rendered.unmount()
  })

  test('mudar o conteúdo entre as tentativas gera outra chave: nunca o 409 de reuso', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(networkFailure())
    await submitOccurrence()

    await typeInArea(noteArea(), 'Agora com observação')
    await submitOccurrence()

    const [first, second] = occurrence.calls.register
    expect(second?.idempotencyKey).not.toBe(first?.idempotencyKey)
    expect(text()).not.toContain('outros dados')
    rendered.unmount()
  })

  test('um render a mais não troca a chave: digitar e voltar ao mesmo conteúdo mantém a tentativa', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(networkFailure())
    await submitOccurrence()

    await typeInArea(noteArea(), 'x')
    await typeInArea(noteArea(), '')
    await submitOccurrence()

    const [first, second] = occurrence.calls.register
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey)
    rendered.unmount()
  })
})

describe('a recusa do servidor nomeia todos os campos (web.md §11)', () => {
  test('lista cada campo recusado, uma vez, e cada nome leva o foco ao campo', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(
      new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'occurrenceTypeId', message: 'Invalid' },
        { field: 'productCodes', message: 'Invalid' },
        { field: 'productCodes', message: 'Again' },
      ]),
    )

    await submitOccurrence()

    const summary = dialog()?.querySelector('[data-refusal-summary]')
    expect(summary?.textContent).toContain('Confira:')
    const shortcuts = [...(summary?.querySelectorAll('button') ?? [])].map((button) => button.textContent)
    expect(shortcuts).toEqual(['Tipo da ocorrência', 'Itens afetados'])

    await click(summary?.querySelectorAll('button')[1] as HTMLButtonElement)
    expect(document.activeElement?.closest('[data-field="productCodes"]')).not.toBeNull()
    rendered.unmount()
  })

  test('código sem campo nomeado (rede, janela) não inventa campo: só o aviso do código', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(networkFailure())

    await submitOccurrence()

    expect(dialog()?.querySelector('[data-refusal-summary]')).toBeNull()
    expect(dialog()?.querySelectorAll('[role="alert"]').length).toBe(1)
    rendered.unmount()
  })

  test('campo que a tela não conhece chega com o nome cru da API', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    occurrence.failures.push(
      new CargoReceivingRequestError('INVALID_REQUEST', [{ field: 'weirdField', message: 'Invalid' }]),
    )

    await submitOccurrence()

    expect(dialog()?.querySelector('[data-refusal-summary]')?.textContent).toContain('weirdField')
    rendered.unmount()
  })
})

describe('fechar o formulário', () => {
  test('Cancelar fecha sem enviar e devolve o foco ao botão que abriu', async () => {
    const { occurrence, rendered } = await mountSeparation()
    await openOccurrenceForm(1001)

    await click(buttonByText('Cancelar', dialog() as HTMLElement))
    await settle()

    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0)
    expect(occurrence.calls.register).toHaveLength(0)
    rendered.unmount()
  })

  test('Escape fecha; enviando, o formulário não fecha por cima do envio', async () => {
    const { occurrence, rendered } = await mountSeparation({ occurrence: { isGated: true } })
    await openOccurrenceForm(1001)
    await fillValidOccurrence()
    await submitOccurrence()
    expect(occurrence.pending).toHaveLength(1)

    dialog()?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    await settle()

    expect(document.querySelectorAll('[role="dialog"]').length).toBe(1)
    cargoOccurrenceFakes.double.pending.splice(0).forEach((resolve) => resolve())
    rendered.unmount()
  })
})
