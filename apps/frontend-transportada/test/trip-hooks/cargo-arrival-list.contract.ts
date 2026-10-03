/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9, `web.md` §7): a lista de chegadas montada de verdade — contratante, hora, notas,
 * barra de separadas, prazo com o selo "Vencida", situação; ordenação por cabeçalho, filtros de seleção
 * múltipla, "limpar filtros" só com critério, estado na URL e paginação por cursor. Dados sintéticos.
 */
import { readFileSync } from 'node:fs'

import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoArrivalListPanel } from '@/modules/cargo-receiving/components/CargoArrivalListPanel.component'

import {
  ALFA_ID,
  ARRIVAL_ID,
  BETA_ID,
  CLOSED_ARRIVAL_ID,
  buildSummary,
} from '../fixtures/cargoReceiving.fixture'
import {
  buttonByText,
  byLabel,
  cargoReceivingFakes,
  click,
  installCargoReceivingDouble,
  maybeButtonByText,
  resetLocation,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const OVERDUE = buildSummary({
  counts: { expected: 2, received: 0, separated: 2, total: 4 },
  isSeparationOverdue: true,
})
const CLOSED = buildSummary({
  arrivedAt: '2026-10-02T09:00:00.000Z',
  contractorId: BETA_ID,
  contractorName: 'Beta Comércio Fictício',
  counts: { expected: 0, received: 0, separated: 10, total: 10 },
  id: CLOSED_ARRIVAL_ID,
  separationDueAt: null,
  separationWindowHours: null,
  status: 'closed',
})
const OTHER = buildSummary({
  arrivedAt: '2026-10-01T09:00:00.000Z',
  counts: { expected: 5, received: 0, separated: 0, total: 5 },
  id: '00000000-0000-4000-8000-0000002372a3',
})

async function mountList(options: { canManage?: boolean; search?: string } = {}) {
  resetLocation(`/recebimento${options.search ?? ''}`)
  installCargoReceivingDouble({ arrivals: [{ ...OVERDUE, id: ARRIVAL_ID }, CLOSED, OTHER] })
  const rendered = await renderWithQueryClient(
    createElement(CargoArrivalListPanel, { canManage: options.canManage ?? true }),
  )
  await waitFor(() => expect(rowTexts().length).toBeGreaterThan(0))
  return rendered
}

function rowTexts(): string[] {
  return [...document.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')
}

function rowContractors(): string[] {
  return [...document.querySelectorAll('tbody tr')].map(
    (row) => row.querySelector('td')?.textContent?.trim() ?? '',
  )
}

function headerOf(label: string): HTMLTableCellElement {
  const header = [...document.querySelectorAll('thead th')].find((cell) =>
    (cell.textContent ?? '').trim().startsWith(label),
  )
  if (header === undefined) throw new Error(`HEADER_NOT_FOUND:${label}`)
  return header as HTMLTableCellElement
}

const parameters = () => new URLSearchParams(window.location.search)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a lista de chegadas (spec 237 T2.4)', () => {
  test('mostra contratante, notas, separadas, prazo, selo "Vencida" e situação', async () => {
    const rendered = await mountList()

    const [first, second] = rowTexts()
    expect(rowContractors()).toEqual([
      'Alfa Indústria Fictícia',
      'Beta Comércio Fictício',
      'Alfa Indústria Fictícia',
    ])
    expect(first).toContain('2 de 4 separadas')
    expect(first).toContain('Vencida')
    expect(first).toContain('Aberta')
    expect(second).toContain('10 de 10 separadas')
    expect(second).toContain('Fechada')
    expect(second).toContain('Sem prazo')
    expect(second).not.toContain('Vencida')
    expect(rowTexts()[2]).not.toContain('Vencida')
    rendered.unmount()
  })

  test('a barra de progresso diz o que foi separado, em texto e para o leitor de tela', async () => {
    const rendered = await mountList()

    const bars = [...document.querySelectorAll('[role="progressbar"]')]
    expect(bars.map((bar) => bar.getAttribute('aria-valuetext'))).toEqual([
      '2 de 4 separadas',
      '10 de 10 separadas',
      '0 de 5 separadas',
    ])
    rendered.unmount()
  })

  test('a zebra é regra de CSS por classe e token; nenhuma linha leva estilo inline', async () => {
    const rendered = await mountList()
    const css = readFileSync(
      new URL('../../src/modules/cargo-receiving/styles/cargoReceiving.module.css', import.meta.url),
      'utf8',
    )

    expect(document.querySelectorAll('tbody tr[style]')).toHaveLength(0)
    expect(css).toContain('.table tbody tr:nth-child(even) {\n  background: var(--color-graphite);')
    rendered.unmount()
  })

  test('abrir leva ao detalhe do escritório e separar leva à tela do celular', async () => {
    const rendered = await mountList()

    await click(byLabel('Abrir a chegada de Beta Comércio Fictício'))
    expect(window.location.pathname).toBe(`/recebimento/${CLOSED_ARRIVAL_ID}/detalhe`)

    await click(byLabel('Separar a chegada de Alfa Indústria Fictícia'))
    expect(window.location.pathname).toBe(`/recebimento/${ARRIVAL_ID}`)
    rendered.unmount()
  })

  test('quem só lê não vê "Registrar chegada" nem "Separar"', async () => {
    const rendered = await mountList({ canManage: false })

    expect(maybeButtonByText('Registrar chegada')).toBeUndefined()
    expect(document.querySelector('[aria-label^="Separar a chegada"]')).toBeNull()
    expect(document.querySelector('[aria-label^="Abrir a chegada"]')).not.toBeNull()
    rendered.unmount()
  })

  test('"Registrar chegada" leva à tela de registro', async () => {
    const rendered = await mountList()

    await click(buttonByText('Registrar chegada'))

    expect(window.location.pathname).toBe('/recebimento/nova')
    rendered.unmount()
  })
})

describe('ordenação, filtros e URL', () => {
  test('o cabeçalho alterna ascendente, descendente e neutro, e a URL acompanha', async () => {
    const rendered = await mountList()
    const sortButton = () => headerOf('Contratante').querySelector('button') as HTMLButtonElement
    expect(headerOf('Contratante').getAttribute('aria-sort')).toBe('none')

    await click(sortButton())
    expect(headerOf('Contratante').getAttribute('aria-sort')).toBe('ascending')
    expect(rowContractors()[2]).toBe('Beta Comércio Fictício')
    expect(parameters().get('sort')).toBe('contractor')
    expect(parameters().get('dir')).toBe('asc')

    await click(sortButton())
    expect(headerOf('Contratante').getAttribute('aria-sort')).toBe('descending')
    expect(rowContractors()[0]).toBe('Beta Comércio Fictício')

    await click(sortButton())
    expect(headerOf('Contratante').getAttribute('aria-sort')).toBe('none')
    expect(parameters().has('sort')).toBe(false)
    rendered.unmount()
  })

  test('o filtro de situação aceita seleção múltipla e vai para a URL', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Situação"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Aberta', 'Fechada'])

    await click(options[1] as HTMLElement)
    expect(rowContractors()).toEqual(['Beta Comércio Fictício'])
    expect(parameters().get('status')).toBe('closed')

    await click(options[0] as HTMLElement)
    expect(rowContractors()).toHaveLength(3)
    expect(parameters().get('status')).toBe('closed,open')
    rendered.unmount()
  })

  test('o filtro de contratante aceita vários, usa os nomes do cadastro e filtra no servidor com um só', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Alfa Indústria Fictícia',
      'Beta Comércio Fictício',
      'Gama Distribuidora Fictícia',
    ])

    await click(options[0] as HTMLElement)
    await waitFor(() =>
      expect(cargoReceivingFakes.double.calls.listArrivals.at(-1)?.filters).toEqual({
        contractorId: ALFA_ID,
      }),
    )
    expect(parameters().get('contractor')).toBe(ALFA_ID)

    await click(options[1] as HTMLElement)
    expect(parameters().get('contractor')).toBe(`${ALFA_ID},${BETA_ID}`)
    rendered.unmount()
  })

  test('"Limpar filtros" só aparece com critério aplicado e devolve a lista inteira', async () => {
    const rendered = await mountList()
    expect(maybeButtonByText('Limpar filtros')).toBeUndefined()

    await click(headerOf('Contratante').querySelector('button') as HTMLButtonElement)
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()

    await click(buttonByText('Limpar filtros'))
    expect(maybeButtonByText('Limpar filtros')).toBeUndefined()
    expect(rowContractors()).toEqual([
      'Alfa Indústria Fictícia',
      'Beta Comércio Fictício',
      'Alfa Indústria Fictícia',
    ])
    expect(parameters().has('sort')).toBe(false)
    rendered.unmount()
  })

  test('a URL reabre a lista filtrada e ordenada', async () => {
    const rendered = await mountList({ search: '?status=closed&sort=arrivedAt&dir=desc' })

    expect(rowContractors()).toEqual(['Beta Comércio Fictício'])
    expect(headerOf('Chegada').getAttribute('aria-sort')).toBe('descending')
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()
    rendered.unmount()
  })

  test('filtro sem resposta diz que nenhuma chegada tem esses filtros', async () => {
    const rendered = await mountList({ search: `?contractor=${BETA_ID}&status=open` })

    expect(rowContractors()).toEqual([])
    expect(document.body.textContent).toContain('Nenhuma chegada com esses filtros.')
    rendered.unmount()
  })
})

describe('paginação por cursor', () => {
  test('"Carregar mais chegadas" só existe com próxima página e acumula sem trocar a lista', async () => {
    resetLocation('/recebimento')
    const double = installCargoReceivingDouble({
      arrivals: [OVERDUE],
      nextArrivalsCursor: 'proxima',
    })
    const rendered = await renderWithQueryClient(
      createElement(CargoArrivalListPanel, { canManage: true }),
    )
    await waitFor(() => expect(rowTexts()).toHaveLength(1))

    await click(buttonByText('Carregar mais chegadas'))
    await settle()

    expect(double.calls.listArrivals.at(-1)?.cursor).toBe('proxima')
    expect(rowTexts()).toHaveLength(1)
    expect(maybeButtonByText('Carregar mais chegadas')).toBeUndefined()
    rendered.unmount()
  })

  test('lista vazia e falha de carga dizem o que houve', async () => {
    resetLocation('/recebimento')
    installCargoReceivingDouble({ arrivals: [] })
    const rendered = await renderWithQueryClient(
      createElement(CargoArrivalListPanel, { canManage: true }),
    )

    await waitFor(() => expect(document.body.textContent).toContain('Nenhuma chegada registrada ainda.'))
    rendered.unmount()
  })
})
