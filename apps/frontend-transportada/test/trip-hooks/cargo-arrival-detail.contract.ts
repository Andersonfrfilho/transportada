/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): o detalhe da chegada no escritório — cabeçalho com prazo e progresso, grupos
 * rota × cidade com contagem por estado, selo "já em viagem", atribuir rota, receber e separar em lote
 * (resultado por nota: uma recusada nunca esconde as outras) e fechar a chegada. Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoArrivalDetailScreen } from '@/modules/cargo-receiving/components/CargoArrivalDetailScreen.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

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
  resetLocation,
  typeInto,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

async function mountDetail(options: { canManage?: boolean } & Partial<CargoReceivingDouble> = {}) {
  const { canManage = true, ...overrides } = options
  resetLocation(`/recebimento/${ARRIVAL_ID}/detalhe`)
  const double = installCargoReceivingDouble(overrides)
  const rendered = await renderWithQueryClient(
    createElement(CargoArrivalDetailScreen, { arrivalId: ARRIVAL_ID, canManage }),
  )
  await waitFor(() =>
    expect(document.body.textContent).toContain('Chegada de Alfa Indústria Fictícia'),
  )
  return { double, rendered }
}

const group = (title: string) => byLabel(`Notas do grupo ${title}`)
const documentBox = (number: number) =>
  byLabel(`Selecionar a nota ${String(number)}`) as HTMLInputElement
const text = () => document.body.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('o cabeçalho e os grupos (spec 237 T2.4)', () => {
  test('mostra contratante, situação, progresso, prazo, referência e paletes', async () => {
    const { rendered } = await mountDetail()

    expect(text()).toContain('Aberta')
    expect(text()).toContain('1 de 7 separadas')
    expect(text()).toContain('Prazo de separação:')
    expect(text()).toContain('Referência: Lacre 4471')
    expect(text()).toContain('Paletes: 12')
    expect(text()).not.toContain('Vencida')
    rendered.unmount()
  })

  test('chegada vencida mostra o selo "Vencida"', async () => {
    const { rendered } = await mountDetail({
      server: buildDetail({ isSeparationOverdue: true }),
    })

    expect(text()).toContain('Vencida')
    rendered.unmount()
  })

  test('os grupos rota × cidade vêm na ordem da API, com contagem por estado', async () => {
    const { rendered } = await mountDetail()

    const titles = [...document.querySelectorAll('[aria-label^="Notas do grupo"]')].map((item) =>
      item.getAttribute('aria-label'),
    )
    expect(titles).toEqual([
      'Notas do grupo FR.S.CAR · Piracicaba',
      'Notas do grupo FR.S.CAR · Limeira',
      'Notas do grupo FR.N.SOR · Sorocaba',
      'Notas do grupo Sem rota · Sem cidade',
    ])
    expect(group('FR.S.CAR · Piracicaba').textContent).toContain('1 de 3 separadas')
    const states = [...group('FR.S.CAR · Piracicaba').querySelectorAll('tbody tr')].map(
      (row) => row.textContent ?? '',
    )
    expect(states[0]).toContain('Esperada')
    expect(states[1]).toContain('Recebida')
    expect(states[2]).toContain('Separada')
    rendered.unmount()
  })

  test('só a nota que já está numa viagem leva o selo "Já em viagem"', async () => {
    const { rendered } = await mountDetail()

    expect(group('FR.N.SOR · Sorocaba').textContent).toContain('Já em viagem')
    expect(group('FR.S.CAR · Piracicaba').textContent).not.toContain('Já em viagem')
    rendered.unmount()
  })

  test('a zebra e o estado são por classe, nunca estilo inline', async () => {
    const { rendered } = await mountDetail()

    expect(document.querySelectorAll('tbody tr[style]')).toHaveLength(0)
    rendered.unmount()
  })
})

describe('chegada fechada e quem só lê', () => {
  test('fechada: só leitura, sem seleção nem ação, com o aviso', async () => {
    const { rendered } = await mountDetail({ server: buildDetail({ status: 'closed' }) })

    expect(text()).toContain('Chegada fechada: só leitura.')
    expect(maybeByLabel('Selecionar a nota 1001')).toBeNull()
    expect(maybeButtonByText('Fechar chegada')).toBeUndefined()
    expect(maybeButtonByText('Marcar como recebidas')).toBeUndefined()
    rendered.unmount()
  })

  test('quem só tem leitura não vê seleção nem ação', async () => {
    const { rendered } = await mountDetail({ canManage: false })

    expect(maybeByLabel('Selecionar a nota 1001')).toBeNull()
    expect(maybeButtonByText('Fechar chegada')).toBeUndefined()
    expect(text()).toContain('1 de 7 separadas')
    rendered.unmount()
  })
})

describe('receber e separar em lote', () => {
  test('marca as notas de grupos diferentes e mostra o resultado', async () => {
    const { double, rendered } = await mountDetail()
    await click(documentBox(1001))
    await click(documentBox(1004))
    expect(text()).toContain('2 notas selecionadas')

    await click(buttonByText('Marcar como recebidas'))
    await settle()

    expect(double.calls.batch).toEqual([
      { documentIds: [documentIdOf(1001), documentIdOf(1004)], to: 'received' },
    ])
    expect(text()).toContain('2 alteradas, 0 sem mudança, 0 recusadas.')
    expect(
      [...group('FR.S.CAR · Piracicaba').querySelectorAll('tbody tr')][0]?.textContent,
    ).toContain('Recebida')
    rendered.unmount()
  })

  test('uma nota recusada nunca esconde as outras: todas aparecem, cada uma com o motivo', async () => {
    const { rendered } = await mountDetail()
    await click(documentBox(1001))
    await click(documentBox(1003))
    await click(documentBox(1004))

    await click(buttonByText('Marcar como separadas'))
    await settle()

    const outcome = document.querySelector('[data-batch-outcome]') as HTMLElement
    expect(outcome.textContent).toContain('0 alteradas, 1 sem mudança, 2 recusadas.')
    expect(outcome.textContent).toContain('NF 1001')
    expect(outcome.textContent).toContain('NF 1004')
    expect(outcome.textContent).toContain('precisa ser recebida antes de separar')
    expect(outcome.querySelectorAll('[data-refused-document] button')).toHaveLength(2)
    rendered.unmount()
  })

  test('o atalho da nota recusada leva o foco à linha dela', async () => {
    const { rendered } = await mountDetail()
    await click(documentBox(1001))
    await click(buttonByText('Marcar como separadas'))
    await settle()

    const outcome = document.querySelector('[data-batch-outcome]') as HTMLElement
    await click(buttonByText('NF 1001', outcome))

    expect(document.activeElement === documentBox(1001)).toBe(true)
    rendered.unmount()
  })

  test('as ações só existem com nota selecionada', async () => {
    const { rendered } = await mountDetail()

    expect(maybeButtonByText('Marcar como recebidas')).toBeUndefined()
    expect(maybeButtonByText('Aplicar rota')).toBeUndefined()
    await click(documentBox(1001))
    expect(maybeButtonByText('Marcar como recebidas')).toBeDefined()
    rendered.unmount()
  })

  test('selecionar o grupo marca todas as notas dele', async () => {
    const { rendered } = await mountDetail()

    await click(byLabel('Selecionar o grupo FR.S.CAR · Limeira'))

    expect(documentBox(1004).checked && documentBox(1005).checked).toBe(true)
    expect(text()).toContain('2 notas selecionadas')
    rendered.unmount()
  })
})

describe('atribuir rota', () => {
  test('manda as notas e o texto da rota, e vazio limpa (null)', async () => {
    const { double, rendered } = await mountDetail()
    await click(documentBox(1004))
    await click(documentBox(1005))

    await typeInto(fieldByLabel('Rota (até 40 caracteres)'), '  FR.S.NOVA ')
    await click(buttonByText('Aplicar rota'))
    await settle()
    await typeInto(fieldByLabel('Rota (até 40 caracteres)'), '')
    await click(buttonByText('Aplicar rota'))
    await settle()

    expect(double.calls.assignRoute).toEqual([
      {
        arrivalId: ARRIVAL_ID,
        documentIds: [documentIdOf(1004), documentIdOf(1005)],
        routeName: 'FR.S.NOVA',
      },
      {
        arrivalId: ARRIVAL_ID,
        documentIds: [documentIdOf(1004), documentIdOf(1005)],
        routeName: null,
      },
    ])
    rendered.unmount()
  })

  test('rota com mais de 40 caracteres é recusada antes de ir ao servidor, no próprio campo', async () => {
    const { double, rendered } = await mountDetail()
    await click(documentBox(1004))

    await typeInto(fieldByLabel('Rota (até 40 caracteres)'), 'x'.repeat(41))
    await click(buttonByText('Aplicar rota'))

    expect(double.calls.assignRoute).toHaveLength(0)
    expect(fieldByLabel('Rota (até 40 caracteres)').getAttribute('aria-invalid')).toBe('true')
    expect(text()).toContain('Use no máximo 40 caracteres.')
    rendered.unmount()
  })
})

describe('fechar a chegada', () => {
  test('fecha e a tela vira só leitura', async () => {
    const { double, rendered } = await mountDetail({
      server: buildDetail({
        documents: [buildDocument({ number: '1003', separationState: 'separated' })],
      }),
    })

    await click(buttonByText('Fechar chegada'))
    await waitFor(() => expect(text()).toContain('Chegada fechada: só leitura.'))

    expect(double.calls.close).toEqual([ARRIVAL_ID])
    rendered.unmount()
  })

  test('409 com pendência lista TODAS as notas que faltam, cada uma com atalho', async () => {
    const { rendered } = await mountDetail({
      closeFailure: new CargoReceivingRequestError('CARGO_ARRIVAL_HAS_PENDING_DOCUMENTS', [
        { field: 'documentIds.0', message: documentIdOf(1001) },
        { field: 'documentIds.1', message: documentIdOf(1002) },
        { field: 'documentIds.2', message: documentIdOf(1004) },
      ]),
    })

    await click(buttonByText('Fechar chegada'))
    await settle()

    const pending = document.querySelector('[data-pending-documents]') as HTMLElement
    expect(pending.textContent).toContain('Faltam separar:')
    expect([...pending.querySelectorAll('button')].map((item) => item.textContent)).toEqual([
      'NF 1001',
      'NF 1002',
      'NF 1004',
    ])
    await click(buttonByText('NF 1002', pending))
    expect(document.activeElement === documentBox(1002)).toBe(true)
    rendered.unmount()
  })
})
