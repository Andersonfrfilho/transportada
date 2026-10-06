/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b (T3.4a, achado da tratativa): a decisão `goods_paid` só fecha com o acerto por item
 * (`OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS`), e a leitura das avarias NÃO traz a decisão — só o estado. A tela
 * abre o formulário do acerto quando ela sabe (decidiu agora, escolhendo `goods_paid`) e quando o servidor avisa
 * (o "Encerrar" recusado com 422), nunca antes de saber: `other` encerra direto. O acerto sai sem `payerId` e sem
 * cobrança (a avaria não tem viagem). Encerrar com rascunho por gravar perderia o que foi digitado: fica travado.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { installCargoCaseDouble, type CargoCaseDouble } from './cargoOccurrenceCaseHarness.helper'
import {
  alertsOf,
  caseButton,
  confirm,
  itemOf,
  openPanel,
  pickOption,
  runAction,
  statusOf,
  waitForStatus,
} from './cargoOccurrenceCaseScreen.helper'
import { mountOffice, stubVisibleLayout, typeInArea } from './cargoOccurrenceScreen.helper'
import { click } from './cargoReceivingHarness.helper'
import { settle, waitFor } from './renderHook.helper'

const DOC = documentIdOf(1001)
const OCCURRENCE = 'occ-decided'

const decidedBy = (kind: 'goods_paid' | 'other') => {
  const origin = buildOccurrence({
    case: { id: 'case-1', status: 'decided' },
    id: OCCURRENCE,
    items: [
      { code: 'P-100', description: 'Biscoito de leite 200 g', quantity: '2.000', unit: 'CX' },
      { code: 'P-200', description: 'Farinha de trigo', quantity: '1.000', unit: 'KG' },
    ],
    nfeDocumentId: DOC,
  })
  caseDouble.decisions.set(OCCURRENCE, kind)
  return origin
}

let restoreLayout: () => void = () => undefined
let caseDouble: CargoCaseDouble

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
  caseDouble = installCargoCaseDouble()
})

afterEach(() => restoreLayout())

const form = (): HTMLElement | null =>
  itemOf(OCCURRENCE).querySelector<HTMLElement>('[data-case-settlement]')
const rows = (): HTMLElement[] => [
  ...document.querySelectorAll<HTMLElement>('[data-settlement-row]'),
]
const rowCount = (): number => rows().length
const amountField = (index: number): HTMLInputElement =>
  rows()[index]?.querySelector<HTMLInputElement>(
    '[data-settlement-field="amount"]',
  ) as HTMLInputElement
const save = (): HTMLButtonElement =>
  itemOf(OCCURRENCE).querySelector<HTMLButtonElement>('[data-settlement-save]') as HTMLButtonElement

async function chooseItem(input: { index: number; label: string }): Promise<void> {
  const trigger = rows()[input.index]?.querySelector<HTMLElement>('[aria-label="Item do acerto"]')
  await click(trigger as HTMLElement)
  const option = [...document.querySelectorAll('[role="option"]')].find((candidate) =>
    candidate.textContent?.includes(input.label),
  )
  await click(option as HTMLElement)
}

async function fillRow(input: { amount: string; index: number; label: string }): Promise<void> {
  await chooseItem(input)
  await typeInArea(amountField(input.index), input.amount)
}

describe('decidiu "mercadoria paga" agora: o acerto se abre sozinho', () => {
  test('escolher `goods_paid` na decisão abre o acerto; salvar o acerto libera o "Encerrar"', async () => {
    const origin = buildOccurrence({
      case: { id: 'case-1', status: 'awaiting_contractor' },
      id: OCCURRENCE,
      nfeDocumentId: DOC,
    })
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [origin] },
    })
    await openPanel({ action: 'decide', occurrenceId: OCCURRENCE })
    await pickOption({ label: 'Decisão', option: 'Mercadoria paga' })
    const note = itemOf(OCCURRENCE).querySelector('textarea') as HTMLTextAreaElement
    await typeInArea(note, 'a transportadora paga')
    await click(itemOf(OCCURRENCE).querySelector('[data-case-confirm]') as HTMLElement)
    await settle()

    await waitForStatus({ occurrenceId: OCCURRENCE, text: 'Decidida' })
    await waitFor(() => expect(form() !== null).toBe(true))
    expect(rowCount()).toBe(1)

    await fillRow({ amount: '12000', index: 0, label: 'P-100' })
    expect(caseButton(OCCURRENCE, 'close')?.disabled).toBe(true)
    expect(itemOf(OCCURRENCE).textContent).toContain('Salve o acerto antes de encerrar')

    await click(save())
    await settle()

    expect(caseDouble.calls.recordSettlement).toEqual([
      {
        items: [
          { amount: '120.00', amountSource: 'manual', payerKind: 'carrier', productCode: 'P-100' },
        ],
        occurrenceId: OCCURRENCE,
      },
    ])
    await waitFor(() => expect(caseButton(OCCURRENCE, 'close')?.disabled).toBe(false))
    await runAction({ action: 'close', occurrenceId: OCCURRENCE })
    await waitForStatus({ occurrenceId: OCCURRENCE, text: 'Encerrada' })
    rendered.unmount()
  })
})

describe('decidida pelo contratante (o painel não sabe a decisão): o servidor avisa e o acerto abre', () => {
  test('"Encerrar" recusado com 422 abre o acerto, diz o motivo e não deixa a ação perdida', async () => {
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [decidedBy('goods_paid')] },
    })
    expect(form()).toBeNull()

    await runAction({ action: 'close', occurrenceId: OCCURRENCE })

    expect(alertsOf(OCCURRENCE)).toContain('registre o acerto antes de encerrar')
    expect(form() !== null).toBe(true)
    expect(statusOf(OCCURRENCE)).toBe('Decidida')
    rendered.unmount()
  })

  test('o acerto é gravado SEM `payerId`, com a origem manual e o valor em decimal; depois encerra', async () => {
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [decidedBy('goods_paid')] },
    })
    await runAction({ action: 'close', occurrenceId: OCCURRENCE })
    await fillRow({ amount: '123456', index: 0, label: 'P-200' })
    await click(itemOf(OCCURRENCE).querySelector('[data-settlement-add]') as HTMLElement)
    await fillRow({ amount: '500', index: 1, label: 'P-100' })

    await click(save())
    await settle()

    expect(caseDouble.calls.recordSettlement[0]?.items).toEqual([
      { amount: '1234.56', amountSource: 'manual', payerKind: 'carrier', productCode: 'P-200' },
      { amount: '5.00', amountSource: 'manual', payerKind: 'carrier', productCode: 'P-100' },
    ])
    await waitFor(() => expect(caseButton(OCCURRENCE, 'close')?.disabled).toBe(false))
    await runAction({ action: 'close', occurrenceId: OCCURRENCE })
    await waitForStatus({ occurrenceId: OCCURRENCE, text: 'Encerrada' })
    rendered.unmount()
  })

  test('o acerto que já estava gravado volta ao formulário, com o valor mascarado', async () => {
    caseDouble.settlements.set(OCCURRENCE, [
      { amount: '45.5000', amountSource: 'manual', payerKind: 'insurer', productCode: 'P-100' },
    ])
    const origin = buildOccurrence({
      case: { id: 'case-1', status: 'awaiting_contractor' },
      id: OCCURRENCE,
      nfeDocumentId: DOC,
    })
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [origin] },
    })
    await openPanel({ action: 'decide', occurrenceId: OCCURRENCE })
    await pickOption({ label: 'Decisão', option: 'Mercadoria paga' })
    await typeInArea(itemOf(OCCURRENCE).querySelector('textarea') as HTMLTextAreaElement, 'paga')
    await click(itemOf(OCCURRENCE).querySelector('[data-case-confirm]') as HTMLElement)
    await settle()

    await waitFor(() => expect(amountField(0)?.value).toBe('45,50'))
    expect(rowCount()).toBe(1)
    expect(rows()[0]?.textContent).toContain('P-100')
    expect(rows()[0]?.textContent).toContain('Seguradora')
    rendered.unmount()
  })
})

describe('decisão `other`: encerra direto, sem acerto', () => {
  test('nunca aparece o formulário do acerto', async () => {
    const { rendered } = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [decidedBy('other')] },
    })

    await runAction({ action: 'close', occurrenceId: OCCURRENCE })

    await waitForStatus({ occurrenceId: OCCURRENCE, text: 'Encerrada' })
    expect(form()).toBeNull()
    expect(caseDouble.calls.readSettlement).toHaveLength(0)
    rendered.unmount()
  })
})

describe('o formulário do acerto não deixa passar linha incompleta nem repetida', () => {
  async function openForm() {
    const mounted = await mountOffice({
      canResolve: true,
      occurrence: { occurrences: [decidedBy('goods_paid')] },
    })
    await runAction({ action: 'close', occurrenceId: OCCURRENCE })
    return mounted
  }

  test('linha sem item ou sem valor: nada é enviado e a linha diz o que falta (aria-invalid)', async () => {
    const { rendered } = await openForm()

    await click(save())
    await settle()

    expect(caseDouble.calls.recordSettlement).toHaveLength(0)
    expect(alertsOf(OCCURRENCE)).toContain('Escolha o item')
    expect(alertsOf(OCCURRENCE)).toContain('valor maior que zero')
    expect(amountField(0).getAttribute('aria-invalid')).toBe('true')
    rendered.unmount()
  })

  test('o item já usado em outra linha não pode ser escolhido de novo', async () => {
    const { rendered } = await openForm()
    await fillRow({ amount: '1000', index: 0, label: 'P-100' })
    await click(itemOf(OCCURRENCE).querySelector('[data-settlement-add]') as HTMLElement)

    const trigger = rows()[1]?.querySelector<HTMLElement>('[aria-label="Item do acerto"]')
    await click(trigger as HTMLElement)
    const labels = [...document.querySelectorAll('[role="option"]')].map((option) =>
      option.textContent?.trim(),
    )

    expect(labels.some((label) => label?.includes('P-100'))).toBe(false)
    expect(labels.some((label) => label?.includes('P-200'))).toBe(true)
    rendered.unmount()
  })

  test('não dá para remover a última linha; remover uma do meio mantém as outras', async () => {
    const { rendered } = await openForm()
    const remove = () => [
      ...itemOf(OCCURRENCE).querySelectorAll<HTMLButtonElement>('[data-settlement-remove]'),
    ]
    expect(remove()[0]?.disabled).toBe(true)

    await click(itemOf(OCCURRENCE).querySelector('[data-settlement-add]') as HTMLElement)
    expect(rowCount()).toBe(2)
    await click(remove()[0] as HTMLButtonElement)

    expect(rowCount()).toBe(1)
    rendered.unmount()
  })

  test('o total é a soma das linhas, em reais', async () => {
    const { rendered } = await openForm()
    await fillRow({ amount: '12050', index: 0, label: 'P-100' })

    expect(itemOf(OCCURRENCE).querySelector('[data-settlement-total]')?.textContent).toContain(
      '120,50',
    )
    rendered.unmount()
  })

  test('a recusa do servidor ao gravar nomeia o motivo e guarda o que foi digitado', async () => {
    const { rendered } = await openForm()
    await fillRow({ amount: '1000', index: 0, label: 'P-100' })
    caseDouble.failures.push(new CargoReceivingRequestError('TOO_MANY_REQUESTS'))

    await click(save())
    await settle()

    expect(alertsOf(OCCURRENCE)).toContain('Aguarde')
    expect(amountField(0).value).toBe('10,00')
    rendered.unmount()
  })
})
