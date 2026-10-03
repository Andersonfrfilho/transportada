/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9, decisão do usuário: "vai ser pelo celular"): a primeira separação montada de
 * verdade — grupos rota × cidade recolhíveis, o botão grande que avança a nota com um toque, "separar
 * tudo deste grupo" passando por `received`, a atualização otimista que volta quando o servidor recusa,
 * o toque que falha ficando na tela com "tentar de novo" e o aviso de "sem conexão". Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { act } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoSeparationScreen } from '@/modules/cargo-receiving/components/CargoSeparationScreen.component'

import {
  ARRIVAL_ID,
  buildDetail,
  buildDocument,
  documentIdOf,
} from '../fixtures/cargoReceiving.fixture'
import {
  buttonByText,
  byLabel,
  click,
  fieldByLabel,
  installCargoReceivingDouble,
  maybeButtonByText,
  maybeByLabel,
  networkFailure,
  release,
  resetLocation,
  typeInto,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

async function mountSeparation(
  options: { canManage?: boolean } & Partial<CargoReceivingDouble> = {},
) {
  const { canManage = true, ...overrides } = options
  resetLocation(`/recebimento/${ARRIVAL_ID}`)
  const double = installCargoReceivingDouble(overrides)
  const rendered = await renderWithQueryClient(
    createElement(CargoSeparationScreen, { arrivalId: ARRIVAL_ID, canManage }),
  )
  await waitFor(() => expect(document.body.textContent).toContain('Alfa Indústria Fictícia'))
  return { double, rendered }
}

const step = (number: number, label: string) =>
  byLabel(`${label} — NF ${String(number)}`) as HTMLButtonElement
const maybeStep = (number: number, label: string) =>
  maybeByLabel(`${label} — NF ${String(number)}`) as HTMLButtonElement | null
const text = () => document.body.textContent ?? ''
const groupToggle = (title: string) =>
  byLabel(`Mostrar ou esconder o grupo ${title}`) as HTMLButtonElement

function setOnline(isOnline: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => isOnline })
  window.dispatchEvent(new Event(isOnline ? 'online' : 'offline'))
}

beforeEach(() => {
  document.body.innerHTML = ''
  setOnline(true)
})

describe('a tela do celular (spec 237 T2.4)', () => {
  test('mostra contratante, progresso e prazo no cabeçalho compacto', async () => {
    const { rendered } = await mountSeparation()

    expect(document.querySelector('h1')?.textContent).toBe('Alfa Indústria Fictícia')
    expect(text()).toContain('1 de 7 separadas')
    expect(text()).toContain('Prazo de separação:')
    rendered.unmount()
  })

  test('o primeiro grupo com pendência abre e os outros ficam recolhidos', async () => {
    const { rendered } = await mountSeparation()

    expect(groupToggle('FR.S.CAR · Piracicaba').getAttribute('aria-expanded')).toBe('true')
    expect(groupToggle('FR.S.CAR · Limeira').getAttribute('aria-expanded')).toBe('false')
    expect(maybeStep(1001, 'Marcar como recebida')).not.toBeNull()
    expect(maybeStep(1004, 'Marcar como recebida')).toBeNull()
    rendered.unmount()
  })

  test('cada grupo diz a rota, a cidade que a API devolveu e quanto falta', async () => {
    const { rendered } = await mountSeparation()

    expect(groupToggle('FR.S.CAR · Piracicaba').textContent).toContain('1 de 3 separadas')
    expect(groupToggle('Sem rota · Sem cidade').textContent).toContain('0 de 1 separadas')
    await click(groupToggle('FR.S.CAR · Limeira'))
    expect(maybeStep(1004, 'Marcar como recebida')).not.toBeNull()
    rendered.unmount()
  })

  test('o botão mostra o próximo passo em texto, e a nota separada não tem próximo', async () => {
    const { rendered } = await mountSeparation()

    expect(step(1001, 'Marcar como recebida').textContent).toContain('Marcar como recebida')
    expect(step(1002, 'Marcar como separada').textContent).toContain('Marcar como separada')
    const done = byLabel('Separada — NF 1003') as HTMLButtonElement
    expect(done.disabled).toBe(true)
    rendered.unmount()
  })

  test('o alvo de toque do botão vem do token do painel, nunca de um px solto', () => {
    const read = (name: string) =>
      readFileSync(
        new URL(`../../src/modules/cargo-receiving/styles/${name}.module.css`, import.meta.url),
        'utf8',
      )
    const stylesheets = ['cargoSeparation', 'cargoSeparationRow'].map(read)

    expect(read('cargoSeparationRow')).toMatch(
      /\.stepButton\s*\{[^}]*min-height:\s*var\(--touch-target\)/u,
    )
    for (const css of stylesheets) {
      // A borda fina de 1px é a do painel inteiro; qualquer outra medida em px é medida solta.
      expect(css.replaceAll('1px', '')).not.toMatch(/\d+px/u)
      expect(css).not.toMatch(/@media[^{]*max-width/u)
    }
  })
})

describe('um toque avança a nota', () => {
  test('esperada → recebida → separada, com o contador do grupo acompanhando', async () => {
    const { double, rendered } = await mountSeparation()

    await click(step(1001, 'Marcar como recebida'))
    await settle()
    expect(double.calls.batch).toEqual([{ documentIds: [documentIdOf(1001)], to: 'received' }])
    expect(maybeStep(1001, 'Marcar como separada')).not.toBeNull()

    await click(step(1001, 'Marcar como separada'))
    await settle()
    expect(double.calls.batch.at(-1)).toEqual({
      documentIds: [documentIdOf(1001)],
      to: 'separated',
    })
    expect((byLabel('Separada — NF 1001') as HTMLButtonElement).disabled).toBe(true)
    expect(groupToggle('FR.S.CAR · Piracicaba').textContent).toContain('2 de 3 separadas')
    expect(text()).toContain('2 de 7 separadas')
    rendered.unmount()
  })

  test('a tela muda na hora, antes de o servidor responder', async () => {
    const { double, rendered } = await mountSeparation({ isGated: true })

    await click(step(1001, 'Marcar como recebida'))

    expect(maybeStep(1001, 'Marcar como separada')).not.toBeNull()
    expect(double.pending).toHaveLength(1)
    await release(double)
    await settle()
    expect(maybeStep(1001, 'Marcar como separada')).not.toBeNull()
    rendered.unmount()
  })

  test('recusada pelo servidor, a nota volta ao estado anterior e o motivo aparece na linha', async () => {
    const { double, rendered } = await mountSeparation({ isGated: true })
    double.refusals.set(`received:${documentIdOf(1001)}`, 'CARGO_ARRIVAL_CLOSED')

    await click(step(1001, 'Marcar como recebida'))
    expect(maybeStep(1001, 'Marcar como separada')).not.toBeNull()

    await release(double)
    await settle()

    expect(maybeStep(1001, 'Marcar como recebida')).not.toBeNull()
    expect(maybeStep(1001, 'Marcar como separada')).toBeNull()
    expect(text()).toContain('Recusada: a chegada está fechada')
    expect(groupToggle('FR.S.CAR · Piracicaba').textContent).toContain('1 de 3 separadas')
    rendered.unmount()
  })
})

describe('o toque que falha fica na tela', () => {
  test('sem conexão: a nota volta, o motivo aparece e "tentar de novo" refaz o mesmo toque', async () => {
    const { double, rendered } = await mountSeparation()
    double.failures.push(networkFailure())

    await click(step(1001, 'Marcar como recebida'))
    await settle()

    expect(maybeStep(1001, 'Marcar como recebida')).not.toBeNull()
    expect(text()).toContain('Não foi possível enviar: Sem conexão com o servidor.')

    await click(byLabel('Tentar de novo — NF 1001'))
    await settle()

    expect(double.calls.batch).toEqual([
      { documentIds: [documentIdOf(1001)], to: 'received' },
      { documentIds: [documentIdOf(1001)], to: 'received' },
    ])
    expect(maybeStep(1001, 'Marcar como separada')).not.toBeNull()
    expect(text()).not.toContain('Não foi possível enviar')
    rendered.unmount()
  })

  test('o aviso de "sem conexão" aparece quando o aparelho fica offline e some quando volta', async () => {
    const { rendered } = await mountSeparation()
    expect(text()).not.toContain('Sem conexão. O toque que falhar fica na tela')

    await act(async () => {
      setOnline(false)
      await Promise.resolve()
    })
    expect(text()).toContain('Sem conexão. O toque que falhar fica na tela para tentar de novo.')

    await act(async () => {
      setOnline(true)
      await Promise.resolve()
    })
    expect(text()).not.toContain('Sem conexão. O toque que falhar fica na tela')
    rendered.unmount()
  })
})

describe('separar tudo deste grupo', () => {
  test('recebe as esperadas e depois separa todas — nunca pula received', async () => {
    const { double, rendered } = await mountSeparation()

    await click(buttonByText('Separar tudo deste grupo'))
    await settle()

    expect(double.calls.batch).toEqual([
      { documentIds: [documentIdOf(1001)], to: 'received' },
      { documentIds: [documentIdOf(1001), documentIdOf(1002)], to: 'separated' },
    ])
    expect(groupToggle('FR.S.CAR · Piracicaba').textContent).toContain('3 de 3 separadas')
    const outcome = document.querySelector('[data-batch-outcome]') as HTMLElement
    expect(outcome.textContent).toContain('2 alteradas, 0 sem mudança, 0 recusadas.')
    rendered.unmount()
  })

  test('terminado o grupo, ele recolhe, o próximo com pendência abre e o terminado diz que acabou', async () => {
    const { rendered } = await mountSeparation()

    await click(buttonByText('Separar tudo deste grupo'))
    await settle()

    expect(groupToggle('FR.S.CAR · Piracicaba').getAttribute('aria-expanded')).toBe('false')
    expect(groupToggle('FR.S.CAR · Limeira').getAttribute('aria-expanded')).toBe('true')
    await click(groupToggle('FR.S.CAR · Piracicaba'))
    expect(text()).toContain('Grupo todo separado')
    rendered.unmount()
  })

  test('uma nota recusada no lote não derruba as outras e o resultado mostra todas', async () => {
    const { double, rendered } = await mountSeparation()
    double.refusals.set(`received:${documentIdOf(1001)}`, 'CARGO_ARRIVAL_CLOSED')

    await click(buttonByText('Separar tudo deste grupo'))
    await settle()

    expect(double.calls.batch[1]).toEqual({ documentIds: [documentIdOf(1002)], to: 'separated' })
    expect((byLabel('Separada — NF 1002') as HTMLButtonElement).disabled).toBe(true)
    expect(maybeStep(1001, 'Marcar como recebida')).not.toBeNull()
    const outcome = document.querySelector('[data-batch-outcome]') as HTMLElement
    expect(outcome.textContent).toContain('NF 1001')
    expect(outcome.textContent).toContain('a chegada está fechada')
    expect(outcome.textContent).toContain('1 alteradas, 0 sem mudança, 1 recusadas.')
    rendered.unmount()
  })
})

describe('a busca por número da nota', () => {
  test('filtra, abre o grupo da nota e esconde os outros', async () => {
    const { rendered } = await mountSeparation()

    await typeInto(fieldByLabel('Buscar nota'), '1004')

    expect(maybeStep(1004, 'Marcar como recebida')).not.toBeNull()
    expect(maybeStep(1001, 'Marcar como recebida')).toBeNull()
    expect(maybeByLabel('Mostrar ou esconder o grupo FR.S.CAR · Piracicaba')).toBeNull()
    rendered.unmount()
  })

  test('sem resposta diz que nenhuma nota tem esse número', async () => {
    const { rendered } = await mountSeparation()

    await typeInto(fieldByLabel('Buscar nota'), '9999')

    expect(text()).toContain('Nenhuma nota com esse número.')
    rendered.unmount()
  })

  test('oferece a leitura da chave de acesso pela câmera', async () => {
    const { rendered } = await mountSeparation()

    expect(byLabel('Ler a chave de acesso')).not.toBeNull()
    rendered.unmount()
  })
})

describe('chegada fechada e quem só lê', () => {
  test('fechada: o botão não existe e o aviso diz por quê', async () => {
    const { rendered } = await mountSeparation({
      server: buildDetail({
        documents: [buildDocument({ number: '1', separationState: 'separated' })],
        status: 'closed',
      }),
    })

    expect(text()).toContain('Chegada fechada: só leitura.')
    expect(maybeButtonByText('Separar tudo deste grupo')).toBeUndefined()
    rendered.unmount()
  })

  test('quem só tem leitura vê o estado de cada nota, mas nenhum botão de toque', async () => {
    const { rendered } = await mountSeparation({ canManage: false })

    expect(maybeStep(1001, 'Marcar como recebida')).toBeNull()
    expect(maybeButtonByText('Separar tudo deste grupo')).toBeUndefined()
    expect(text()).toContain('Esperada')
    rendered.unmount()
  })
})
