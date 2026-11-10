/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 318 (T8): o canal do aviso de ocorrência na ficha da contratante — resposta validada, cliente HTTP, grupos
 * oferecidos, telefone e o lugar do bloco na ficha (só para `settings.manage`).
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { pickChoosableOccurrenceGroups } from '@/modules/delivery-clients/components/ContractorOccurrenceChannelPanel.component'
import { createContractorOccurrenceChannelClient } from '@/modules/delivery-clients/shared/contractorOccurrenceChannelClient.service'
import {
  isOccurrenceMentionPhoneValid,
  occurrenceChannelFromApi,
  occurrenceChannelGroupsFromApi,
} from '@/modules/delivery-clients/shared/contractorOccurrenceChannel.validation'

const FICHA = 'src/modules/delivery-clients/components/ContractorFicha.component.tsx'
const CHANNEL = {
  channel: 'whatsapp_group',
  emailFallback: true,
  groupJid: '120363000000000000@g.us',
  groupName: 'Grupo de teste',
  mentionPhone: '5511999990000',
  updatedAt: '2026-11-10T12:00:00.000Z',
}

function client(responder: (request: Request) => Response) {
  return createContractorOccurrenceChannelClient({
    apiUrl: 'https://api.test',
    fetch: (input, init) => Promise.resolve(responder(new Request(input, init))),
    getAccessToken: () => Promise.resolve('token'),
  })
}

describe('o canal do aviso de ocorrência (spec 318 T8)', () => {
  test('lê o canal e recusa chave a mais ou a menos', () => {
    expect(occurrenceChannelFromApi({ data: CHANNEL }).groupName).toBe('Grupo de teste')
    expect(() => occurrenceChannelFromApi({ data: { ...CHANNEL, extra: 1 } })).toThrow()
    expect(() => occurrenceChannelFromApi({ data: { ...CHANNEL, updatedAt: undefined } })).toThrow()
    expect(() => occurrenceChannelFromApi({ data: { ...CHANNEL, channel: 'sms' } })).toThrow()
  })

  test('oferece só o grupo livre ou o desta contratante', () => {
    const groups = occurrenceChannelGroupsFromApi({
      data: [
        { groupJid: 'a@g.us', name: 'Livre', owner: null },
        {
          groupJid: 'b@g.us',
          name: 'Do motorista',
          owner: { id: 'd1', kind: 'driver', name: 'X' },
        },
        { groupJid: 'c@g.us', name: 'Desta', owner: { id: 'c1', kind: 'contractor', name: 'Y' } },
        {
          groupJid: 'd@g.us',
          name: 'De outra',
          owner: { id: 'c2', kind: 'contractor', name: 'Z' },
        },
      ],
    })

    expect(pickChoosableOccurrenceGroups(groups, 'c1').map((group) => group.name)).toEqual([
      'Livre',
      'Desta',
    ])
  })

  test('valida o telefone com DDD, com ou sem o 55', () => {
    expect(isOccurrenceMentionPhoneValid('(11) 99999-0000')).toBe(true)
    expect(isOccurrenceMentionPhoneValid('5511999990000')).toBe(true)
    expect(isOccurrenceMentionPhoneValid('1133334444')).toBe(true)
    expect(isOccurrenceMentionPhoneValid('99999')).toBe(false)
    expect(isOccurrenceMentionPhoneValid('')).toBe(false)
  })

  test('o cliente fala com as quatro rotas e leva o código de erro da API', async () => {
    const seen: string[] = []
    const api = client((request) => {
      const { pathname } = new URL(request.url)
      seen.push(`${request.method} ${pathname}`)
      if (pathname.endsWith('/test')) {
        return new Response(JSON.stringify({ data: { sent: true } }), { status: 200 })
      }
      if (pathname.endsWith('whatsapp-groups')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 })
      }
      if (request.method === 'PUT') {
        return new Response(
          JSON.stringify({ error: { code: 'CONTRACTOR_OCCURRENCE_GROUP_TAKEN', details: [] } }),
          { status: 409 },
        )
      }
      return new Response(JSON.stringify({ data: CHANNEL }), { status: 200 })
    })

    await api.get('c1')
    await api.listGroups()
    await api.sendTest('c1')
    const refusal = await api
      .save({ body: { channel: 'email', emailFallback: true }, contractorId: 'c1' })
      .catch((error: unknown) => error)
    expect((refusal as Error).message).toBe('CONTRACTOR_OCCURRENCE_GROUP_TAKEN')
    expect(seen).toEqual([
      'GET /contractors/c1/occurrence-channel',
      'GET /contractor-occurrence-channels/whatsapp-groups',
      'POST /contractors/c1/occurrence-channel/test',
      'PUT /contractors/c1/occurrence-channel',
    ])
  })

  test('a ficha mostra o bloco depois dos responsáveis, só para quem gerencia, e os dois idiomas o descrevem', () => {
    const ficha = readFileSync(FICHA, 'utf8')

    expect(ficha).toMatch(/canManage \? <ContractorOccurrenceChannelPanel/u)
    expect(ficha.indexOf('<ContractorOccurrenceWatchers')).toBeLessThan(
      ficha.indexOf('<ContractorOccurrenceChannelPanel'),
    )
    expect(ficha.indexOf('<ContractorOccurrenceChannelPanel')).toBeLessThan(
      ficha.indexOf('<PreviewEmailPanel'),
    )
    for (const file of [
      'src/modules/delivery-clients/locales/contractorDirectory.locale.json',
      'src/modules/delivery-clients/locales/contractorDirectory.en.locale.json',
    ]) {
      const locale = JSON.parse(readFileSync(file, 'utf8')) as {
        occurrenceChannel?: { errors?: Record<string, string>; title?: string }
      }
      expect(locale.occurrenceChannel?.title).toBeString()
      expect(locale.occurrenceChannel?.errors?.CONTRACTOR_OCCURRENCE_GROUP_TAKEN).toBeString()
    }
  })
})
