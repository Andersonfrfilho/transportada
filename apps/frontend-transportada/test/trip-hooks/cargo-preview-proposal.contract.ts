/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.4 (RF5b): a prévia propõe a chegada e o operador só confirma a hora. O botão mostra o rascunho
 * (quantas notas entram, quais ficaram de fora e por quê) SEM criar nada, e leva a `/recebimento/nova`
 * pré-preenchida — contratante e notas, nunca a data nem a hora, que o operador confirma. Sem nota vinculada
 * o botão explica em vez de ficar morto. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoArrivalRegistration } from '@/modules/cargo-receiving/components/CargoArrivalRegistration.component'
import { CargoPreviewDetailScreen } from '@/modules/cargo-receiving/components/CargoPreviewDetailScreen.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import {
  buildPreviewItem,
  buildPreviewSummary,
  DEFAULT_PREVIEW_ITEMS,
  PREVIEW_ID,
} from '../fixtures/cargoPreview.fixture'
import { ALFA_ID, buildAvailable, documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { installCargoPreviewDouble, type CargoPreviewDouble } from './cargoPreviewHarness.helper'
import {
  buttonByText,
  cargoReceivingFakes,
  click,
  fieldByLabel,
  installCargoReceivingDouble,
  maybeButtonByText,
  resetLocation,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const bodyText = () => document.body.textContent ?? ''

async function mountDetail(double: Partial<CargoPreviewDouble> = {}) {
  resetLocation(`/recebimento/previas/${PREVIEW_ID}`)
  installCargoReceivingDouble()
  const installed = installCargoPreviewDouble(double)
  const rendered = await renderWithQueryClient(
    createElement(CargoPreviewDetailScreen, { canManage: true, previewId: PREVIEW_ID }),
  )
  await waitFor(() => expect(document.querySelectorAll('[data-item-id]').length).toBeGreaterThan(0))
  return { double: installed, rendered }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('propor a chegada (spec 237 T4.4)', () => {
  test('mostra o rascunho — quantas notas entram e quais ficaram de fora e por quê — sem criar nada', async () => {
    const { double, rendered } = await mountDetail({
      proposal: {
        contractorId: ALFA_ID,
        documentIds: [documentIdOf(52_001), documentIdOf(52_006)],
        plannedDate: '2026-10-05',
        previewId: PREVIEW_ID,
        refused: [{ documentId: documentIdOf(52_001), reason: 'DOCUMENT_ALREADY_IN_ARRIVAL' }],
      },
    })

    await click(buttonByText('Propor chegada'))
    await waitFor(() => expect(document.querySelector('[data-proposal]')).not.toBeNull())

    const panel = document.querySelector('[data-proposal]') as HTMLElement
    expect(double.calls.propose).toEqual([PREVIEW_ID])
    expect(panel.textContent).toContain('Alfa Indústria Fictícia')
    expect(panel.textContent).toContain('05/10/2026')
    expect(panel.textContent).toContain('2 notas entram na chegada.')
    expect(panel.textContent).toContain('Ficaram de fora:')
    expect(panel.textContent).toContain('NF 52001')
    expect(panel.textContent).toContain('já está em outra chegada')
    expect(window.location.pathname).toBe(`/recebimento/previas/${PREVIEW_ID}`)
    rendered.unmount()
  })

  test('a hora da chegada nunca é assumida: o botão só leva à tela de registro', async () => {
    const { rendered } = await mountDetail()
    await click(buttonByText('Propor chegada'))
    await waitFor(() => expect(document.querySelector('[data-proposal]')).not.toBeNull())

    await click(buttonByText('Registrar chegada com estas notas'))

    expect(window.location.pathname).toBe('/recebimento/nova')
    const state = window.history.state as { cargoArrivalPrefill?: Record<string, unknown> }
    expect(Object.keys(state.cargoArrivalPrefill ?? {}).sort()).toEqual([
      'contractorId',
      'documentIds',
      'plannedDate',
      'previewId',
    ])
    rendered.unmount()
  })

  test('sem nota que entre o rascunho explica e não oferece registrar', async () => {
    const { rendered } = await mountDetail({
      proposal: {
        contractorId: ALFA_ID,
        documentIds: [],
        plannedDate: null,
        previewId: PREVIEW_ID,
        refused: [{ documentId: documentIdOf(52_001), reason: 'DOCUMENT_IN_LIVE_TRIP' }],
      },
    })

    await click(buttonByText('Propor chegada'))
    await waitFor(() => expect(document.querySelector('[data-proposal]')).not.toBeNull())

    expect(bodyText()).toContain('Nenhuma nota pode entrar na chegada agora.')
    expect(maybeButtonByText('Registrar chegada com estas notas')).toBeUndefined()
    rendered.unmount()
  })

  test('sem nota vinculada o botão é trocado por uma explicação, não fica morto', async () => {
    const awaitingOnly = DEFAULT_PREVIEW_ITEMS.map((item, index) =>
      buildPreviewItem(index + 1, { routeName: item.routeName }),
    )
    const { double, rendered } = await mountDetail({ items: awaitingOnly })

    expect(maybeButtonByText('Propor chegada')).toBeUndefined()
    expect(bodyText()).toContain(
      'Nenhuma nota vinculada ainda: as notas entram quando o XML chegar.',
    )
    expect(double.calls.propose).toHaveLength(0)
    rendered.unmount()
  })

  test('prévia que ainda está sendo lida espera, e a que falhou não propõe', async () => {
    resetLocation(`/recebimento/previas/${PREVIEW_ID}`)
    installCargoReceivingDouble()
    installCargoPreviewDouble({ items: [], summary: buildPreviewSummary({ status: 'queued' }) })
    const rendered = await renderWithQueryClient(
      createElement(CargoPreviewDetailScreen, { canManage: true, previewId: PREVIEW_ID }),
    )

    await waitFor(() => expect(bodyText()).toContain('A prévia ainda está sendo lida.'))

    expect(maybeButtonByText('Propor chegada')).toBeUndefined()
    rendered.unmount()
  })

  test('falha ao propor diz o motivo e não deixa rascunho velho na tela', async () => {
    const { rendered } = await mountDetail({
      proposeFailure: new CargoReceivingRequestError('CARGO_PREVIEW_NOT_READY'),
    })

    await click(buttonByText('Propor chegada'))
    await settle()

    expect(document.querySelector('[data-proposal]')).toBeNull()
    expect(document.querySelector('[data-proposal-error]')?.textContent).toContain(
      'A prévia ainda não foi lida',
    )
    rendered.unmount()
  })
})

describe('a tela de registro pré-preenchida', () => {
  const PREFILL = {
    contractorId: ALFA_ID,
    documentIds: [documentIdOf(52_001), documentIdOf(52_006), documentIdOf(52_777)],
    plannedDate: '2026-10-05',
    previewId: PREVIEW_ID,
  }

  async function mountPrefilled(options: { prefill?: unknown } = {}) {
    resetLocation('/recebimento/nova')
    window.history.replaceState({ cargoArrivalPrefill: options.prefill ?? PREFILL }, '')
    const double = installCargoReceivingDouble({
      available: [
        buildAvailable(1),
        buildAvailable(52_001),
        buildAvailable(52_006),
        buildAvailable(52_002),
      ],
    })
    const rendered = await renderWithQueryClient(createElement(CargoArrivalRegistration))
    return { double, rendered }
  }

  const checkbox = (number: number) =>
    document.querySelector(`[aria-label="Selecionar a nota ${String(number)}"]`) as HTMLInputElement

  test('traz o contratante e marca as notas propostas, nada mais', async () => {
    const { rendered } = await mountPrefilled()
    await waitFor(() => expect(checkbox(52_001)).not.toBeNull())
    await waitFor(() => expect(checkbox(52_001).checked).toBe(true))

    expect(checkbox(52_006).checked).toBe(true)
    expect(checkbox(1).checked).toBe(false)
    expect(checkbox(52_002).checked).toBe(false)
    expect(bodyText()).toContain('2 de 300 notas selecionadas')
    expect(
      (document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement).textContent,
    ).toContain('Alfa Indústria Fictícia')
    rendered.unmount()
  })

  test('avisa que a data e a hora são do operador e diz o dia planejado da prévia', async () => {
    const { rendered } = await mountPrefilled()
    await waitFor(() => expect(checkbox(52_001)).not.toBeNull())

    expect(bodyText()).toContain('Confira a data e a hora da chegada')
    expect(bodyText()).toContain('Dia planejado na prévia: 05/10/2026')
    rendered.unmount()
  })

  test('NÃO assume a hora: o campo vem vazio e registrar sem digitar é recusado', async () => {
    const { double, rendered } = await mountPrefilled()
    await waitFor(() => expect(checkbox(52_001).checked).toBe(true))

    expect(fieldByLabel('Hora da chegada').value).toBe('')

    await click(buttonByText('Registrar chegada'))

    expect(double.calls.register).toHaveLength(0)
    expect(bodyText()).toContain('Campo obrigatório.')
    rendered.unmount()
  })

  test('avisa quantas notas propostas não estão mais livres, sem inventar a seleção delas', async () => {
    const { rendered } = await mountPrefilled()

    await waitFor(() => expect(bodyText()).toContain('1 nota proposta não está mais livre'))

    expect(checkbox(52_001).checked).toBe(true)
    rendered.unmount()
  })

  test('sem o recado (acesso direto) a tela é a de sempre: hora de agora e nenhuma nota marcada', async () => {
    resetLocation('/recebimento/nova')
    window.history.replaceState({}, '')
    installCargoReceivingDouble({ available: [buildAvailable(1)] })
    const rendered = await renderWithQueryClient(createElement(CargoArrivalRegistration))

    expect(fieldByLabel('Hora da chegada').value).toMatch(/^\d{2}:\d{2}$/u)
    expect(bodyText()).not.toContain('Confira a data e a hora da chegada')
    rendered.unmount()
  })

  test('recado malformado é ignorado: nada é preenchido', async () => {
    const { rendered } = await mountPrefilled({
      prefill: { ...PREFILL, arrivedAt: '2026-10-05T10:00:00.000Z' },
    })

    expect(fieldByLabel('Hora da chegada').value).toMatch(/^\d{2}:\d{2}$/u)
    expect(bodyText()).not.toContain('Dia planejado na prévia')
    expect(cargoReceivingFakes.double.calls.register).toHaveLength(0)
    rendered.unmount()
  })
})
