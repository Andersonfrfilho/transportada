/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (T3.4a, `CARGO_ARRIVAL_RETURN_CASE_CANCELLED`): a avaria cuja tratativa foi cancelada não pode
 * motivar a devolução. A lista de origens do "Devolver ao contratante" a esconde; a nota JÁ marcada cuja tratativa
 * foi cancelada diz "Tratativa cancelada — desfaça a devolução" em vez de "aguardando decisão" e NÃO oferece
 * "Concluir"; os 409 novos (cancelada, viagem viva ao concluir) chegam com o motivo, não com o código cru.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  completeButton,
  markButton,
  mountOffice,
  mountSeparation,
  rowOf,
  stubVisibleLayout,
  typeInArea,
  unmarkButton,
} from './cargoOccurrenceScreen.helper'
import { buttonByText, click } from './cargoReceivingHarness.helper'
import { settle, waitFor } from './renderHook.helper'

const DOC = documentIdOf(1001)
const CANCELLED = buildOccurrence({
  case: { id: 'case-c', status: 'cancelled' },
  id: 'occ-cancelled',
  nfeDocumentId: DOC,
  typeName: 'Avaria aberta por engano',
})
const LIVE = buildOccurrence({
  case: { id: 'case-l', status: 'under_review' },
  id: 'occ-live',
  nfeDocumentId: DOC,
  typeName: 'Item faltante na chegada',
})
const MARKED_ON_CANCELLED = {
  occurrences: [CANCELLED],
  returns: new Map([[DOC, { occurrenceId: 'occ-cancelled', state: 'marked' as const }]]),
}

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

const note = (): string => rowOf(1001).textContent ?? ''

describe('a nota marcada cuja tratativa foi cancelada', () => {
  test('no celular: avisa para desfazer, não oferece "Concluir" e não diz que espera decisão', async () => {
    const { rendered } = await mountSeparation({
      canResolve: true,
      occurrence: MARKED_ON_CANCELLED,
    })

    expect(note()).toContain('Tratativa cancelada — desfaça a devolução')
    expect(note()).not.toContain('Aguardando a decisão')
    expect(completeButton(1001)).toBeNull()
    expect(unmarkButton(1001)).not.toBeNull()
    rendered.unmount()
  })

  test('no escritório: o mesmo aviso, e quem não desfaz (sem `occurrences.resolve`) vê o aviso sem o botão', async () => {
    const { rendered } = await mountOffice({ canResolve: false, occurrence: MARKED_ON_CANCELLED })

    expect(note()).toContain('Tratativa cancelada — desfaça a devolução')
    expect(completeButton(1001)).toBeNull()
    expect(unmarkButton(1001)).toBeNull()
    rendered.unmount()
  })

  test('com a tratativa viva o aviso não aparece', async () => {
    const { rendered } = await mountSeparation({
      occurrence: {
        occurrences: [LIVE],
        returns: new Map([[DOC, { occurrenceId: 'occ-live', state: 'marked' as const }]]),
      },
    })

    expect(note()).not.toContain('Tratativa cancelada')
    expect(note()).toContain('Aguardando a decisão do contratante')
    rendered.unmount()
  })
})

describe('as origens oferecidas ao devolver', () => {
  test('a avaria de tratativa cancelada não aparece na lista; a viva sim', async () => {
    const { rendered } = await mountSeparation({ occurrence: { occurrences: [CANCELLED, LIVE] } })

    await click(markButton(1001) as HTMLButtonElement)
    const trigger = document.querySelector<HTMLElement>('[aria-label="Avaria de origem"]')
    await click(trigger as HTMLElement)
    const labels = [...document.querySelectorAll('[role="option"]')].map((option) =>
      option.textContent?.trim(),
    )

    expect(labels).toHaveLength(1)
    expect(labels[0]).toContain('Item faltante na chegada')
    rendered.unmount()
  })

  test('só avarias de tratativa cancelada: não há o que devolver (o botão some)', async () => {
    const { rendered } = await mountSeparation({ occurrence: { occurrences: [CANCELLED] } })

    expect(markButton(1001)).toBeNull()
    rendered.unmount()
  })
})

describe('os 409 novos chegam com o motivo', () => {
  test('marcar com a origem que acabou de ser cancelada em outra tela: "tratativa cancelada"', async () => {
    const { occurrence, rendered } = await mountSeparation({ occurrence: { occurrences: [LIVE] } })
    occurrence.failures.push(new CargoReceivingRequestError('CARGO_ARRIVAL_RETURN_CASE_CANCELLED'))
    await click(markButton(1001) as HTMLButtonElement)
    await typeInArea(document.querySelector('textarea') as HTMLTextAreaElement, 'x')

    await click(buttonByText('Confirmar devolução'))
    await settle()

    await waitFor(() =>
      expect(document.querySelector('[data-note-actions] [role="alert"]')?.textContent).toContain(
        'cancelada',
      ),
    )
    rendered.unmount()
  })

  test('concluir com a nota que entrou em viagem viva: o motivo é a viagem, não o código', async () => {
    const decided = buildOccurrence({
      case: { id: 'case-d', status: 'decided' },
      id: 'occ-decided',
      nfeDocumentId: DOC,
    })
    const { occurrence, rendered } = await mountSeparation({
      occurrence: {
        occurrences: [decided],
        returns: new Map([[DOC, { occurrenceId: 'occ-decided', state: 'marked' as const }]]),
      },
    })
    occurrence.failures.push(new CargoReceivingRequestError('CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP'))

    await click(completeButton(1001) as HTMLButtonElement)
    await settle()

    const alert = document.querySelector('[data-note-actions] [role="alert"]')?.textContent ?? ''
    expect(alert).toContain('viagem')
    expect(alert).not.toContain('CARGO_ARRIVAL_DOCUMENT_IN_LIVE_TRIP')
    rendered.unmount()
  })
})
