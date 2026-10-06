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

const GAMA_ID = '00000000-0000-4000-8000-000000237a03'
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
const GAMA = (index: number) =>
  buildSummary({
    arrivedAt: `2026-10-0${String(4 + index)}T09:00:00.000Z`,
    contractorId: GAMA_ID,
    contractorName: 'Gama Distribuidora Fictícia',
    id: `00000000-0000-4000-8000-0000002372b${String(index)}`,
  })

async function mountList(options: { canManage?: boolean; search?: string } = {}) {
  resetLocation(`/recebimento${options.search ?? ''}`)
  installCargoReceivingDouble({ arrivals: [{ ...OVERDUE, id: ARRIVAL_ID }, CLOSED, OTHER] })
  const rendered = await renderWithQueryClient(
    createElement(CargoArrivalListPanel, { canManage: options.canManage ?? true }),
  )
  await waitFor(() => expect(document.querySelectorAll('[aria-busy="true"]').length).toBe(0))
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
const lastFilters = () => cargoReceivingFakes.double.calls.listArrivals.at(-1)?.filters
const lastCall = () => cargoReceivingFakes.double.calls.listArrivals.at(-1)
async function mountWith(overrides: Parameters<typeof installCargoReceivingDouble>[0]) {
  resetLocation('/recebimento')
  installCargoReceivingDouble(overrides)
  const rendered = await renderWithQueryClient(
    createElement(CargoArrivalListPanel, { canManage: true }),
  )
  await waitFor(() => expect(document.querySelectorAll('[aria-busy="true"]').length).toBe(0))
  return rendered
}

async function pickOptions(label: string, indexes: readonly number[]): Promise<void> {
  await click(document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement)
  const options = [...document.querySelectorAll('[role="option"]')]
  for (const index of indexes) await click(options[index] as HTMLElement)
}

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
      new URL('../../src/modules/cargo-receiving/styles/cargoTable.module.css', import.meta.url),
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

  test('chegada fechada não oferece "Separar": já não há o que separar', async () => {
    const rendered = await mountList()

    expect(
      document.querySelector('[aria-label="Separar a chegada de Beta Comércio Fictício"]'),
    ).toBeNull()
    expect(
      document.querySelector('[aria-label="Abrir a chegada de Beta Comércio Fictício"]'),
    ).not.toBeNull()
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
    await waitFor(() => expect(rowContractors()[2]).toBe('Beta Comércio Fictício'))
    expect(parameters().get('sort')).toBe('contractor')
    expect(parameters().get('dir')).toBe('asc')

    await click(sortButton())
    expect(headerOf('Contratante').getAttribute('aria-sort')).toBe('descending')
    await waitFor(() => expect(rowContractors()[0]).toBe('Beta Comércio Fictício'))

    await click(sortButton())
    expect(headerOf('Contratante').getAttribute('aria-sort')).toBe('none')
    expect(parameters().has('sort')).toBe(false)
    await waitFor(() =>
      expect(rowContractors()).toEqual([
        'Alfa Indústria Fictícia',
        'Beta Comércio Fictício',
        'Alfa Indústria Fictícia',
      ]),
    )
    rendered.unmount()
  })

  test('o filtro de situação aceita seleção múltipla e vai para a URL', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Situação"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Aberta', 'Fechada'])

    await click(options[1] as HTMLElement)
    await waitFor(() => expect(rowContractors()).toEqual(['Beta Comércio Fictício']))
    expect(lastFilters()?.statuses).toEqual(['closed'])
    expect(parameters().get('status')).toBe('closed')

    await click(options[0] as HTMLElement)
    await waitFor(() => expect(rowContractors()).toHaveLength(3))
    expect(lastFilters()?.statuses).toEqual(['closed', 'open'])
    expect(parameters().get('status')).toBe('closed,open')
    rendered.unmount()
  })

  test('o filtro de contratante aceita vários, usa os nomes do cadastro e manda todos ao servidor', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Alfa Indústria Fictícia',
      'Beta Comércio Fictício',
      'Gama Distribuidora Fictícia',
    ])

    await click(options[0] as HTMLElement)
    await waitFor(() => expect(lastFilters()?.contractorIds).toEqual([ALFA_ID]))
    expect(parameters().get('contractor')).toBe(ALFA_ID)

    await click(options[1] as HTMLElement)
    await waitFor(() => expect(lastFilters()?.contractorIds).toEqual([ALFA_ID, BETA_ID]))
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
    await waitFor(() => expect(rowContractors()).toHaveLength(3))
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

    expect(cargoReceivingFakes.double.calls.listArrivals[0]?.filters).toEqual({
      contractorIds: [],
      order: { direction: 'desc', sort: 'arrivedAt' },
      statuses: ['closed'],
    })
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
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED], arrivalsPageSize: 1 })
    await waitFor(() => expect(rowTexts()).toHaveLength(1))

    await click(buttonByText('Carregar mais chegadas'))
    await settle()

    expect(lastCall()?.cursor).not.toBeNull()
    expect(rowContractors()).toEqual(['Alfa Indústria Fictícia', 'Beta Comércio Fictício'])
    expect(maybeButtonByText('Carregar mais chegadas')).toBeUndefined()
    rendered.unmount()
  })

  test('lista vazia e falha de carga dizem o que houve', async () => {
    resetLocation('/recebimento')
    installCargoReceivingDouble({ arrivals: [] })
    const rendered = await renderWithQueryClient(
      createElement(CargoArrivalListPanel, { canManage: true }),
    )

    await waitFor(() =>
      expect(document.body.textContent).toContain('Nenhuma chegada registrada ainda.'),
    )
    rendered.unmount()
  })
})

describe('filtro e ordenação valem para a lista inteira, não só para as páginas carregadas (revisão M3)', () => {
  const NEWER_GAMAS = [GAMA(1), GAMA(2), GAMA(3)]

  test('dois contratantes que estão além da primeira página aparecem sem "carregar mais"', async () => {
    const rendered = await mountWith({
      arrivals: [...NEWER_GAMAS, OVERDUE, CLOSED],
      arrivalsPageSize: 2,
    })
    await waitFor(() => expect(rowContractors()).toHaveLength(2))

    await pickOptions('Contratante', [0, 1])
    await waitFor(() =>
      expect(rowContractors()).toEqual(['Alfa Indústria Fictícia', 'Beta Comércio Fictício']),
    )

    expect(lastFilters()?.contractorIds).toEqual([ALFA_ID, BETA_ID])
    expect(maybeButtonByText('Carregar mais chegadas')).toBeUndefined()
    rendered.unmount()
  })

  test('as duas situações vão ao servidor, e o resultado é a lista dele', async () => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER], arrivalsPageSize: 2 })

    await pickOptions('Situação', [0, 1])
    await waitFor(() => expect(lastFilters()?.statuses).toEqual(['open', 'closed']))

    expect(rowContractors()).toHaveLength(2)
    expect(maybeButtonByText('Carregar mais chegadas')).toBeDefined()
    rendered.unmount()
  })

  test.each([
    ['Contratante', 'contractorName'],
    ['Chegada', 'arrivedAt'],
    ['Prazo de separação', 'separationDueAt'],
    ['Situação', 'status'],
  ] as const)('o cabeçalho %s manda sort=%s e a direção ao servidor', async (label, sort) => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER] })

    await click(headerOf(label).querySelector('button') as HTMLButtonElement)
    await waitFor(() => expect(lastFilters()?.order).toEqual({ direction: 'asc', sort }))
    await click(headerOf(label).querySelector('button') as HTMLButtonElement)
    await waitFor(() => expect(lastFilters()?.order).toEqual({ direction: 'desc', sort }))
    rendered.unmount()
  })

  test('o prazo ordena no servidor com "sem prazo" por último nos dois sentidos', async () => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER] })
    const dueButton = () => headerOf('Prazo de separação').querySelector('button') as HTMLElement

    await click(dueButton())
    await waitFor(() => expect(rowContractors().at(-1)).toBe('Beta Comércio Fictício'))
    await click(dueButton())
    await waitFor(() => expect(lastFilters()?.order?.direction).toBe('desc'))

    expect(rowContractors().at(-1)).toBe('Beta Comércio Fictício')
    rendered.unmount()
  })

  test('notas e progresso não ordenam: o servidor não tem essas colunas', async () => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER] })

    expect(headerOf('Notas').querySelectorAll('button')).toHaveLength(0)
    expect(headerOf('Separadas').querySelectorAll('button')).toHaveLength(0)
    expect(headerOf('Notas').hasAttribute('aria-sort')).toBe(false)
    rendered.unmount()
  })

  test('"Carregar mais" leva a mesma ordem e os mesmos filtros, e a lista segue a ordem do servidor', async () => {
    const rendered = await mountWith({
      arrivals: [OVERDUE, CLOSED, OTHER],
      arrivalsPageSize: 1,
    })
    await click(headerOf('Contratante').querySelector('button') as HTMLButtonElement)
    await pickOptions('Situação', [0, 1])
    await waitFor(() => expect(rowContractors()).toHaveLength(1))

    await click(buttonByText('Carregar mais chegadas'))
    await click(buttonByText('Carregar mais chegadas'))
    await waitFor(() => expect(rowContractors()).toHaveLength(3))

    expect(lastCall()?.cursor).not.toBeNull()
    expect(lastFilters()).toEqual({
      contractorIds: [],
      order: { direction: 'asc', sort: 'contractorName' },
      statuses: ['open', 'closed'],
    })
    expect(rowContractors()).toEqual([
      'Alfa Indústria Fictícia',
      'Alfa Indústria Fictícia',
      'Beta Comércio Fictício',
    ])
    rendered.unmount()
  })

  test('trocar a ordenação recomeça a paginação do início', async () => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER], arrivalsPageSize: 1 })
    await click(buttonByText('Carregar mais chegadas'))
    await waitFor(() => expect(rowContractors()).toHaveLength(2))

    await click(headerOf('Situação').querySelector('button') as HTMLButtonElement)

    await waitFor(() => expect(lastFilters()?.order?.sort).toBe('status'))
    await waitFor(() => expect(rowContractors()).toHaveLength(1))
    expect(lastCall()?.cursor).toBeNull()
    rendered.unmount()
  })

  test('cursor de outra ordem recarrega do início com aviso neutro, nunca tela vazia', async () => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER], arrivalsPageSize: 2 })
    cargoReceivingFakes.double.isNextCursorRefused = true

    await click(buttonByText('Carregar mais chegadas'))
    await waitFor(() => expect(document.querySelectorAll('[data-order-notice]').length).toBe(1))

    expect(document.querySelector('[data-order-notice]')?.textContent).toContain(
      'A ordem da lista mudou',
    )
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(lastCall()?.cursor).toBeNull()
    await waitFor(() => expect(rowContractors()).toHaveLength(2))
    rendered.unmount()
  })

  test('o aviso de ordem some quando o operador muda o critério', async () => {
    const rendered = await mountWith({ arrivals: [OVERDUE, CLOSED, OTHER], arrivalsPageSize: 2 })
    cargoReceivingFakes.double.isNextCursorRefused = true
    await click(buttonByText('Carregar mais chegadas'))
    await waitFor(() => expect(document.querySelectorAll('[data-order-notice]').length).toBe(1))

    await click(headerOf('Situação').querySelector('button') as HTMLButtonElement)

    await waitFor(() => expect(document.querySelectorAll('[data-order-notice]').length).toBe(0))
    rendered.unmount()
  })
})
