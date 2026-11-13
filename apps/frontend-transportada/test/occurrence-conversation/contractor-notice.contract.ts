/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 324 (T4): o botão "Avisar a contratante". Lê o estado e o desfecho da API (T1/T3), nunca manda corpo, e o
 * painel só mostra o botão a quem escreve à contratante.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  createContractorNoticeClient,
  readContractorNoticeOutcome,
  readContractorNoticeState,
} from '@/modules/occurrence-conversation/shared/contractorNotice.service'

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')
}

describe('estado do aviso à contratante (spec 324 T4)', () => {
  test('disponível por e-mail traz o canal, quem recebe e o texto', () => {
    expect(
      readContractorNoticeState({
        data: {
          channel: 'email',
          preview: { bodyText: 'Corpo', subject: 'Assunto' },
          recipientCount: 2,
          status: 'available',
        },
      }),
    ).toEqual({
      channel: 'email',
      preview: { bodyText: 'Corpo', subject: 'Assunto' },
      recipientCount: 2,
      status: 'available',
    })
  })

  test('grupo sem prévia continua disponível', () => {
    expect(
      readContractorNoticeState({ data: { channel: 'whatsapp_group', status: 'available' } }),
    ).toEqual({
      channel: 'whatsapp_group',
      preview: null,
      recipientCount: null,
      status: 'available',
    })
  })

  test('já avisada guarda quem, quando e o canal', () => {
    expect(
      readContractorNoticeState({
        data: {
          actorName: 'Ana',
          at: '2026-11-13T10:00:00Z',
          by: 'manual',
          channel: 'email',
          status: 'notified',
        },
      }),
    ).toEqual({
      actorName: 'Ana',
      at: '2026-11-13T10:00:00Z',
      by: 'manual',
      channel: 'email',
      status: 'notified',
    })
  })

  test('indisponível guarda o motivo; forma desconhecida é recusada', () => {
    expect(
      readContractorNoticeState({ data: { reason: 'no_recipient', status: 'unavailable' } }),
    ).toEqual({ reason: 'no_recipient', status: 'unavailable' })
    expect(() => readContractorNoticeState({ data: { status: 'x' } })).toThrow()
    expect(() => readContractorNoticeState({})).toThrow()
  })
})

describe('desfecho do envio (spec 324 T4)', () => {
  test('e-mail, grupo e a reserva por e-mail contam como enviado', () => {
    expect(readContractorNoticeOutcome({ data: { outcome: 'sent' } })).toEqual({
      channel: 'email',
      kind: 'sent',
    })
    expect(readContractorNoticeOutcome({ data: { outcome: 'sent_to_group' } })).toEqual({
      channel: 'whatsapp_group',
      kind: 'sent',
    })
    expect(
      readContractorNoticeOutcome({
        data: { fallback: { outcome: 'sent' }, outcome: 'group_failed' },
      }),
    ).toEqual({ channel: 'email', kind: 'sent' })
  })

  test('grupo que falhou sem reserva é falha; "skipped" leva o motivo', () => {
    expect(
      readContractorNoticeOutcome({ data: { fallback: null, outcome: 'group_failed' } }),
    ).toEqual({ kind: 'failed' })
    expect(
      readContractorNoticeOutcome({ data: { outcome: 'skipped', reason: 'no_recipient' } }),
    ).toEqual({ kind: 'skipped', reason: 'no_recipient' })
    expect(
      readContractorNoticeOutcome({ data: { outcome: 'skipped', reason: 'type_off' } }),
    ).toEqual({ kind: 'skipped', reason: 'other' })
  })
})

describe('cliente do aviso (spec 324 T4)', () => {
  test('o envio é POST sem corpo no caminho da ocorrência', async () => {
    const requests: Request[] = []
    const client = createContractorNoticeClient({
      apiUrl: 'http://api.test',
      fetch: (request) => {
        requests.push(request)
        return Promise.resolve(
          new Response(JSON.stringify({ data: { outcome: 'sent' } }), { status: 200 }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.sendContractorNotice({ occurrenceId: 'occ-1' })

    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe('http://api.test/trip-occurrences/occ-1/contractor-notice')
    expect(await requests[0]?.text()).toBe('')
  })

  test('o botão só aparece a quem tem occurrences.resolve', async () => {
    const component = await source(
      'modules/occurrence-conversation/components/ContractorNoticeSection.component.tsx',
    )
    expect(component).toContain("permissions.includes('occurrences.resolve')")
    const panel = await source(
      'modules/occurrence-conversation/components/OccurrenceDetailsPanel.component.tsx',
    )
    expect(panel).toContain('<ContractorNoticeSection')
  })
})
