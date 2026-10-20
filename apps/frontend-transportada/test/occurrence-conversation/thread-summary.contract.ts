/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * O resumo recolhível no topo de cada conversa da ocorrência e a altura que não cresce com ela: contas sobre as
 * mensagens já carregadas e os avisos (falhas, remetentes, arquivos) numa área com teto e rolagem própria.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import type { OccurrenceConversationMessage } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'
import { summarizeOccurrenceThread } from '@/modules/occurrence-conversation/shared/occurrenceThreadSummary.service'

function message(overrides: Partial<OccurrenceConversationMessage>): OccurrenceConversationMessage {
  return {
    attachments: [],
    author: { kind: 'automatic' },
    bodyText: 'texto',
    channel: 'email',
    createdAt: '2026-10-20T12:00:00.000Z',
    direction: 'outbound',
    id: 'm',
    status: 'sent',
    statusTimes: {},
    ...overrides,
  }
}

const attachment = {
  contentType: 'application/pdf',
  fileName: 'fatura-13.pdf',
  id: 'a1',
  sizeBytes: 57_000,
  url: 'https://example.test/a1',
}

describe('resumo da conversa da ocorrência', () => {
  test('conta enviadas, recebidas, arquivos e falhas, e acha a última pela data', () => {
    const summary = summarizeOccurrenceThread([
      message({ createdAt: '2026-10-20T12:37:00.000Z', id: '1' }),
      message({
        attachments: [attachment],
        bodyText: '  Bom dia\n segue o boleto  ',
        createdAt: '2026-10-20T12:39:00.000Z',
        direction: 'inbound',
        id: '2',
        status: null,
      }),
      message({ createdAt: '2026-10-20T12:38:00.000Z', id: '3', status: 'bounced' }),
    ])
    expect(summary).toEqual({
      attachments: 1,
      failed: 1,
      inbound: 1,
      lastAt: '2026-10-20T12:39:00.000Z',
      lastDirection: 'inbound',
      lastPreview: 'Bom dia segue o boleto',
      outbound: 2,
      total: 3,
    })
  })

  test('mensagem só com arquivo mostra o nome do arquivo; texto longo é cortado', () => {
    expect(
      summarizeOccurrenceThread([message({ attachments: [attachment], bodyText: '' })]).lastPreview,
    ).toBe('fatura-13.pdf')
    const long = summarizeOccurrenceThread([message({ bodyText: 'a'.repeat(300) })]).lastPreview
    expect(long.length).toBe(120)
    expect(long.endsWith('…')).toBe(true)
  })

  test('conversa vazia não tem última mensagem', () => {
    expect(summarizeOccurrenceThread([])).toMatchObject({ lastAt: null, total: 0 })
  })

  test('os avisos ficam numa área com teto e rolagem, e o fio mantém a altura fixa', () => {
    const css = readFileSync(
      new URL(
        '../../src/modules/occurrence-conversation/styles/occurrenceThread.module.css',
        import.meta.url,
      ),
      'utf8',
    )
    expect(css).toMatch(/\.noticesArea \{[^}]*max-height:[^}]*overflow-y: auto/)
    expect(css).toMatch(/\.frame \{[^}]*height: min\(40rem, 78dvh\)/)
    const panels = readFileSync(
      new URL(
        '../../src/modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(panels.match(/<OccurrenceThreadSummary/g)?.length).toBe(2)
    expect(panels.match(/className=\{threadStyles\.noticesArea\}/g)?.length).toBe(2)
  })
})
