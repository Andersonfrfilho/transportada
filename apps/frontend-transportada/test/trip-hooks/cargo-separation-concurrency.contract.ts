/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, L1, L2 e L3): a tela do celular com mais de uma pessoa separando —
 * "separar tudo" não sai com toque do mesmo grupo em voo, "Vencida" some quando a última nota é separada,
 * a leitura periódica anda sozinha e para quando não deve, e a recusa de quem chegou depois é dita
 * em português ("já avançou"). Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoSeparationScreen } from '@/modules/cargo-receiving/components/CargoSeparationScreen.component'
import { cargoArrivalDetailQueryKey } from '@/modules/cargo-receiving/queries/useCargoArrivals.query'

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
  installCargoReceivingDouble,
  release,
  resetLocation,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

async function mountSeparation(overrides: Partial<CargoReceivingDouble> = {}) {
  resetLocation(`/recebimento/${ARRIVAL_ID}`)
  const double = installCargoReceivingDouble(overrides)
  const rendered = await renderWithQueryClient(
    createElement(CargoSeparationScreen, { arrivalId: ARRIVAL_ID, canManage: true }),
  )
  await waitFor(() => expect(document.body.textContent).toContain('Alfa Indústria Fictícia'))
  return { double, rendered }
}

const text = () => document.body.textContent ?? ''
const step = (number: number, label: string) =>
  byLabel(`${label} — NF ${String(number)}`) as HTMLButtonElement
const groupAll = () => buttonByText('Separar tudo deste grupo')

function setVisibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

/** A opção que a tela deu ao TanStack Query: avaliada contra a consulta viva, sem esperar 20 s de relógio. */
function readLiveInterval(
  queryClient: Awaited<ReturnType<typeof mountSeparation>>['rendered']['queryClient'],
) {
  const query = queryClient
    .getQueryCache()
    .find({ queryKey: cargoArrivalDetailQueryKey(ARRIVAL_ID) })
  const interval = query?.observers[0]?.options.refetchInterval
  if (query === undefined || typeof interval !== 'function') return 'not-a-function'
  return interval(query)
}

beforeEach(() => {
  document.body.innerHTML = ''
  setVisibility('visible')
})

describe('"separar tudo" com toque individual em voo (revisão L1)', () => {
  test('fica desabilitado enquanto uma nota do mesmo grupo está sendo enviada, e volta depois', async () => {
    const { double, rendered } = await mountSeparation({ isGated: true })

    await click(step(1001, 'Marcar como recebida'))
    expect(groupAll().disabled).toBe(true)

    await release(double)
    await settle()
    expect(groupAll().disabled).toBe(false)
    rendered.unmount()
  })

  test('o clique no botão travado não envia lote nenhum', async () => {
    const { double, rendered } = await mountSeparation({ isGated: true })

    await click(step(1001, 'Marcar como recebida'))
    await click(groupAll())

    expect(double.calls.batch).toHaveLength(1)
    await release(double)
    rendered.unmount()
  })
})

describe('"Vencida" some quando a última nota é separada (revisão L2)', () => {
  test('a tela muda na hora, sem esperar a releitura que o servidor ainda não respondeu', async () => {
    const { double, rendered } = await mountSeparation({
      isGated: true,
      server: buildDetail({
        documents: [buildDocument({ number: '4001', separationState: 'received' })],
        isSeparationOverdue: true,
      }),
    })
    expect(text()).toContain('Vencida')
    double.holdReads = true

    await click(step(4001, 'Marcar como separada'))

    expect(text()).not.toContain('Vencida')
    await release(double)
    rendered.unmount()
  })
})

describe('a leitura periódica da separação (revisão L3)', () => {
  test('chegada aberta, aba visível, nenhum toque: o TanStack Query recebe o intervalo curto', async () => {
    const { rendered } = await mountSeparation()

    expect(readLiveInterval(rendered.queryClient)).toBe(20_000)
    rendered.unmount()
  })

  test('com um toque em voo o intervalo some, e volta quando o toque termina', async () => {
    const { double, rendered } = await mountSeparation({ isGated: true })

    await click(step(1001, 'Marcar como recebida'))
    expect(readLiveInterval(rendered.queryClient)).toBe(false)

    await release(double)
    await settle()
    expect(readLiveInterval(rendered.queryClient)).toBe(20_000)
    rendered.unmount()
  })

  test('aba escondida não relê', async () => {
    const { rendered } = await mountSeparation()

    setVisibility('hidden')

    expect(readLiveInterval(rendered.queryClient)).toBe(false)
    rendered.unmount()
  })

  test('chegada fechada: a leitura periódica para sozinha', async () => {
    const { rendered } = await mountSeparation({ server: buildDetail({ status: 'closed' }) })

    expect(readLiveInterval(rendered.queryClient)).toBe(false)
    rendered.unmount()
  })
})

describe('quem chegou depois é avisado em português (revisão L3)', () => {
  test('a recusa por transição não permitida diz que a nota já avançou, não "a etapa não pode voltar"', async () => {
    const { double, rendered } = await mountSeparation()
    double.refusals.set(`received:${documentIdOf(1001)}`, 'CARGO_ARRIVAL_TRANSITION_NOT_ALLOWED')

    await click(step(1001, 'Marcar como recebida'))
    await settle()

    expect(text()).toContain('Recusada: a nota já avançou')
    expect(text()).toContain('outra pessoa')
    expect(text()).not.toContain('a etapa não pode voltar')
    rendered.unmount()
  })
})
