/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T6c (RF13): "Ver detalhes" na conversa da ocorrência do app do motorista. O botão só existe na conversa
 * de ocorrência (o assunto de nota e de viagem não ganha), o e-mail do cliente chega só mascarado, e as duas línguas
 * têm as mesmas chaves.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  parseDriverClientEmailDeliveries,
  parseDriverClientEmails,
} from '@/modules/conversation/shared/driverClientEmails.service'

const MODULE = resolve(import.meta.dir, '../../src/modules/conversation')

function read(path: string): string {
  return readFileSync(resolve(MODULE, path), 'utf8')
}

function keysOf(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('e-mails do cliente na folha de detalhes (spec 279 RF2)', () => {
  test('lê só a lista mascarada e ignora o item malformado', () => {
    const emails = parseDriverClientEmails({
      data: {
        clientEmailType: 'boleto',
        clientEmails: [
          { addressMasked: 'f***@m***.com', emailId: 'e1', label: 'Financeiro' },
          { addressMasked: 'x***@y***.com', emailId: 2, label: '' },
        ],
        sentCount: 0,
        sentLimit: 5,
      },
    })
    expect(emails).toEqual([{ addressMasked: 'f***@m***.com', emailId: 'e1', label: 'Financeiro' }])
  })

  test('resposta sem a lista vira lista vazia', () => {
    expect(parseDriverClientEmails({})).toEqual([])
    expect(parseDriverClientEmails({ data: {} })).toEqual([])
  })
})

describe('"Ver detalhes" na conversa do motorista (spec 279 RF13)', () => {
  test('o cartão do assunto só desenha o botão na conversa de ocorrência', () => {
    const page = read('pages/DriverConversations.page.tsx')
    expect(page).toContain('renderSubjectCard')
    expect(page).toMatch(
      /conversation\.subjectType === DRIVER_CONVERSATION_SUBJECT_TYPE[\s\S]*<OccurrenceDetailsCard/u,
    )
  })

  test('a folha é leitura: nenhuma chamada de escrita e o espaço do envio (T6b) vazio por padrão', () => {
    const sheet = read('components/OccurrenceDetailsSheet.component.tsx')
    expect(sheet).not.toMatch(/useMutation|postJson|method: 'POST'/u)
    expect(sheet).toContain('sendState?: ReactNode')
    expect(sheet).toContain('sendState === undefined && deliveries.length === 0 ? null')
  })

  test('o estado do envio (T6b) lê Enviado, Na fila, Falhou e o "sem e-mail do cliente"; o malformado some', () => {
    expect(
      parseDriverClientEmailDeliveries({
        data: {
          deliveries: [
            {
              address: 'a@b.example.test',
              id: 'd1',
              sentAt: '2026-10-26T20:01:00.000Z',
              status: 'sent',
            },
            { address: 'c@d.example.test', id: 'd2', sentAt: null, status: 'queued' },
            { address: 'e@f.example.test', id: 'd3', sentAt: null, status: 'failed' },
            { address: null, id: 'd4', sentAt: null, status: 'skipped' },
            { address: 'x@y.example.test', id: 'd5', sentAt: null, status: 'robo' },
            { address: 7, id: 'd6', sentAt: null, status: 'sent' },
            { id: 'd7', status: 'sent' },
          ],
        },
      }).map((delivery) => [delivery.id, delivery.status]),
    ).toEqual([
      ['d1', 'sent'],
      ['d2', 'queued'],
      ['d3', 'failed'],
      ['d4', 'skipped'],
    ])
    expect(parseDriverClientEmailDeliveries({ data: {} })).toEqual([])
  })

  test('a folha não oferece "Tentar de novo": o botão é do escritório', () => {
    const state = read('components/ClientEmailSendState.component.tsx')
    expect(state).not.toMatch(/<button|Button|useMutation/u)
  })

  test('as duas línguas têm as mesmas chaves em `details`', () => {
    const pt = JSON.parse(read('locales/conversation.locale.json')) as { details: unknown }
    const en = JSON.parse(read('locales/conversation.en.locale.json')) as { details: unknown }
    expect(keysOf(en.details)).toEqual(keysOf(pt.details))
  })
})
