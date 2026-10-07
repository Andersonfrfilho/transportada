/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (RF5, RF5a item 9, RF9): o detalhe da prévia montado de verdade — grupos por roteiro com a
 * carga ligada, os selos por situação, "esperando o XML" como estado NORMAL (nunca erro), o erro da linha
 * inválida, e as ações do operador: confirmar a sugestão, desvincular (avisando que age no grupo inteiro) e
 * vincular à mão. Sem `trip.manage` nenhuma ação aparece. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoPreviewDetailScreen } from '@/modules/cargo-receiving/components/CargoPreviewDetailScreen.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { buildPreviewItem, linkedDocument, PREVIEW_ID } from '../fixtures/cargoPreview.fixture'
import { buildAvailable } from '../fixtures/cargoReceiving.fixture'
import { installCargoPreviewDouble, type CargoPreviewDouble } from './cargoPreviewHarness.helper'
import {
  buttonByText,
  click,
  installCargoReceivingDouble,
  maybeButtonByText,
  resetLocation,
  typeInto,
  fieldByLabel,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

async function mountDetail(
  options: { canManage?: boolean; double?: Partial<CargoPreviewDouble>; search?: string } = {},
) {
  resetLocation(`/recebimento/previas/${PREVIEW_ID}${options.search ?? ''}`)
  installCargoReceivingDouble({
    available: [
      buildAvailable(52_003),
      buildAvailable(52_004),
      buildAvailable(52_099, { cityName: 'Limeira' }),
    ],
  })
  const double = installCargoPreviewDouble(options.double)
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewDetailScreen, {
      canManage: options.canManage ?? true,
      previewId: PREVIEW_ID,
    }),
  )
  await waitFor(() => expect(document.querySelectorAll('[data-item-id]').length).toBeGreaterThan(0))
  return { double, rendered }
}

const rowOf = (row: number) =>
  document.querySelector(`[data-row-number="${String(row)}"]`) as HTMLElement
const parameters = () => new URLSearchParams(window.location.search)
const bodyText = () => document.body.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('o cabeçalho e os grupos por roteiro (spec 237 T4.4)', () => {
  test('mostra contratante, arquivo, dia planejado, linhas e a contagem por situação', async () => {
    const { rendered } = await mountDetail()

    expect(document.querySelector('h1')?.textContent).toContain('Prévia de Alfa Indústria Fictícia')
    expect(bodyText()).toContain('FR-05-10.xlsm')
    const count = (state: string) =>
      document.querySelector(`[data-count-state="${state}"]`)?.textContent ?? ''
    expect(count('matched')).toContain('2')
    expect(count('awaiting_xml')).toContain('2')
    expect(count('suggested')).toContain('1')
    expect(count('ambiguous')).toContain('1')
    expect(count('invalid')).toContain('1')
    rendered.unmount()
  })

  test('um grupo por roteiro, com a carga ligada e a origem do par, e "sem roteiro" por último', async () => {
    const { rendered } = await mountDetail()

    const sections = [...document.querySelectorAll('[data-route-section]')]
    expect(sections.map((section) => section.getAttribute('data-route-section'))).toEqual([
      'FR.R.LIM',
      'FR.S.CAR',
      '',
    ])
    expect(sections[1]?.textContent).toContain('CARGA-9001')
    expect(sections[1]?.textContent).toContain('pelos totais')
    expect(sections[0]?.textContent).toContain('Carga ainda não pareada')
    expect(sections[2]?.textContent).toContain('Sem roteiro')
    rendered.unmount()
  })

  test('cada item mostra linha, destinatário, cidade, valor, peso e a situação', async () => {
    const { rendered } = await mountDetail()

    const text = rowOf(5).textContent ?? ''
    expect(text).toContain('MERCADO FICTICIO 1 LTDA')
    expect(text).toContain('PIRACICABA')
    expect(text).toContain('R$')
    expect(text).toContain('1.111,50')
    expect(text).toContain('138,7')
    expect(text).toContain('Vinculada')
    rendered.unmount()
  })

  test('a vinculada mostra o número da NF e o valor da NF', async () => {
    const { rendered } = await mountDetail()

    expect(rowOf(5).textContent).toContain('NF 52001')
    expect(rowOf(10).textContent).toContain('NF 52006')
    expect(rowOf(10).textContent).toContain('1.666,50')
    rendered.unmount()
  })
})

describe('"esperando o XML" é o estado normal, nunca erro', () => {
  test('o item sem nota diz "Esperando o XML" em tom neutro, sem alerta', async () => {
    const { rendered } = await mountDetail()

    const awaiting = rowOf(6)
    expect(awaiting.textContent).toContain('Esperando o XML')
    expect(awaiting.querySelector('[role="alert"]')).toBeNull()
    expect(awaiting.querySelector('[data-state-badge]')?.getAttribute('data-tone')).toBe('neutral')
    expect(document.querySelector('[data-awaiting-note]')?.textContent).toContain(
      'a prévia chega horas antes das notas',
    )
    rendered.unmount()
  })

  test('só o item inválido leva tom de alerta, e diz a coluna e o motivo em português', async () => {
    const { rendered } = await mountDetail()

    const invalid = rowOf(9)
    expect(invalid.querySelector('[data-state-badge]')?.getAttribute('data-tone')).toBe('alert')
    expect(invalid.textContent).toContain('Coluna VALOR')
    expect(invalid.textContent).toContain('decimal')
    expect(invalid.textContent).toContain('Coluna PESO TOTAL')
    expect(invalid.textContent).toContain('obrigatório')
    for (const row of [5, 6, 7, 8, 10]) {
      expect(rowOf(row).querySelector('[data-state-badge]')?.getAttribute('data-tone')).not.toBe(
        'alert',
      )
    }
    rendered.unmount()
  })

  test('a sugerida e a ambígua dizem quantas notas são candidatas', async () => {
    const { rendered } = await mountDetail()

    expect(rowOf(7).textContent).toContain('Sugerida')
    expect(rowOf(7).textContent).toContain('1 nota candidata')
    expect(rowOf(8).textContent).toContain('Ambígua')
    expect(rowOf(8).textContent).toContain('2 notas candidatas')
    rendered.unmount()
  })
})

describe('as ações do operador', () => {
  test('confirmar a sugestão vincula a linha e muda a situação', async () => {
    const { double, rendered } = await mountDetail()

    await click(buttonByText('Confirmar', rowOf(7)))
    await waitFor(() => expect(rowOf(7).textContent).toContain('Vinculada'))

    expect(double.calls.itemAction[0]).toMatchObject({ action: 'confirm' })
    expect(rowOf(7).textContent).not.toContain('Sugerida')
    rendered.unmount()
  })

  test('desvincular AVISA que age no grupo inteiro antes de chamar o servidor', async () => {
    const sharedKey = {
      matchGroupKey: 'grupo-1',
      matchState: 'matched' as const,
      matchedBy: 'system' as const,
    }
    const { double, rendered } = await mountDetail({
      double: {
        items: [
          buildPreviewItem(1, { ...sharedKey, document: linkedDocument(52_001, '2111.50') }),
          buildPreviewItem(2, { ...sharedKey, document: linkedDocument(52_001, '2111.50') }),
          buildPreviewItem(3),
        ],
      },
    })

    await click(buttonByText('Desvincular', rowOf(5)))

    expect(double.calls.itemAction).toHaveLength(0)
    const warning = document.querySelector('[data-unlink-warning]') as HTMLElement
    expect(warning.textContent).toContain('NF 52001')
    expect(warning.textContent).toContain('todas as linhas')
    expect(warning.textContent).toContain('2 nesta lista')
    rendered.unmount()
  })

  test('cancelar o aviso não chama o servidor; confirmar solta o grupo inteiro', async () => {
    const sharedKey = {
      matchGroupKey: 'grupo-1',
      matchState: 'matched' as const,
      matchedBy: 'system' as const,
    }
    const { double, rendered } = await mountDetail({
      double: {
        items: [
          buildPreviewItem(1, { ...sharedKey, document: linkedDocument(52_001, '2111.50') }),
          buildPreviewItem(2, { ...sharedKey, document: linkedDocument(52_001, '2111.50') }),
        ],
      },
    })

    await click(buttonByText('Desvincular', rowOf(5)))
    await click(buttonByText('Cancelar'))
    expect(double.calls.itemAction).toHaveLength(0)
    expect(document.querySelector('[data-unlink-warning]')).toBeNull()

    await click(buttonByText('Desvincular', rowOf(5)))
    await click(buttonByText('Desvincular mesmo'))
    await waitFor(() => expect(double.calls.itemAction).toHaveLength(1))
    await waitFor(() => expect(rowOf(6).textContent).toContain('Esperando o XML'))

    expect(rowOf(5).textContent).toContain('Esperando o XML')
    expect(double.calls.itemAction[0]).toMatchObject({ action: 'unlink' })
    rendered.unmount()
  })

  test('vincular à mão lista as notas do contratante, destaca as candidatas e vincula a escolhida', async () => {
    const { double, rendered } = await mountDetail()

    await click(buttonByText('Vincular à mão', rowOf(7)))
    const panel = document.querySelector('[data-manual-link]') as HTMLElement
    await waitFor(() => expect(panel.querySelectorAll('[data-document-option]').length).toBe(3))

    expect(panel.querySelector('[data-document-option]')?.textContent).toContain('52003')
    expect(panel.querySelector('[data-document-option]')?.textContent).toContain('Candidata')

    await typeInto(fieldByLabel('Buscar nota'), '52099')
    expect(panel.querySelectorAll('[data-document-option]').length).toBe(1)

    await click(panel.querySelector('[data-document-option] button') as HTMLElement)
    await click(buttonByText('Vincular a NF 52099', panel))
    await waitFor(() => expect(double.calls.itemAction).toHaveLength(1))

    expect(double.calls.itemAction[0]).toMatchObject({
      action: 'link',
      documentId: buildAvailable(52_099).id,
    })
    await waitFor(() => expect(rowOf(7).textContent).toContain('Vinculada'))
    rendered.unmount()
  })

  test('422 de nota já ligada a outra prévia mostra o motivo e mantém a escolha', async () => {
    const { rendered } = await mountDetail({
      double: {
        actionFailures: [new CargoReceivingRequestError('CARGO_PREVIEW_DOCUMENT_ALREADY_LINKED')],
      },
    })
    await click(buttonByText('Vincular à mão', rowOf(6)))
    const panel = document.querySelector('[data-manual-link]') as HTMLElement
    await waitFor(() => expect(panel.querySelectorAll('[data-document-option]').length).toBe(3))
    await click(panel.querySelector('[data-document-option] button') as HTMLElement)

    await click(buttonByText('Vincular a NF 52003', panel))
    await settle()

    expect(panel.querySelector('[role="alert"]')?.textContent).toContain(
      'Essa nota já está ligada a outra prévia.',
    )
    expect(panel.querySelectorAll('[data-document-option]').length).toBe(3)
    rendered.unmount()
  })

  test('a linha inválida não oferece ação alguma', async () => {
    const { rendered } = await mountDetail()

    expect(rowOf(9).querySelectorAll('button').length).toBe(0)
    rendered.unmount()
  })
})

describe('as permissões', () => {
  test('sem trip.manage nenhuma ação aparece, em nenhum estado, mas tudo continua legível', async () => {
    const { rendered } = await mountDetail({ canManage: false })

    for (const label of ['Confirmar', 'Desvincular', 'Vincular à mão', 'Propor chegada']) {
      expect(maybeButtonByText(label)).toBeUndefined()
    }
    expect(document.querySelectorAll('[data-item-id] button').length).toBe(0)
    expect(rowOf(5).textContent).toContain('NF 52001')
    rendered.unmount()
  })
})

describe('os filtros do detalhe e a URL', () => {
  test('o filtro de situação aceita vários, vai à URL e um só vai ao servidor', async () => {
    const { double, rendered } = await mountDetail()

    await click(
      document.querySelector('button[aria-label="Situação do item"]') as HTMLButtonElement,
    )
    const options = [...document.querySelectorAll('[role="option"]')]
    await click(options[0] as HTMLElement)

    await waitFor(() => expect(double.calls.getPreview.at(-1)?.state).toBe('matched'))
    expect(parameters().get('state')).toBe('matched')
    expect(document.querySelectorAll('[data-item-id]').length).toBe(2)

    await click(options[1] as HTMLElement)
    expect(parameters().get('state')).toBe('matched,awaiting_xml')
    expect(document.querySelectorAll('[data-item-id]').length).toBe(4)
    rendered.unmount()
  })

  test('o filtro de roteiro usa os roteiros da prévia', async () => {
    const { rendered } = await mountDetail()

    await click(document.querySelector('button[aria-label="Roteiro"]') as HTMLButtonElement)

    expect(
      [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent?.trim()),
    ).toEqual(['FR.R.LIM', 'FR.S.CAR'])
    rendered.unmount()
  })

  test('"Limpar filtros" só existe com filtro, e a URL reabre o detalhe filtrado', async () => {
    const { rendered } = await mountDetail({ search: '?state=invalid&route=FR.R.LIM' })

    expect(document.querySelectorAll('[data-item-id]').length).toBe(1)
    expect(maybeButtonByText('Limpar filtros')).toBeDefined()

    await click(buttonByText('Limpar filtros'))

    expect(maybeButtonByText('Limpar filtros')).toBeUndefined()
    expect(parameters().has('state')).toBe(false)
    expect(parameters().has('route')).toBe(false)
    await waitFor(() => expect(document.querySelectorAll('[data-item-id]').length).toBe(7))
    rendered.unmount()
  })

  test('"Carregar mais itens" segue o cursor por linha e acumula sem trocar a lista', async () => {
    const { double, rendered } = await mountDetail({ double: { itemsPageSize: 4 } })
    expect(document.querySelectorAll('[data-item-id]').length).toBe(4)

    await click(buttonByText('Carregar mais itens'))
    await waitFor(() => expect(document.querySelectorAll('[data-item-id]').length).toBe(7))

    expect(double.calls.getPreview.at(-1)?.afterRow).toBe('8')
    expect(maybeButtonByText('Carregar mais itens')).toBeUndefined()
    rendered.unmount()
  })
})

describe('os dados de terceiros', () => {
  test('o nome do destinatário e o endereço nunca vão para a URL nem para o título da aba', async () => {
    const { rendered } = await mountDetail({ search: '?state=matched' })

    expect(window.location.href).not.toContain('MERCADO')
    expect(window.location.href).not.toContain('RUA')
    expect(document.title).not.toContain('MERCADO')
    expect(bodyText()).toContain('MERCADO FICTICIO 1 LTDA')
    rendered.unmount()
  })
})
