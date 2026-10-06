/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3: abrir a avaria e marcar, desfazer ou concluir a devolução refazem a leitura do que depende
 * delas — a chegada (e a marcação debaixo dela), a lista de chegadas (contagens, "vencida") e as prévias, cuja
 * recomendação de viagens e proposta de chegada deixam de fora a nota a devolver. Cada chave é a da tela dela;
 * o contrato só prova que a invalidação alcança todas, sem apagar o que não é da chegada.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CARGO_RECEIVING_QUERY_KEY } from '@/modules/cargo-receiving/shared/cargoReceiving.constant'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  markButton,
  mountSeparation,
  stubVisibleLayout,
  typeInArea,
} from './cargoOccurrenceScreen.helper'
import { buttonByText, click } from './cargoReceivingHarness.helper'
import { settle } from './renderHook.helper'

const DOCUMENT = documentIdOf(1001)
const ORIGIN = buildOccurrence({ id: 'occ-1', nfeDocumentId: DOCUMENT })
const OTHER_ARRIVAL_KEY = [CARGO_RECEIVING_QUERY_KEY, 'arrival', 'outra-chegada'] as const
const PREVIEW_KEYS = [
  [CARGO_RECEIVING_QUERY_KEY, 'preview', 'p-1'],
  [CARGO_RECEIVING_QUERY_KEY, 'preview', 'p-1', 'trip-drafts'],
  [CARGO_RECEIVING_QUERY_KEY, 'previews', { status: 'ready' }],
] as const
const LIST_KEY = [CARGO_RECEIVING_QUERY_KEY, 'arrivals', { statuses: [] }] as const

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

describe('o que a devolução refaz (spec 237 T3.3)', () => {
  test('marcar relê a chegada, a marcação, a lista e as prévias — e só o que é da chegada', async () => {
    const { occurrence, rendered } = await mountSeparation({
      occurrence: { occurrences: [ORIGIN] },
    })
    const { queryClient } = rendered
    for (const key of [...PREVIEW_KEYS, LIST_KEY, OTHER_ARRIVAL_KEY]) {
      queryClient.setQueryData(key, { seeded: true })
    }
    const readsBefore = occurrence.calls.listOccurrences

    await click(markButton(1001) as HTMLButtonElement)
    await typeInArea(document.querySelector('textarea') as HTMLTextAreaElement, 'x')
    await click(buttonByText('Confirmar devolução'))
    await settle()

    expect(occurrence.calls.listOccurrences).toBeGreaterThan(readsBefore)
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true)
    for (const key of PREVIEW_KEYS) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true)
    }
    expect(queryClient.getQueryState(OTHER_ARRIVAL_KEY)?.isInvalidated).toBe(false)
    rendered.unmount()
  })
})
