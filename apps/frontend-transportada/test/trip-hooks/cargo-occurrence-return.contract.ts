/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (RF8a, ADR-0094 §9.3–9.5): "devolver ao contratante" no celular do separador — a máquina da
 * nota montada de verdade: nenhuma → avaria aberta → a devolver → devolvida; o desfazer voltando (só com
 * `occurrences.resolve`); concluir só com a tratativa decidida; a devolvida terminal. O servidor dublado aplica
 * as MESMAS recusas da API. Nada de `expect(nó).toBeNull()` dentro de `waitFor`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { setCaseStatus } from './cargoOccurrenceHarness.helper'
import {
  completeButton,
  markButton,
  mountSeparation,
  occurrenceButton,
  pickOption,
  rowOf,
  stubVisibleLayout,
  text,
  typeInArea,
  unmarkButton,
  type MountOptions,
} from './cargoOccurrenceScreen.helper'
import { buttonByText, byLabel, click } from './cargoReceivingHarness.helper'
import { settle, waitFor } from './renderHook.helper'

const DOCUMENT = documentIdOf(1001)
const ORIGIN = buildOccurrence({ id: 'occ-1', nfeDocumentId: DOCUMENT })

/** A nota 1001 com a avaria `occ-1` e a marcação no estado pedido, como a API a leria do banco. */
function seeded(state: 'marked' | 'none' | 'returned', options: MountOptions = {}): MountOptions {
  return {
    ...options,
    occurrence: {
      occurrences: [ORIGIN],
      returns: new Map(state === 'none' ? [] : [[DOCUMENT, { occurrenceId: 'occ-1', state }]]),
      ...options.occurrence,
    },
  }
}

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

const noteText = (number: number): string => rowOf(number).textContent ?? ''

describe('a avaria aberta e o convite a devolver', () => {
  test('a nota com avaria mostra o selo, e quem tem `trip.manage` vê "Devolver ao contratante"', async () => {
    const { rendered } = await mountSeparation(seeded('none'))

    expect(noteText(1001)).toContain('Avaria aberta')
    expect(markButton(1001)).not.toBeNull()
    expect(markButton(1003)).toBeNull()
    rendered.unmount()
  })

  test('quem só lê vê o selo, mas nenhuma ação', async () => {
    const { rendered } = await mountSeparation(seeded('none', { canManage: false }))

    expect(noteText(1001)).toContain('Avaria aberta')
    expect(markButton(1001)).toBeNull()
    expect(occurrenceButton(1001)).toBeNull()
    rendered.unmount()
  })

  test('nota em viagem viva não oferece devolver: a devolução de nota em viagem é ocorrência de rua', async () => {
    const live = buildOccurrence({ id: 'occ-live', nfeDocumentId: documentIdOf(1004) })
    const { rendered } = await mountSeparation({ occurrence: { occurrences: [live] } })

    expect(noteText(1004)).toContain('Avaria aberta')
    expect(markButton(1004)).toBeNull()
    rendered.unmount()
  })
})

describe('devolver ao contratante', () => {
  test('abre o painel com a avaria de origem já escolhida e a observação opcional, e só marca ao confirmar', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('none'))

    await click(markButton(1001) as HTMLButtonElement)

    expect(occurrence.calls.changeReturn).toHaveLength(0)
    expect(byLabel('Avaria de origem').textContent).toContain('Item avariado na chegada')
    expect(text()).toContain('Observação (opcional)')
    rendered.unmount()
  })

  test('confirmar marca a nota com a ocorrência de origem e a observação; vira "A devolver"', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('none'))
    await click(markButton(1001) as HTMLButtonElement)
    await typeInArea(
      rowOf(1001).querySelector('textarea') as HTMLTextAreaElement,
      'Contratante vai buscar',
    )

    await click(buttonByText('Confirmar devolução'))
    await settle()

    expect(occurrence.calls.changeReturn).toEqual([
      {
        action: 'mark',
        documentId: DOCUMENT,
        note: 'Contratante vai buscar',
        occurrenceId: 'occ-1',
      },
    ])
    await waitFor(() => expect(noteText(1001)).toContain('A devolver'))
    expect(noteText(1001)).not.toContain('Avaria aberta')
    rendered.unmount()
  })

  test('com mais de uma avaria na nota, o separador escolhe a de origem', async () => {
    const second = buildOccurrence({
      id: 'occ-2',
      nfeDocumentId: DOCUMENT,
      occurrenceTypeId: 'tipo-2',
      typeName: 'Item faltante na chegada',
    })
    const { occurrence, rendered } = await mountSeparation(
      seeded('none', { occurrence: { occurrences: [ORIGIN, second] } }),
    )
    await click(markButton(1001) as HTMLButtonElement)

    await pickOption({ label: 'Avaria de origem', option: 'Item faltante na chegada' })
    await click(buttonByText('Confirmar devolução'))
    await settle()

    expect(occurrence.calls.changeReturn[0]?.occurrenceId).toBe('occ-2')
    rendered.unmount()
  })

  test('a nota a devolver não oferece o passo de separar: o servidor recusaria', async () => {
    const { rendered } = await mountSeparation(seeded('marked'))

    expect(noteText(1001)).toContain('A devolver')
    expect(document.querySelector('[aria-label="Marcar como separada — NF 1001"]')).toBeNull()
    expect(document.querySelector('[aria-label="Marcar como recebida — NF 1001"]')).toBeNull()
    rendered.unmount()
  })

  test('"Separar tudo deste grupo" não leva a nota marcada nem a devolvida', async () => {
    const { receiving, rendered } = await mountSeparation(seeded('marked'))

    await click(buttonByText('Separar tudo deste grupo'))
    await settle()

    const sent = receiving.calls.batch.flatMap((batch) => batch.documentIds)
    expect(sent).not.toContain(DOCUMENT)
    rendered.unmount()
  })
})

describe('desfazer a devolução é de quem decide a tratativa', () => {
  test('sem `occurrences.resolve` não há "Desfazer devolução"', async () => {
    const { rendered } = await mountSeparation(seeded('marked', { canResolve: false }))

    expect(unmarkButton(1001)).toBeNull()
    rendered.unmount()
  })

  test('com `occurrences.resolve` desfaz e a nota volta ao fluxo normal', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('marked', { canResolve: true }))

    await click(unmarkButton(1001) as HTMLButtonElement)
    await settle()

    expect(occurrence.calls.changeReturn.at(-1)).toMatchObject({
      action: 'unmark',
      documentId: DOCUMENT,
    })
    await waitFor(() => expect(noteText(1001)).toContain('Avaria aberta'))
    expect(markButton(1001)).not.toBeNull()
    expect(document.querySelector('[aria-label="Marcar como separada — NF 1001"]')).not.toBeNull()
    rendered.unmount()
  })
})

describe('concluir a devolução', () => {
  test('espera a decisão do contratante: sem a tratativa decidida, só o aviso — nenhum botão', async () => {
    const { rendered } = await mountSeparation(seeded('marked'))

    expect(completeButton(1001)).toBeNull()
    expect(noteText(1001)).toContain('Aguardando a decisão do contratante')
    rendered.unmount()
  })

  test('decidida ou encerrada a tratativa, o botão aparece e a nota vira "Devolvida"', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('marked'))
    setCaseStatus(occurrence, { occurrenceId: 'occ-1', status: 'decided' })

    // a leitura periódica traz a decisão: a tela relê ao focar/invalidar
    await rendered.queryClient.invalidateQueries()
    await waitFor(() => expect(completeButton(1001)).not.toBeNull())
    await click(completeButton(1001) as HTMLButtonElement)
    await settle()

    expect(occurrence.calls.changeReturn.at(-1)).toMatchObject({
      action: 'complete',
      documentId: DOCUMENT,
    })
    await waitFor(() => expect(noteText(1001)).toContain('Devolvida'))
    rendered.unmount()
  })

  test('a devolvida é terminal: nenhuma ação sobra, nem para quem decide a tratativa', async () => {
    const { rendered } = await mountSeparation(seeded('returned', { canResolve: true }))

    expect(noteText(1001)).toContain('Devolvida')
    expect(markButton(1001)).toBeNull()
    expect(unmarkButton(1001)).toBeNull()
    expect(completeButton(1001)).toBeNull()
    expect(occurrenceButton(1001)).toBeNull()
    expect(rowOf(1001).querySelectorAll('button').length).toBe(0)
    rendered.unmount()
  })
})

describe('o que o servidor recusa fica na nota, com o motivo', () => {
  test('concluir antes da decisão (tela velha): 409 e o motivo na linha da nota', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('marked'))
    setCaseStatus(occurrence, { occurrenceId: 'occ-1', status: 'decided' })
    await rendered.queryClient.invalidateQueries()
    await waitFor(() => expect(completeButton(1001)).not.toBeNull())
    setCaseStatus(occurrence, { occurrenceId: 'occ-1', status: 'under_review' })
    occurrence.failures.push(
      new CargoReceivingRequestError('CARGO_ARRIVAL_RETURN_DECISION_PENDING'),
    )

    await click(completeButton(1001) as HTMLButtonElement)
    await settle()

    const alert = rowOf(1001).querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('decisão do contratante')
    rendered.unmount()
  })

  test('marcar com a avaria já marcada por outra: o motivo aparece e a nota segue como estava', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('none'))
    await click(markButton(1001) as HTMLButtonElement)
    occurrence.failures.push(new CargoReceivingRequestError('CARGO_ARRIVAL_RETURN_ALREADY_MARKED'))

    await click(buttonByText('Confirmar devolução'))
    await settle()

    expect(rowOf(1001).querySelector('[role="alert"]')?.textContent).toContain('já está marcada')
    expect(noteText(1001)).toContain('Avaria aberta')
    rendered.unmount()
  })

  test('falha de rede: o toque fica na tela com "tentar de novo", nunca em silêncio', async () => {
    const { occurrence, rendered } = await mountSeparation(seeded('marked', { canResolve: true }))
    occurrence.failures.push(new CargoReceivingRequestError('REQUEST_FAILED'))

    await click(unmarkButton(1001) as HTMLButtonElement)
    await settle()

    expect(rowOf(1001).querySelector('[role="alert"]')?.textContent).toContain(
      'Sem conexão com o servidor.',
    )
    expect(noteText(1001)).toContain('A devolver')
    expect(unmarkButton(1001)).not.toBeNull()
    rendered.unmount()
  })

  test('com o gesto em voo o botão trava: o segundo toque não manda outro pedido', async () => {
    const { occurrence, rendered } = await mountSeparation(
      seeded('marked', { canResolve: true, occurrence: { isGated: true } }),
    )

    await click(unmarkButton(1001) as HTMLButtonElement)
    await click(unmarkButton(1001) as HTMLButtonElement)

    expect(unmarkButton(1001)?.disabled).toBe(true)
    expect(occurrence.calls.changeReturn).toHaveLength(1)
    occurrence.pending.splice(0).forEach((resolve) => resolve())
    rendered.unmount()
  })
})
