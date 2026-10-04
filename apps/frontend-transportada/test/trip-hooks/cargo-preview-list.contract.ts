/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (RF9, `web.md` §7): a lista de prévias montada de verdade — contratante, arquivo (só o nome),
 * recebida em, dia planejado, linhas e situação da leitura; ordenação por cabeçalho, filtros de seleção
 * múltipla, "limpar filtros" só com critério, estado na URL e o repolling que só existe enquanto há prévia
 * na fila ou sendo lida. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoPreviewListPanel } from '@/modules/cargo-receiving/components/CargoPreviewListPanel.component'

import {
  buildPreviewSummary,
  PREVIEW_ID,
  PREVIEW_SECOND_ID,
  PREVIEW_THIRD_ID,
} from '../fixtures/cargoPreview.fixture'
import { ALFA_ID, BETA_ID } from '../fixtures/cargoReceiving.fixture'
import { cargoPreviewFakes, installCargoPreviewDouble } from './cargoPreviewHarness.helper'
import {
  buttonByText,
  click,
  installCargoReceivingDouble,
  maybeButtonByText,
  resetLocation,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const READY = buildPreviewSummary({ id: PREVIEW_ID })
const QUEUED = buildPreviewSummary({
  contractorId: BETA_ID,
  contractorName: 'Beta Comércio Fictício',
  fileName: 'BETA-01-10.xlsx',
  id: PREVIEW_SECOND_ID,
  plannedDate: null,
  receivedAt: '2026-10-01T10:00:00.000Z',
  rowCount: null,
  status: 'queued',
})
const FAILED = buildPreviewSummary({
  errorCode: 'PREVIEW_COLUMN_NOT_FOUND',
  fileName: 'FR-28-09.xlsm',
  id: PREVIEW_THIRD_ID,
  plannedDate: '2026-09-28',
  receivedAt: '2026-09-25T19:33:00.000Z',
  rowCount: null,
  status: 'failed',
})

async function mountList(
  options: { canManage?: boolean; previews?: (typeof READY)[]; search?: string } = {},
) {
  resetLocation(`/recebimento/previas${options.search ?? ''}`)
  installCargoReceivingDouble()
  installCargoPreviewDouble({ previews: options.previews ?? [READY, QUEUED, FAILED] })
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewListPanel, { canManage: options.canManage ?? true }),
  )
  await waitFor(() => expect(document.querySelectorAll('[aria-busy="true"]').length).toBe(0))
  return rendered
}

const rowTexts = () =>
  [...document.querySelectorAll('tbody tr')].map((row) => row.textContent ?? '')
const rowFiles = () =>
  [...document.querySelectorAll('tbody tr')].map(
    (row) => row.querySelectorAll('td')[1]?.textContent?.trim() ?? '',
  )
const parameters = () => new URLSearchParams(window.location.search)

function headerOf(label: string): HTMLTableCellElement {
  const header = [...document.querySelectorAll('thead th')].find((cell) =>
    (cell.textContent ?? '').trim().startsWith(label),
  )
  if (header === undefined) throw new Error(`HEADER_NOT_FOUND:${label}`)
  return header as HTMLTableCellElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a lista de prévias (spec 237 T4.4)', () => {
  test('mostra contratante, só o nome do arquivo, dia planejado, linhas e a situação da leitura', async () => {
    const rendered = await mountList()

    const [ready, queued, failed] = rowTexts()
    expect(ready).toContain('Alfa Indústria Fictícia')
    expect(ready).toContain('FR-05-10.xlsm')
    expect(ready).toContain('Pronta')
    expect(ready).toContain('7')
    expect(queued).toContain('Na fila')
    expect(queued).toContain('BETA-01-10.xlsx')
    expect(failed).toContain('Falhou')
    rendered.unmount()
  })

  test('a prévia que falhou diz o motivo legível, nunca o código cru', async () => {
    const rendered = await mountList()

    expect(rowTexts()[2]).toContain('coluna')
    expect(rowTexts()[2]).not.toContain('PREVIEW_COLUMN_NOT_FOUND')
    rendered.unmount()
  })

  test('sem dia planejado ou sem linhas lidas a célula mostra um traço, nunca "null"', async () => {
    const rendered = await mountList()

    expect(rowTexts()[1]).not.toContain('null')
    expect(rowTexts()[1]).toContain('—')
    rendered.unmount()
  })

  test('abrir leva ao detalhe da prévia', async () => {
    const rendered = await mountList()

    await click(
      document.querySelector(
        '[aria-label="Abrir a prévia de Alfa Indústria Fictícia"]',
      ) as HTMLElement,
    )

    expect(window.location.pathname).toBe(`/recebimento/previas/${PREVIEW_ID}`)
    rendered.unmount()
  })

  test('lista vazia diz que nenhuma prévia foi enviada', async () => {
    const rendered = await mountList({ previews: [] })

    expect(document.body.textContent).toContain('Nenhuma prévia enviada ainda.')
    rendered.unmount()
  })
})

describe('o envio só existe para quem pode escrever', () => {
  test('com trip.manage o painel de envio aparece; só leitura vê a lista e abre o detalhe', async () => {
    const withManage = await mountList()
    expect(document.querySelector('[data-preview-upload]')).not.toBeNull()
    withManage.unmount()
    document.body.innerHTML = ''

    const readOnly = await mountList({ canManage: false })
    expect(document.querySelector('[data-preview-upload]')).toBeNull()
    expect(maybeButtonByText('Enviar planilha')).toBeUndefined()
    expect(document.querySelector('[aria-label^="Abrir a prévia"]')).not.toBeNull()
    readOnly.unmount()
  })
})

describe('ordenação, filtros e URL', () => {
  test('o cabeçalho alterna ascendente, descendente e neutro, e a URL acompanha', async () => {
    const rendered = await mountList()
    const sortButton = () => headerOf('Arquivo').querySelector('button') as HTMLButtonElement

    await click(sortButton())
    expect(headerOf('Arquivo').getAttribute('aria-sort')).toBe('ascending')
    expect(rowFiles()).toEqual(['BETA-01-10.xlsx', 'FR-05-10.xlsm', 'FR-28-09.xlsm'])
    expect(parameters().get('sort')).toBe('fileName')
    expect(parameters().get('dir')).toBe('asc')

    await click(sortButton())
    expect(headerOf('Arquivo').getAttribute('aria-sort')).toBe('descending')
    expect(rowFiles()[0]).toBe('FR-28-09.xlsm')

    await click(sortButton())
    expect(headerOf('Arquivo').getAttribute('aria-sort')).toBe('none')
    expect(parameters().has('sort')).toBe(false)
    rendered.unmount()
  })

  test('o filtro de situação aceita seleção múltipla e vai para a URL', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Situação"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'Na fila',
      'Lendo',
      'Pronta',
      'Falhou',
    ])

    await click(options[0] as HTMLElement)
    expect(rowFiles()).toEqual(['BETA-01-10.xlsx'])
    await click(options[3] as HTMLElement)
    expect(rowFiles()).toEqual(['BETA-01-10.xlsx', 'FR-28-09.xlsm'])
    expect(parameters().get('status')).toBe('queued,failed')
    rendered.unmount()
  })

  test('o filtro de contratante filtra no servidor com um só e no cliente com vários', async () => {
    const rendered = await mountList()

    await click(document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement)
    const options = [...document.querySelectorAll('[role="option"]')]
    await click(options[0] as HTMLElement)
    await waitFor(() =>
      expect(cargoPreviewFakes.double.calls.listPreviews.at(-1)?.filters).toEqual({
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

    await click(headerOf('Arquivo').querySelector('button') as HTMLButtonElement)
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()

    await click(buttonByText('Limpar filtros'))
    expect(maybeButtonByText('Limpar filtros')).toBeUndefined()
    expect(rowFiles()).toEqual(['FR-05-10.xlsm', 'BETA-01-10.xlsx', 'FR-28-09.xlsm'])
    expect(parameters().has('sort')).toBe(false)
    rendered.unmount()
  })

  test('a URL reabre a lista filtrada e ordenada', async () => {
    const rendered = await mountList({ search: '?status=ready,failed&sort=receivedAt&dir=asc' })

    expect(rowFiles()).toEqual(['FR-28-09.xlsm', 'FR-05-10.xlsm'])
    expect(headerOf('Recebida em').getAttribute('aria-sort')).toBe('ascending')
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()
    rendered.unmount()
  })

  test('filtro sem resposta diz que nenhuma prévia tem esses filtros', async () => {
    const rendered = await mountList({ search: `?contractor=${BETA_ID}&status=ready` })

    expect(rowFiles()).toEqual([])
    expect(document.body.textContent).toContain('Nenhuma prévia com esses filtros.')
    rendered.unmount()
  })
})

describe('o repolling da leitura', () => {
  function refetchIntervalOf(queryClient: Awaited<ReturnType<typeof mountList>>['queryClient']) {
    const [query] = queryClient
      .getQueryCache()
      .findAll({ queryKey: ['cargo-receiving', 'previews'] })
    const option = query?.observers[0]?.options.refetchInterval
    if (query === undefined || option === undefined) throw new Error('REFETCH_INTERVAL_NOT_SET')
    return typeof option === 'function' ? option(query as never) : option
  }

  test('repete enquanto há prévia na fila e para sozinho quando todas assentam', async () => {
    const rendered = await mountList()
    expect(refetchIntervalOf(rendered.queryClient)).toBe(3_000)

    cargoPreviewFakes.double.previews = [READY, { ...QUEUED, status: 'ready' }, FAILED]
    await rendered.queryClient.invalidateQueries({ queryKey: ['cargo-receiving', 'previews'] })
    await waitFor(() => expect(rowTexts().join('|')).not.toContain('Na fila'))

    expect(refetchIntervalOf(rendered.queryClient)).toBe(false)
    rendered.unmount()
  })

  test('sem prévia pendente desde o começo ele nem começa', async () => {
    const rendered = await mountList({ previews: [READY, FAILED] })

    expect(refetchIntervalOf(rendered.queryClient)).toBe(false)
    rendered.unmount()
  })
})
