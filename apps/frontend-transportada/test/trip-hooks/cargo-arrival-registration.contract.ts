/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): registrar a chegada montado de verdade — só contratante com recebimento ligado,
 * seleção de notas com contador e limite de 300, o `Idempotency-Key` estável por tentativa e a recusa
 * do servidor nomeando TODAS as notas e campos, cada um com atalho (`web.md` §11). Dados sintéticos.
 */
import { createElement } from 'react'
import { beforeEach, describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { CargoArrivalRegistration } from '@/modules/cargo-receiving/components/CargoArrivalRegistration.component'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { ALFA_ID, ARRIVAL_ID, buildAvailable } from '../fixtures/cargoReceiving.fixture'
import {
  buttonByText,
  byLabel,
  cargoReceivingFakes,
  click,
  fieldByLabel,
  installCargoReceivingDouble,
  maybeByLabel,
  networkFailure,
  readCardLabels,
  resetLocation,
  typeInto,
  type CargoReceivingDouble,
} from './cargoReceivingHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

function availableList(count: number) {
  return Array.from({ length: count }, (_, index) => buildAvailable(index + 1))
}

async function mountRegistration(options: Partial<CargoReceivingDouble> = {}) {
  resetLocation('/recebimento/nova')
  const double = installCargoReceivingDouble({ available: availableList(4), ...options })
  const rendered = await renderWithQueryClient(createElement(CargoArrivalRegistration))
  return { double, rendered }
}

async function chooseContractor(name: string): Promise<void> {
  await waitFor(() =>
    expect(
      (document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  await click(document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement)
  const option = [...document.querySelectorAll('[role="option"]')].find(
    (item) => item.textContent?.trim() === name,
  )
  if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${name}`)
  await click(option as HTMLElement)
  await waitFor(() =>
    expect(document.querySelector('[aria-label^="Selecionar a nota"]')).not.toBeNull(),
  )
}

describe('as notas livres viram cartões no celular (web.md §10)', () => {
  test('número, destinatário, cidade e valor de cada nota levam o rótulo da coluna', async () => {
    const { rendered } = await mountRegistration()
    await chooseContractor('Alfa Indústria Fictícia')

    const { headers, unlabeled, wrong } = readCardLabels(
      document.querySelector('table') as HTMLTableElement,
    )

    expect(headers).toEqual(['', 'Nota', 'Destinatário', 'Cidade', 'Valor'])
    expect(unlabeled).toEqual([])
    expect(wrong).toEqual([])
    rendered.unmount()
  })
})

const checkbox = (number: number) =>
  byLabel(`Selecionar a nota ${String(number)}`) as HTMLInputElement
const selectAll = () => byLabel('Selecionar todas as listadas') as HTMLInputElement
const counter = () => document.body.textContent ?? ''

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('registrar a chegada (spec 237 T2.4)', () => {
  test('só lista contratantes com o recebimento ligado e explica o porquê', async () => {
    const { rendered } = await mountRegistration()
    await waitFor(() =>
      expect(
        (document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement).disabled,
      ).toBe(false),
    )

    await click(document.querySelector('button[aria-label="Contratante"]') as HTMLButtonElement)

    expect(
      [...document.querySelectorAll('[role="option"]')].map((item) => item.textContent?.trim()),
    ).toEqual(['Alfa Indústria Fictícia', 'Beta Comércio Fictício'])
    expect(document.body.textContent).toContain(
      'Só aparecem contratantes com o recebimento ligado no perfil.',
    )
    rendered.unmount()
  })

  test('sem contratante escolhido não há nota para marcar', async () => {
    const { rendered } = await mountRegistration()

    expect(document.body.textContent).toContain(
      'Escolha o contratante para listar as notas livres dele.',
    )
    expect(document.querySelector('[aria-label^="Selecionar a nota"]')).toBeNull()
    rendered.unmount()
  })

  test('marcar notas move o contador e "selecionar todas" marca as listadas', async () => {
    const { rendered } = await mountRegistration()
    await chooseContractor('Alfa Indústria Fictícia')
    expect(counter()).toContain('0 de 300 notas selecionadas')

    await click(checkbox(2))
    expect(counter()).toContain('1 de 300 notas selecionadas')
    expect(selectAll().indeterminate).toBe(true)

    await click(selectAll())
    expect(counter()).toContain('4 de 300 notas selecionadas')
    expect(checkbox(1).checked && checkbox(4).checked).toBe(true)

    await click(selectAll())
    expect(counter()).toContain('0 de 300 notas selecionadas')
    rendered.unmount()
  })

  test('mostra número, destinatário, cidade e valor de cada nota', async () => {
    const { rendered } = await mountRegistration()
    await chooseContractor('Alfa Indústria Fictícia')

    const row = checkbox(1).closest('tr')?.textContent ?? ''

    expect(row).toContain('1')
    expect(row).toContain('Destinatário Fictício 1')
    expect(row).toContain('Piracicaba')
    expect(row).toContain('R$')
    expect(row).toContain('2.664,00')
    rendered.unmount()
  })

  test('a busca filtra as notas listadas por número, destinatário ou cidade', async () => {
    const { rendered } = await mountRegistration({
      available: [
        buildAvailable(1),
        buildAvailable(2, { cityName: 'Limeira', recipientName: 'Mercado Beta Fictício' }),
      ],
    })
    await chooseContractor('Alfa Indústria Fictícia')

    await typeInto(fieldByLabel('Buscar nota'), 'limeira')
    expect(maybeByLabel('Selecionar a nota 1')).toBeNull()
    expect(maybeByLabel('Selecionar a nota 2')).not.toBeNull()

    await typeInto(fieldByLabel('Buscar nota'), 'zzz')
    expect(document.body.textContent).toContain('Nenhuma nota com essa busca.')
    rendered.unmount()
  })

  test('o limite é 300: a nota 301 não entra e a tela avisa', async () => {
    const { rendered } = await mountRegistration({ available: availableList(301) })
    await chooseContractor('Alfa Indústria Fictícia')

    await click(selectAll())

    expect(counter()).toContain('300 de 300 notas selecionadas')
    expect(counter()).toContain('O limite de 300 notas por chegada foi atingido.')
    expect(checkbox(301).checked).toBe(false)
    rendered.unmount()
  })

  test('registrar sem nota não chama o servidor e aponta o problema no lugar dele', async () => {
    const { double, rendered } = await mountRegistration()
    await chooseContractor('Alfa Indústria Fictícia')

    await click(buttonByText('Registrar chegada'))

    expect(double.calls.register).toHaveLength(0)
    expect(counter()).toContain('Marque ao menos uma nota.')
    rendered.unmount()
  })

  test('o corpo vai sem empresa, com as notas na ordem marcada e a hora em ISO, e abre o detalhe', async () => {
    const { double, rendered } = await mountRegistration()
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(3))
    await click(checkbox(1))
    await typeInto(fieldByLabel('Paletes (opcional)'), '12')
    await typeInto(fieldByLabel('Referência (opcional)'), 'Lacre 4471')

    await click(buttonByText('Registrar chegada'))
    await waitFor(() => expect(double.calls.register).toHaveLength(1))

    const sent = double.calls.register[0]
    expect(Object.keys(sent?.input ?? {}).sort()).toEqual([
      'arrivedAt',
      'contractorId',
      'documentIds',
      'palletCount',
      'reference',
    ])
    expect(sent?.input.contractorId).toBe(ALFA_ID)
    expect(sent?.input.documentIds).toEqual([buildAvailable(3).id, buildAvailable(1).id])
    expect(sent?.input.palletCount).toBe(12)
    expect(sent?.input.reference).toBe('Lacre 4471')
    expect(new Date(String(sent?.input.arrivedAt)).getTime()).toBeLessThanOrEqual(
      Date.now() + 120_000,
    )
    await waitFor(() => expect(window.location.pathname).toBe(`/recebimento/${ARRIVAL_ID}/detalhe`))
    rendered.unmount()
  })
})

describe('o Idempotency-Key por tentativa', () => {
  test('o mesmo envio repetido reaproveita a chave; mudar o pedido gera chave nova', async () => {
    const { double, rendered } = await mountRegistration({
      registerFailure: networkFailure(),
    })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))

    await click(buttonByText('Registrar chegada'))
    await waitFor(() => expect(double.calls.register).toHaveLength(1))
    await click(buttonByText('Registrar chegada'))
    await waitFor(() => expect(double.calls.register).toHaveLength(2))
    expect(double.calls.register[1]?.idempotencyKey).toBe(double.calls.register[0]?.idempotencyKey)

    await typeInto(fieldByLabel('Referência (opcional)'), 'Lacre novo')
    await click(buttonByText('Registrar chegada'))
    await waitFor(() => expect(double.calls.register).toHaveLength(3))

    expect(double.calls.register[2]?.idempotencyKey).not.toBe(
      double.calls.register[0]?.idempotencyKey,
    )
    expect(double.calls.register[0]?.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{16,256}$/u)
    rendered.unmount()
  })

  test('a chave não muda a cada render: digitar na busca não a troca', async () => {
    const { double, rendered } = await mountRegistration({ registerFailure: networkFailure() })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))
    await click(buttonByText('Registrar chegada'))
    await waitFor(() => expect(double.calls.register).toHaveLength(1))

    await typeInto(fieldByLabel('Buscar nota'), '1')
    await typeInto(fieldByLabel('Buscar nota'), '')
    await click(buttonByText('Registrar chegada'))
    await waitFor(() => expect(double.calls.register).toHaveLength(2))

    expect(double.calls.register[1]?.idempotencyKey).toBe(double.calls.register[0]?.idempotencyKey)
    rendered.unmount()
  })
})

describe('a recusa do servidor nomeia tudo e cada nome é um atalho', () => {
  test('lista TODAS as notas recusadas, cada uma com o motivo, e o atalho leva à linha', async () => {
    const { rendered } = await mountRegistration({
      registerFailure: new CargoReceivingRequestError('CARGO_ARRIVAL_DOCUMENTS_REFUSED', [
        { field: 'documentIds.0', message: 'DOCUMENT_IN_LIVE_TRIP' },
        { field: 'documentIds.2', message: 'DOCUMENT_FROM_ANOTHER_ISSUER' },
      ]),
    })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(4))
    await click(checkbox(2))
    await click(checkbox(3))

    await click(buttonByText('Registrar chegada'))
    await settle()

    const summary = document.querySelector('[data-refusal-documents]') as HTMLElement
    expect(summary.textContent).toContain('Notas recusadas:')
    expect(summary.textContent).toContain('NF 4')
    expect(summary.textContent).toContain('já está em uma viagem')
    expect(summary.textContent).toContain('NF 3')
    expect(summary.textContent).toContain('é de outro emitente')
    expect(summary.querySelectorAll('button')).toHaveLength(2)

    await click(buttonByText('NF 3', summary))
    expect(document.activeElement === checkbox(3)).toBe(true)
    rendered.unmount()
  })

  test('campos recusados saem pelo rótulo impresso e o atalho leva o foco ao campo', async () => {
    const { rendered } = await mountRegistration({
      registerFailure: new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'arrivedAt', message: 'Invalid' },
        { field: 'reference', message: 'Too big' },
        { field: 'Idempotency-Key', message: 'Use 16 to 256' },
      ]),
    })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))

    await click(buttonByText('Registrar chegada'))
    await settle()

    const summary = document.querySelector('[data-refusal-summary]') as HTMLElement
    expect(summary.textContent).toContain('Confira:')
    expect([...summary.querySelectorAll('button')].map((item) => item.textContent)).toEqual([
      'Data e hora da chegada',
      'Referência',
      'Idempotency-Key',
    ])

    await click(buttonByText('Referência', summary))
    expect(document.activeElement === fieldByLabel('Referência (opcional)')).toBe(true)
    expect(fieldByLabel('Referência (opcional)').getAttribute('aria-invalid')).toBe('true')
    rendered.unmount()
  })

  test('editar um campo limpa só o erro dele', async () => {
    const { rendered } = await mountRegistration({
      registerFailure: new CargoReceivingRequestError('INVALID_REQUEST', [
        { field: 'palletCount', message: 'x' },
        { field: 'reference', message: 'y' },
      ]),
    })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))
    await click(buttonByText('Registrar chegada'))
    await settle()

    await typeInto(fieldByLabel('Referência (opcional)'), 'novo')

    expect(fieldByLabel('Referência (opcional)').getAttribute('aria-invalid')).toBeNull()
    expect(fieldByLabel('Paletes (opcional)').getAttribute('aria-invalid')).toBe('true')
    rendered.unmount()
  })

  test('falha sem campo nem nota fica em silêncio na lista e explica o motivo claro', async () => {
    const { rendered } = await mountRegistration({
      registerFailure: new CargoReceivingRequestError('CARGO_RECEIVING_NOT_ENABLED'),
    })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))

    await click(buttonByText('Registrar chegada'))
    await settle()

    expect(document.querySelector('[data-refusal-summary]')).toBeNull()
    expect(document.querySelector('[data-refusal-documents]')).toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'O recebimento da carga não está ligado para este contratante.',
    )
    rendered.unmount()
  })

  test('chegada de mais de 30 dias: o servidor recusa e o campo da data diz o motivo, com atalho (L6)', async () => {
    const { rendered } = await mountRegistration({
      registerFailure: new CargoReceivingRequestError('CARGO_ARRIVAL_ARRIVED_AT_TOO_OLD', [
        { field: 'arrivedAt', message: 'The arrival cannot be more than 30 days ago' },
      ]),
    })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))

    await click(buttonByText('Registrar chegada'))
    await settle()

    const summary = document.querySelector('[data-refusal-summary]') as HTMLElement
    expect(summary.textContent).toContain('Data e hora da chegada')
    expect(document.body.textContent).toContain('Use uma data de até 30 dias atrás.')
    rendered.unmount()
  })

  test('data de mais de 30 dias atrás é recusada no próprio campo, antes de ir ao servidor', async () => {
    const { double, rendered } = await mountRegistration()
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))
    const year = String(new Date().getFullYear() - 1)
    await typeInto(byLabel('Data da chegada') as HTMLInputElement, `01/01/${year}`)

    await click(buttonByText('Registrar chegada'))

    expect(double.calls.register).toHaveLength(0)
    expect(document.body.textContent).toContain('Use uma data de até 30 dias atrás.')
    rendered.unmount()
  })

  test('sem conexão diz isso e a seleção feita não se perde', async () => {
    const { rendered } = await mountRegistration({ registerFailure: networkFailure() })
    await chooseContractor('Alfa Indústria Fictícia')
    await click(checkbox(1))

    await click(buttonByText('Registrar chegada'))
    await settle()

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Sem conexão com o servidor.',
    )
    expect(checkbox(1).checked).toBe(true)
    expect(cargoReceivingFakes.double.calls.register).toHaveLength(1)
    rendered.unmount()
  })
})
