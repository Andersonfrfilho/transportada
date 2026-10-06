/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (RF8, ADR-0094 §9.5 ajuste 2): o escritório conduz a tratativa da avaria de recebimento no
 * detalhe da chegada — a máquina de estados por estado e por permissão, o que pede confirmação, a nota
 * obrigatória, a decisão sem reentrega, o motivo dos erros (nunca mudo) e o que cada ação refaz. O servidor
 * dublado aplica as MESMAS recusas da API. Nada de `expect(nó).toBeNull()` dentro de `waitFor`.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CARGO_OCCURRENCE_CASE_STATUSES } from '@/modules/cargo-receiving/shared/cargoOccurrence.constant'
import { CARGO_RECEIVING_QUERY_KEY } from '@/modules/cargo-receiving/shared/cargoReceiving.constant'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import {
  installCargoCaseDouble,
  releaseCaseGate,
  type CargoCaseDouble,
} from './cargoOccurrenceCaseHarness.helper'
import {
  alertsOf,
  caseButton,
  confirm,
  confirmButton,
  noteField,
  offeredActions,
  openPanel,
  panelOf,
  pickOption,
  runAction,
  statusOf,
  waitForStatus,
  writeNote,
} from './cargoOccurrenceCaseScreen.helper'
import { mountOffice, stubVisibleLayout, text } from './cargoOccurrenceScreen.helper'
import { settle, waitFor } from './renderHook.helper'

const DOC = documentIdOf(1001)
const OTHER_ARRIVAL_KEY = [CARGO_RECEIVING_QUERY_KEY, 'arrival', 'outra-chegada'] as const
const PREVIEW_KEY = [CARGO_RECEIVING_QUERY_KEY, 'preview', 'p-1'] as const
const LIST_KEY = [CARGO_RECEIVING_QUERY_KEY, 'arrivals', { statuses: [] }] as const

/** O que a API aceita em cada estado, na ordem em que a tela os mostra. */
const EXPECTED_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  awaiting_contractor: ['decide'],
  cancelled: [],
  closed: [],
  decided: ['close'],
  recorded: ['review', 'cancel'],
  returned_to_warehouse: [],
  under_review: ['submit', 'warehouse-return', 'cancel'],
}

const occurrenceIn = (status: (typeof CARGO_OCCURRENCE_CASE_STATUSES)[number]) =>
  buildOccurrence({
    case: { id: `case-${status}`, status },
    id: `occ-${status}`,
    nfeDocumentId: DOC,
    typeName: `Avaria ${status}`,
  })

const ALL_STATUSES = CARGO_OCCURRENCE_CASE_STATUSES.map((status) => occurrenceIn(status))

let restoreLayout: () => void = () => undefined
let caseDouble: CargoCaseDouble

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
  caseDouble = installCargoCaseDouble()
})

afterEach(() => restoreLayout())

const mountWith = (status: (typeof CARGO_OCCURRENCE_CASE_STATUSES)[number], canResolve = true) =>
  mountOffice({ canResolve, occurrence: { occurrences: [occurrenceIn(status)] } })

describe('cada estado oferece exatamente as ações da máquina, só a quem tem `occurrences.resolve`', () => {
  test('com a permissão: a lista de ações de cada estado é a prevista (e a reentrega nunca aparece)', async () => {
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: ALL_STATUSES },
    })

    for (const status of CARGO_OCCURRENCE_CASE_STATUSES) {
      expect({ actions: offeredActions(`occ-${status}`), status }).toEqual({
        actions: EXPECTED_ACTIONS[status] ?? [],
        status,
      })
    }
    expect(text()).not.toContain('Reentrega')
    rendered.unmount()
  })

  test('sem a permissão: só a situação, nenhuma ação em estado nenhum', async () => {
    const { rendered } = await mountOffice({
      canManage: true,
      canResolve: false,
      occurrence: { occurrences: ALL_STATUSES },
    })

    for (const status of CARGO_OCCURRENCE_CASE_STATUSES) {
      expect(offeredActions(`occ-${status}`)).toEqual([])
    }
    expect(document.querySelectorAll('[data-case-action]').length).toBe(0)
    expect(statusOf('occ-recorded')).toBe('Registrada')
    rendered.unmount()
  })

  test('ocorrência sem tratativa (`case: null`) não oferece ação nenhuma', async () => {
    const semTratativa = buildOccurrence({ case: null, id: 'occ-none', nfeDocumentId: DOC })
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [semTratativa] },
    })

    expect(offeredActions('occ-none')).toEqual([])
    rendered.unmount()
  })

  test('cada botão diz de qual avaria e de qual nota ele é (acessibilidade)', async () => {
    const { rendered } = await mountWith('recorded')

    expect(caseButton('occ-recorded', 'review')?.getAttribute('aria-label')).toBe(
      'Iniciar análise — Avaria recorded (NF 1001)',
    )
    rendered.unmount()
  })

  test('a chegada fechada não esconde a tratativa: o contratante decide dias depois do prazo', async () => {
    const { rendered } = await mountOffice({
      arrival: { status: 'closed' },
      canResolve: true,
      occurrence: { occurrences: [occurrenceIn('awaiting_contractor')] },
    })

    expect(offeredActions('occ-awaiting_contractor')).toEqual(['decide'])
    rendered.unmount()
  })
})

describe('o caminho feliz, uma ação por vez', () => {
  test('"Iniciar análise" vai direto (reversível na prática): chama a rota e a situação muda', async () => {
    const { rendered } = await mountWith('recorded')

    await openPanel({ action: 'review', occurrenceId: 'occ-recorded' })
    await settle()

    expect(caseDouble.calls.change).toEqual([
      { action: 'review', kind: undefined, note: undefined, occurrenceId: 'occ-recorded' },
    ])
    await waitForStatus({ occurrenceId: 'occ-recorded', text: 'Em análise' })
    expect(offeredActions('occ-recorded')).toEqual(['submit', 'warehouse-return', 'cancel'])
    rendered.unmount()
  })

  test('"Enviar ao contratante" pede confirmação antes: abrir o painel não manda nada', async () => {
    const { rendered } = await mountWith('under_review')

    await openPanel({ action: 'submit', occurrenceId: 'occ-under_review' })

    expect(panelOf('occ-under_review')).not.toBeNull()
    expect(caseDouble.calls.change).toHaveLength(0)
    await confirm('occ-under_review')
    expect(caseDouble.calls.change.map((call) => call.action)).toEqual(['submit'])
    await waitForStatus({ occurrenceId: 'occ-under_review', text: 'Aguardando o contratante' })
    expect(panelOf('occ-under_review')).toBeNull()
    rendered.unmount()
  })

  test('"Voltar" fecha o painel sem mandar nada', async () => {
    const { rendered } = await mountWith('under_review')
    await openPanel({ action: 'submit', occurrenceId: 'occ-under_review' })

    const dismiss =
      panelOf('occ-under_review')?.querySelector<HTMLButtonElement>('[data-case-dismiss]')
    dismiss?.click()
    await settle()

    expect(panelOf('occ-under_review')).toBeNull()
    expect(caseDouble.calls.change).toHaveLength(0)
    rendered.unmount()
  })

  test('"Encerrar tratativa" pede confirmação e termina em Encerrada', async () => {
    const { rendered } = await mountWith('decided')

    await runAction({ action: 'close', occurrenceId: 'occ-decided' })

    expect(caseDouble.calls.change.map((call) => call.action)).toEqual(['close'])
    await waitForStatus({ occurrenceId: 'occ-decided', text: 'Encerrada' })
    expect(offeredActions('occ-decided')).toEqual([])
    rendered.unmount()
  })
})

describe('a nota é obrigatória onde a API a exige', () => {
  for (const { action, from } of [
    { action: 'warehouse-return', from: 'under_review' },
    { action: 'cancel', from: 'recorded' },
  ] as const) {
    test(`${action}: sem motivo o botão de confirmar não manda; com motivo manda o texto`, async () => {
      const { rendered } = await mountWith(from)
      const id = `occ-${from}`
      await openPanel({ action, occurrenceId: id })

      expect(confirmButton(id).disabled).toBe(true)
      await writeNote({ occurrenceId: id, text: '   ' })
      expect(confirmButton(id).disabled).toBe(true)
      expect(caseDouble.calls.change).toHaveLength(0)

      await writeNote({ occurrenceId: id, text: 'caixa voltou ao estoque' })
      expect(confirmButton(id).disabled).toBe(false)
      await confirm(id)

      expect(caseDouble.calls.change).toEqual([
        { action, kind: undefined, note: 'caixa voltou ao estoque', occurrenceId: id },
      ])
      rendered.unmount()
    })
  }

  test('abrir o painel leva o foco ao campo do motivo (teclado)', async () => {
    const { rendered } = await mountWith('under_review')

    await openPanel({ action: 'cancel', occurrenceId: 'occ-under_review' })

    await waitFor(() => expect(document.activeElement === noteField('occ-under_review')).toBe(true))
    rendered.unmount()
  })
})

describe('a decisão do escritório no lugar do contratante', () => {
  test('só `other` e `goods_paid`; nota obrigatória; manda `{ kind, note }`', async () => {
    const { rendered } = await mountWith('awaiting_contractor')
    const id = 'occ-awaiting_contractor'
    await openPanel({ action: 'decide', occurrenceId: id })

    expect(confirmButton(id).disabled).toBe(true)
    expect(panelOf(id)?.textContent).toContain('no lugar do contratante')
    await pickOption({ label: 'Decisão', option: 'Mercadoria paga' })
    await writeNote({ occurrenceId: id, text: 'a transportadora paga' })
    await confirm(id)

    expect(caseDouble.calls.change).toEqual([
      { action: 'decide', kind: 'goods_paid', note: 'a transportadora paga', occurrenceId: id },
    ])
    await waitForStatus({ occurrenceId: id, text: 'Decidida' })
    rendered.unmount()
  })

  test('a lista de decisões tem duas opções, e nenhuma é reentrega', async () => {
    const { rendered } = await mountWith('awaiting_contractor')
    await openPanel({ action: 'decide', occurrenceId: 'occ-awaiting_contractor' })

    const trigger = document.querySelector<HTMLElement>('[aria-label="Decisão"]')
    trigger?.click()
    await settle()
    const labels = [...document.querySelectorAll('[role="option"]')].map((option) =>
      option.textContent?.trim(),
    )

    expect(labels).toEqual(['Outra decisão', 'Mercadoria paga pela transportadora'])
    rendered.unmount()
  })
})

describe('o erro nomeia o motivo e a tela nunca fica muda', () => {
  const FAILURES = [
    { code: 'OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED', reason: 'já mudou de etapa' },
    { code: 'TOO_MANY_REQUESTS', reason: 'Aguarde' },
    { code: 'REQUEST_FAILED', reason: 'Sem conexão' },
    { code: 'OCCURRENCE_CASE_NOT_FOUND', reason: 'não tem tratativa' },
  ] as const

  for (const { code, reason } of FAILURES) {
    test(`${code} aparece com o motivo, e o painel continua aberto para tentar de novo`, async () => {
      const { rendered } = await mountWith('under_review')
      caseDouble.failures.push(new CargoReceivingRequestError(code))
      await openPanel({ action: 'submit', occurrenceId: 'occ-under_review' })

      await confirm('occ-under_review')

      expect(alertsOf('occ-under_review')).toContain(reason)
      expect(panelOf('occ-under_review')).not.toBeNull()
      expect(statusOf('occ-under_review')).toBe('Em análise')
      rendered.unmount()
    })
  }

  test('o erro some quando a pessoa tenta de novo e dá certo', async () => {
    const { rendered } = await mountWith('under_review')
    caseDouble.failures.push(new CargoReceivingRequestError('TOO_MANY_REQUESTS'))
    await openPanel({ action: 'submit', occurrenceId: 'occ-under_review' })
    await confirm('occ-under_review')
    expect(alertsOf('occ-under_review')).toContain('Aguarde')

    await confirm('occ-under_review')

    await waitForStatus({ occurrenceId: 'occ-under_review', text: 'Aguardando o contratante' })
    expect(alertsOf('occ-under_review')).toBe('')
    rendered.unmount()
  })

  test('ação de "Iniciar análise" que falha também diz o motivo (não tem painel para abrir)', async () => {
    const { rendered } = await mountWith('recorded')
    caseDouble.failures.push(new CargoReceivingRequestError('TOO_MANY_REQUESTS'))

    await openPanel({ action: 'review', occurrenceId: 'occ-recorded' })
    await settle()

    expect(alertsOf('occ-recorded')).toContain('Aguarde')
    rendered.unmount()
  })
})

describe('uma ação por vez, sem toque duplo', () => {
  test('com a ação em voo, todos os botões da avaria ficam travados e só um pedido sai', async () => {
    const { rendered } = await mountWith('recorded')
    caseDouble.isGated = true

    await openPanel({ action: 'review', occurrenceId: 'occ-recorded' })
    for (const action of offeredActions('occ-recorded')) {
      expect(caseButton('occ-recorded', action)?.disabled).toBe(true)
    }
    caseButton('occ-recorded', 'review')?.click()
    await settle()
    expect(caseDouble.calls.change).toHaveLength(1)

    await releaseCaseGate(caseDouble)
    await waitForStatus({ occurrenceId: 'occ-recorded', text: 'Em análise' })
    rendered.unmount()
  })
})

describe('o que cada ação refaz', () => {
  test('relê as avarias da chegada, a lista de chegadas e as prévias — e só o que é da chegada', async () => {
    const { occurrence, rendered } = await mountWith('recorded')
    const { queryClient } = rendered
    for (const key of [PREVIEW_KEY, LIST_KEY, OTHER_ARRIVAL_KEY]) {
      queryClient.setQueryData(key, { seeded: true })
    }
    const readsBefore = occurrence.calls.listOccurrences

    await openPanel({ action: 'review', occurrenceId: 'occ-recorded' })
    await settle()

    expect(occurrence.calls.listOccurrences).toBeGreaterThan(readsBefore)
    expect(queryClient.getQueryState(LIST_KEY)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(PREVIEW_KEY)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(OTHER_ARRIVAL_KEY)?.isInvalidated).toBe(false)
    rendered.unmount()
  })

  test('relê também quando a ação falha: a recusa pode ser porque a tratativa mudou em outra tela', async () => {
    const { occurrence, rendered } = await mountWith('recorded')
    caseDouble.failures.push(
      new CargoReceivingRequestError('OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED'),
    )
    const readsBefore = occurrence.calls.listOccurrences

    await openPanel({ action: 'review', occurrenceId: 'occ-recorded' })
    await settle()

    expect(occurrence.calls.listOccurrences).toBeGreaterThan(readsBefore)
    rendered.unmount()
  })
})

describe('depois de decidida, "Concluir devolução" da nota se libera', () => {
  test('a nota marcada com a avaria decidida pelo escritório conclui a devolução', async () => {
    const origin = occurrenceIn('awaiting_contractor')
    const { rendered } = await mountOffice({
      canManage: true,
      canResolve: true,
      occurrence: {
        occurrences: [origin],
        returns: new Map([[DOC, { occurrenceId: origin.id, state: 'marked' as const }]]),
      },
    })
    expect(document.querySelectorAll('[aria-label="Concluir devolução — NF 1001"]').length).toBe(0)

    await runAction({
      action: 'decide',
      note: 'devolver ao contratante',
      occurrenceId: origin.id,
    })

    await waitFor(() =>
      expect(document.querySelectorAll('[aria-label="Concluir devolução — NF 1001"]').length).toBe(
        1,
      ),
    )
    rendered.unmount()
  })
})
