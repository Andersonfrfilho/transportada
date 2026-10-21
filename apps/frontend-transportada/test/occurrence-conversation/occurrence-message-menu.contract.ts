/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * O menu da mensagem é do SDK (copiar, selecionar); o painel só acrescenta o que é dele: encaminhar ao outro
 * chat e baixar cada arquivo. Encaminhar várias repete os passos de cada uma, na ordem da conversa.
 */
import { describe, expect, test } from 'bun:test'

import {
  attachmentDownloadUrls,
  buildOccurrenceMenuItems,
  planSelectionForward,
} from '@/modules/occurrence-conversation/shared/occurrenceMessageMenu.service'

const PDF = { filename: 'boleto.pdf', id: 'a1' }
const MESSAGE = { attachments: [PDF], id: 'm1', text: 'Segue o boleto' }
const LABELS = {
  download: (name: string) => `Baixar ${name}`,
  forward: 'Encaminhar ao motorista',
  forwarded: 'Encaminhada',
}

describe('opções do painel no menu da mensagem', () => {
  test('encaminhar e um "baixar" por arquivo com endereço', () => {
    const items = buildOccurrenceMenuItems({
      attachmentUrls: new Map([['a1', 'https://s3/boleto.pdf']]),
      canForward: true,
      from: 'contractor',
      isForwarded: false,
      isPending: false,
      labels: LABELS,
      message: MESSAGE,
      onForward: () => undefined,
    })
    expect(items.map((item) => [item.id, item.label, item.href ?? null])).toEqual([
      ['forward', 'Encaminhar ao motorista', null],
      ['download:a1', 'Baixar boleto.pdf', 'https://s3/boleto.pdf'],
    ])
  })

  test('sem o outro chat, só baixar; já encaminhada, a opção diz isso e trava', () => {
    const base = {
      attachmentUrls: new Map<string, string>(),
      from: 'contractor' as const,
      isPending: false,
      labels: LABELS,
      message: MESSAGE,
      onForward: () => undefined,
    }
    expect(buildOccurrenceMenuItems({ ...base, canForward: false, isForwarded: false })).toEqual([])
    const [forward] = buildOccurrenceMenuItems({ ...base, canForward: true, isForwarded: true })
    expect([forward?.label, forward?.disabled]).toEqual(['Encaminhada', true])
  })

  test('encaminhar várias soma os passos de cada uma', () => {
    const steps = planSelectionForward({
      from: 'contractor',
      messages: [{ attachments: [], id: 'm0', text: 'Bom dia' }, MESSAGE],
    })
    expect(steps.map((step) => step.kind)).toEqual([
      'driver-text',
      'deliver-attachment-to-driver',
      'driver-text',
    ])
  })

  test('o download usa o endereço que o painel já tem de cada anexo', () => {
    const urls = attachmentDownloadUrls([{ attachments: [{ id: 'a1', url: 'https://s3/a.pdf' }] }])
    expect(urls.get('a1')).toBe('https://s3/a.pdf')
  })
})
