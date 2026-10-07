/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M2): o erro de "aplicar rota" e de "marcar em lote" aparece no detalhe
 * do escritório, no mesmo padrão do fechamento. Antes, `route.mutate`/`batch.mutate` não tinham
 * tratamento de erro: a chegada fechada por outra pessoa, o 422 e a queda de rede sumiam calados, e a
 * seleção parecia ter funcionado. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoArrivalDetailScreen } from '@/modules/cargo-receiving/components/CargoArrivalDetailScreen.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { ARRIVAL_ID, documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  buttonByText,
  byLabel,
  click,
  fieldByLabel,
  installCargoReceivingDouble,
  networkFailure,
  resetLocation,
  typeInto,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const ROUTE_FIELD = 'Rota (até 40 caracteres)'
const NOT_IN_ARRIVAL = 'CARGO_ARRIVAL_DOCUMENTS_NOT_IN_ARRIVAL'
const NOT_FOUND_REASON = 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'

async function mountDetail(overrides: Partial<CargoReceivingDouble> = {}) {
  resetLocation(`/recebimento/${ARRIVAL_ID}/detalhe`)
  const double = installCargoReceivingDouble(overrides)
  const rendered = await renderWithQueryClient(
    createElement(CargoArrivalDetailScreen, { arrivalId: ARRIVAL_ID, canManage: true }),
  )
  await waitFor(() =>
    expect(document.body.textContent).toContain('Chegada de Alfa Indústria Fictícia'),
  )
  return { double, rendered }
}

const documentBox = (number: number) =>
  byLabel(`Selecionar a nota ${String(number)}`) as HTMLInputElement
const alerts = () => [...document.querySelectorAll('[role="alert"]')]
const alertText = () => alerts().map((item) => item.textContent ?? '')
const refusalDocuments = () =>
  [...document.querySelectorAll('[data-refusal-documents] button')].map((item) => item.textContent)

async function applyRoute(numbers: readonly number[]): Promise<void> {
  for (const number of numbers) await click(documentBox(number))
  await typeInto(fieldByLabel(ROUTE_FIELD), 'FR.S.NOVA')
  await click(buttonByText('Aplicar rota'))
  await settle()
}

async function markReceived(numbers: readonly number[]): Promise<void> {
  for (const number of numbers) await click(documentBox(number))
  await click(buttonByText('Marcar como recebidas'))
  await settle()
}

function refusal(
  code: string,
  details: readonly { field: string; message: string }[] = [],
): CargoReceivingRequestError {
  return new CargoReceivingRequestError(code, details)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('aplicar rota que o servidor recusa', () => {
  test('409 de chegada fechada por outra pessoa: o aviso aparece, em vez de a tela parecer ter funcionado', async () => {
    const { rendered } = await mountDetail({ routeFailure: refusal('CARGO_ARRIVAL_CLOSED') })

    await applyRoute([1004])

    expect(alertText()).toEqual(['A chegada está fechada: só leitura.'])
    rendered.unmount()
  })

  test('422 nomeia TODAS as notas recusadas, pela posição na seleção enviada, cada uma com atalho', async () => {
    const { rendered } = await mountDetail({
      routeFailure: refusal(NOT_IN_ARRIVAL, [
        { field: 'documentIds.0', message: NOT_FOUND_REASON },
        { field: 'documentIds.2', message: NOT_FOUND_REASON },
      ]),
    })

    await applyRoute([1005, 1004, 1001])

    expect(alertText()).toEqual(['Algumas notas não fazem parte desta chegada.'])
    expect(refusalDocuments()).toEqual(['NF 1005', 'NF 1001'])
    expect(document.querySelector('[data-refusal-documents]')?.textContent).toContain(
      'não está nesta chegada',
    )
    await click(buttonByText('NF 1001'))
    expect(document.activeElement === documentBox(1001)).toBe(true)
    rendered.unmount()
  })

  test('a mesma nota em dois detalhes vira um item só', async () => {
    const { rendered } = await mountDetail({
      routeFailure: refusal(NOT_IN_ARRIVAL, [
        { field: 'documentIds.0', message: NOT_FOUND_REASON },
        { field: 'documentIds.0', message: NOT_FOUND_REASON },
      ]),
    })

    await applyRoute([1004])

    expect(refusalDocuments()).toEqual(['NF 1004'])
    rendered.unmount()
  })

  test('campo que a tela não conhece sai com o nome cru que a API usou', async () => {
    const { rendered } = await mountDetail({
      routeFailure: refusal('INVALID_REQUEST', [{ field: 'routeName', message: 'Too long' }]),
    })

    await applyRoute([1004])

    expect(document.querySelector('[data-refusal-summary]')?.textContent).toContain('routeName')
    rendered.unmount()
  })

  test('recusa sem campo algum fica só no aviso: nada de lista vazia', async () => {
    const { rendered } = await mountDetail({ routeFailure: refusal(NOT_IN_ARRIVAL) })

    await applyRoute([1004])

    expect(alerts()).toHaveLength(1)
    expect(document.querySelectorAll('[data-refusal-documents]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-refusal-summary]')).toHaveLength(0)
    rendered.unmount()
  })

  test('código desconhecido não some: sai com o código que a API usou', async () => {
    const { rendered } = await mountDetail({ routeFailure: refusal('ROUTE_BROKE') })

    await applyRoute([1004])

    expect(alertText()).toEqual(['Não foi possível concluir (ROUTE_BROKE).'])
    rendered.unmount()
  })

  test('tentar de novo e dar certo limpa o aviso', async () => {
    const { double, rendered } = await mountDetail({ routeFailure: refusal('REQUEST_FAILED') })
    await applyRoute([1004])
    expect(alertText()).toEqual(['Sem conexão com o servidor.'])

    double.routeFailure = undefined
    await click(buttonByText('Aplicar rota'))
    await settle()

    expect(alerts()).toHaveLength(0)
    expect(document.body.textContent).toContain('Rota aplicada às notas selecionadas.')
    rendered.unmount()
  })
})

describe('marcar em lote com a rede ou o servidor falhando', () => {
  test('queda de rede no lote: o aviso aparece e a seleção continua para tentar de novo', async () => {
    const { rendered } = await mountDetail({ failures: [networkFailure()] })

    await markReceived([1001, 1004])

    expect(alertText()).toEqual(['Sem conexão com o servidor.'])
    expect(documentBox(1001).checked && documentBox(1004).checked).toBe(true)
    expect(document.body.textContent).toContain('2 notas selecionadas')
    rendered.unmount()
  })

  test('409 de chegada fechada no lote: o aviso diz que está fechada', async () => {
    const { rendered } = await mountDetail({ failures: [refusal('CARGO_ARRIVAL_CLOSED')] })

    await markReceived([1001])

    expect(alertText()).toEqual(['A chegada está fechada: só leitura.'])
    rendered.unmount()
  })
})

describe('o lote que o servidor recusa por nota', () => {
  test('422 nomeia as notas pela posição na seleção enviada, também no lote', async () => {
    const { rendered } = await mountDetail({
      failures: [
        refusal(NOT_IN_ARRIVAL, [
          { field: 'documentIds.1', message: NOT_FOUND_REASON },
          { field: 'documentIds.0', message: NOT_FOUND_REASON },
        ]),
      ],
    })

    await markReceived([1005, 1004])

    expect(alertText()).toEqual(['Algumas notas não fazem parte desta chegada.'])
    expect(refusalDocuments()).toEqual(['NF 1004', 'NF 1005'])
    rendered.unmount()
  })
})

describe('o aviso acompanha a seleção', () => {
  test.each([
    ['marcar outra nota', async () => click(documentBox(1005))],
    ['desmarcar uma nota', async () => click(documentBox(1004))],
    ['marcar o grupo', async () => click(byLabel('Selecionar o grupo FR.S.CAR · Piracicaba'))],
    ['limpar a seleção', async () => click(buttonByText('Limpar seleção'))],
  ] as const)('editar a seleção (%s) limpa o aviso de rota', async (_label, edit) => {
    const { rendered } = await mountDetail({ routeFailure: refusal('REQUEST_FAILED') })
    await applyRoute([1004])
    expect(alerts()).toHaveLength(1)

    await edit()

    expect(alerts()).toHaveLength(0)
    rendered.unmount()
  })

  test('o aviso de rota some quando o operador parte para o lote, e o do lote ao aplicar rota', async () => {
    const { double, rendered } = await mountDetail({ routeFailure: refusal('REQUEST_FAILED') })
    await applyRoute([1004])
    expect(alerts()).toHaveLength(1)

    double.failures.push(refusal('CARGO_ARRIVAL_CLOSED'))
    await click(buttonByText('Marcar como recebidas'))
    await settle()
    expect(alertText()).toEqual(['A chegada está fechada: só leitura.'])

    await click(buttonByText('Aplicar rota'))
    await settle()
    expect(alertText()).toEqual(['Sem conexão com o servidor.'])
    rendered.unmount()
  })
})

describe('o fechamento lê o id da nota pendente em documentId', () => {
  test('409 lista as pendentes pelo id do campo, não pelo texto da mensagem', async () => {
    const { rendered } = await mountDetail({
      closeFailure: refusal('CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS', [
        { field: 'pendingDocumentIds.0', message: 'The document is not separated yet' },
      ]),
    })

    await click(buttonByText('Fechar chegada'))
    await settle()

    expect(document.querySelectorAll('[data-pending-documents] button')).toHaveLength(0)
    rendered.unmount()
  })

  test('com documentId a lista sai completa, uma nota por item', async () => {
    const withIds = new CargoReceivingRequestError('CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS', [
      {
        documentId: documentIdOf(1001),
        field: 'pendingDocumentIds.0',
        message: 'The document is not separated yet',
      },
      {
        documentId: documentIdOf(1004),
        field: 'pendingDocumentIds.1',
        message: 'The document is not separated yet',
      },
    ])
    const { rendered } = await mountDetail({ closeFailure: withIds })

    await click(buttonByText('Fechar chegada'))
    await settle()

    const labels = [...document.querySelectorAll('[data-pending-documents] button')].map(
      (item) => item.textContent,
    )
    expect(labels).toEqual(['NF 1001', 'NF 1004'])
    rendered.unmount()
  })
})
