/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.3 (RF8, RF8a): o detalhe do escritório com as avarias — a lista de ocorrências de recebimento
 * (tipo, nota, itens, foto, situação da tratativa), as contagens "a devolver" e "devolvidas" no cabeçalho, os
 * selos nas notas, as mesmas ações conforme a permissão, e o motivo de "Fechar chegada" estar travado quando há
 * nota marcada (texto neutro, com a lista, cada nota um atalho). A tabela vira cartões abaixo de 40 rem.
 */
import { beforeEach, describe, expect, test } from 'bun:test'

import { buildOccurrence } from '../fixtures/cargoOccurrence.fixture'
import { documentIdOf } from '../fixtures/cargoReceiving.fixture'
import { setCaseStatus } from './cargoOccurrenceHarness.helper'
import {
  completeButton,
  markButton,
  mountOffice,
  rowOf,
  text,
  unmarkButton,
  type MountOptions,
} from './cargoOccurrenceScreen.helper'
import { buttonByText, click, readCardLabels } from './cargoReceivingHarness.helper'
import { settle, waitFor } from './renderHook.helper'

const DOC_1001 = documentIdOf(1001)
const DOC_1003 = documentIdOf(1003)
const OCCURRENCE_A = buildOccurrence({
  case: { id: 'case-a', status: 'awaiting_contractor' },
  id: 'occ-a',
  nfeDocumentId: DOC_1001,
  note: 'Caixa amassada',
})
const OCCURRENCE_B = buildOccurrence({
  attachments: [
    {
      downloadUrl: 'https://files.test/b.jpg',
      expired: false,
      id: 'att-b',
      mimeType: 'image/jpeg',
      position: 1,
      thumbnailUrl: 'https://files.test/b-thumb.jpg',
    },
  ],
  case: { id: 'case-b', status: 'decided' },
  id: 'occ-b',
  items: [
    { code: 'P-200', description: 'Farinha de trigo', quantity: '3.000', unit: 'KG' },
    { code: 'P-300', description: 'Sabonete em barra', quantity: null, unit: null },
  ],
  nfeDocumentId: DOC_1003,
  occurrenceTypeId: 'tipo-faltante',
  typeName: 'Item faltante na chegada',
})

function seeded(options: MountOptions = {}): MountOptions {
  return {
    ...options,
    occurrence: {
      occurrences: [OCCURRENCE_A, OCCURRENCE_B],
      returns: new Map([
        [DOC_1001, { occurrenceId: 'occ-a', state: 'marked' as const }],
        [DOC_1003, { occurrenceId: 'occ-b', state: 'returned' as const }],
      ]),
      ...options.occurrence,
    },
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

const closeButton = () => buttonByText('Fechar chegada')

describe('as ocorrências de recebimento da chegada', () => {
  test('cada uma mostra o tipo, a nota, os itens com a contagem, a foto e a situação da tratativa', async () => {
    const { rendered } = await mountOffice(seeded())

    const list = document.querySelector('[data-occurrences]') as HTMLElement
    expect(list.querySelectorAll('li[data-occurrence-id]').length).toBe(2)
    const faltante = list.querySelector('[data-occurrence-id="occ-b"]') as HTMLElement
    expect(faltante.textContent).toContain('Item faltante na chegada')
    expect(faltante.textContent).toContain('NF 1003')
    expect(faltante.textContent).toContain('P-200 — Farinha de trigo (3 KG)')
    expect(faltante.textContent).toContain('P-300 — Sabonete em barra')
    expect(faltante.textContent).toContain('Decidida')
    expect(faltante.querySelector('img')?.getAttribute('src')).toBe('https://files.test/b-thumb.jpg')
    const amassada = list.querySelector('[data-occurrence-id="occ-a"]') as HTMLElement
    expect(amassada.textContent).toContain('Aguardando o contratante')
    expect(amassada.textContent).toContain('Caixa amassada')
    rendered.unmount()
  })

  test('sem ocorrência nenhuma a seção não aparece', async () => {
    const { rendered } = await mountOffice()

    expect(document.querySelectorAll('[data-occurrences]').length).toBe(0)
    rendered.unmount()
  })

  test('o anexo vencido ou sem miniatura não vira imagem quebrada', async () => {
    const expired = buildOccurrence({
      attachments: [{ expired: true, id: 'att-x', mimeType: 'image/jpeg', position: 1 }],
      id: 'occ-x',
      nfeDocumentId: DOC_1001,
    })
    const { rendered } = await mountOffice({ occurrence: { occurrences: [expired] } })

    const item = document.querySelector('[data-occurrence-id="occ-x"]') as HTMLElement
    expect(item.querySelectorAll('img').length).toBe(0)
    expect(item.textContent).toContain('A foto não está mais disponível')
    rendered.unmount()
  })
})

describe('o cabeçalho e os selos', () => {
  test('conta as notas a devolver e as devolvidas', async () => {
    const { rendered } = await mountOffice(seeded())

    expect(text()).toContain('Notas a devolver: 1')
    expect(text()).toContain('Notas devolvidas: 1')
    rendered.unmount()
  })

  test('sem nota marcada nem devolvida o cabeçalho não fala de devolução', async () => {
    const { rendered } = await mountOffice()

    expect(text()).not.toContain('Notas a devolver')
    expect(text()).not.toContain('Notas devolvidas')
    rendered.unmount()
  })

  test('cada nota mostra o selo da sua situação, ao lado do "Já em viagem" que já existia', async () => {
    const { rendered } = await mountOffice(seeded())

    expect(rowOf(1001).textContent).toContain('A devolver')
    expect(rowOf(1003).textContent).toContain('Devolvida')
    expect(rowOf(1004).textContent).toContain('Já em viagem')
    rendered.unmount()
  })
})

describe('as ações do escritório, conforme a permissão', () => {
  test('quem tem `trip.manage` conclui a devolução quando a tratativa está decidida', async () => {
    const { occurrence, rendered } = await mountOffice(
      seeded({ occurrence: { returns: new Map([[DOC_1001, { occurrenceId: 'occ-a', state: 'marked' }]]) } }),
    )
    expect(completeButton(1001)).toBeNull()
    setCaseStatus(occurrence, { occurrenceId: 'occ-a', status: 'decided' })

    await rendered.queryClient.invalidateQueries()
    await waitFor(() => expect(completeButton(1001)).not.toBeNull())
    await click(completeButton(1001) as HTMLButtonElement)
    await settle()

    expect(occurrence.calls.changeReturn.at(-1)).toMatchObject({ action: 'complete', documentId: DOC_1001 })
    await waitFor(() => expect(rowOf(1001).textContent).toContain('Devolvida'))
    rendered.unmount()
  })

  test('só quem tem `occurrences.resolve` vê "Desfazer devolução"', async () => {
    const withoutResolve = await mountOffice(seeded({ canResolve: false }))
    expect(unmarkButton(1001)).toBeNull()
    withoutResolve.rendered.unmount()
    document.body.innerHTML = ''

    const withResolve = await mountOffice(seeded({ canResolve: true }))
    expect(unmarkButton(1001)).not.toBeNull()
    withResolve.rendered.unmount()
  })

  test('quem só lê vê os selos e a lista, e nenhuma ação', async () => {
    const { rendered } = await mountOffice(seeded({ canManage: false, canResolve: false }))

    expect(rowOf(1001).textContent).toContain('A devolver')
    expect(rowOf(1001).querySelectorAll('button').length).toBe(0)
    expect(markButton(1001)).toBeNull()
    rendered.unmount()
  })

  test('chegada fechada é só leitura: nenhuma ação, mesmo com todas as permissões', async () => {
    const { rendered } = await mountOffice(
      seeded({
        arrival: { status: 'closed' },
        canManage: true,
        canResolve: true,
      }),
    )

    expect(unmarkButton(1001)).toBeNull()
    expect(completeButton(1001)).toBeNull()
    rendered.unmount()
  })

  test('desfazer pelo escritório devolve a nota ao fluxo e some o motivo do bloqueio', async () => {
    const { occurrence, rendered } = await mountOffice(seeded({ canResolve: true }))
    expect((closeButton() as HTMLButtonElement).disabled).toBe(true)

    await click(unmarkButton(1001) as HTMLButtonElement)
    await settle()

    expect(occurrence.calls.changeReturn.at(-1)).toMatchObject({ action: 'unmark', documentId: DOC_1001 })
    await waitFor(() => expect(document.querySelectorAll('[data-close-blockers]').length).toBe(0))
    rendered.unmount()
  })
})

describe('"Fechar chegada" com nota marcada', () => {
  test('o botão trava e o motivo, neutro, lista cada nota marcada como atalho para a linha', async () => {
    const { rendered } = await mountOffice(seeded())

    const blockers = document.querySelector('[data-close-blockers]') as HTMLElement
    expect((closeButton() as HTMLButtonElement).disabled).toBe(true)
    expect(blockers.textContent).toContain('A chegada só fecha quando as notas a devolver')
    expect([...blockers.querySelectorAll('button')].map((button) => button.textContent?.trim())).toEqual([
      'NF 1001',
    ])
    expect(blockers.getAttribute('role')).not.toBe('alert')
    rendered.unmount()
  })

  test('a devolvida e a sem marca não seguram o fechamento', async () => {
    const { rendered } = await mountOffice({
      occurrence: {
        occurrences: [OCCURRENCE_B],
        returns: new Map([[DOC_1003, { occurrenceId: 'occ-b', state: 'returned' }]]),
      },
    })

    expect(document.querySelectorAll('[data-close-blockers]').length).toBe(0)
    expect((closeButton() as HTMLButtonElement).disabled).toBe(false)
    rendered.unmount()
  })
})

describe('a tabela vira cartões abaixo de 40 rem (web.md §10)', () => {
  test('a coluna da devolução leva o rótulo, como as outras', async () => {
    const { rendered } = await mountOffice(seeded())

    const table = document.querySelector('table') as HTMLTableElement
    const { headers, unlabeled, wrong } = readCardLabels(table)

    expect(headers).toContain('Avaria e devolução')
    expect(unlabeled).toEqual([])
    expect(wrong).toEqual([])
    rendered.unmount()
  })
})
