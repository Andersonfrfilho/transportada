/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * As ações da mensagem saem do balão e abrem por um menu: copiar o trecho selecionado (só quando há
 * seleção dentro do balão), copiar o texto, encaminhar ao outro chat e baixar cada arquivo. Sem nenhuma
 * ação, o botão do menu não aparece.
 */
import { describe, expect, test } from 'bun:test'

import {
  attachmentDownloadUrls,
  buildMessageMenuItems,
} from '@/modules/occurrence-conversation/shared/messageMenu.service'

const PDF = { filename: 'fatura-13.pdf', id: 'att-1' }

describe('menu de opções da mensagem', () => {
  test('ordem: seleção, texto, encaminhar e um "baixar" por arquivo', () => {
    expect(
      buildMessageMenuItems({
        canForward: true,
        message: { attachments: [PDF], text: 'Segue o boleto' },
        selectedText: 'boleto',
      }),
    ).toEqual([
      { kind: 'copy-selection', text: 'boleto' },
      { kind: 'copy-text', text: 'Segue o boleto' },
      { kind: 'forward' },
      { attachmentId: 'att-1', fileName: 'fatura-13.pdf', kind: 'download' },
    ])
  })

  test('seleção vazia ou igual ao texto inteiro não repete a opção', () => {
    const message = { attachments: [], text: 'Segue o boleto' }
    expect(
      buildMessageMenuItems({ canForward: false, message, selectedText: '  ' }).map((i) => i.kind),
    ).toEqual(['copy-text'])
    expect(
      buildMessageMenuItems({ canForward: false, message, selectedText: ' Segue o boleto ' }).map(
        (i) => i.kind,
      ),
    ).toEqual(['copy-text'])
  })

  test('sem encaminhar possível e sem texto, só baixar; sem nada, menu vazio', () => {
    expect(
      buildMessageMenuItems({
        canForward: false,
        message: { attachments: [PDF], text: null },
        selectedText: '',
      }).map((i) => i.kind),
    ).toEqual(['download'])
    expect(
      buildMessageMenuItems({
        canForward: false,
        message: { attachments: [], text: null },
        selectedText: '',
      }),
    ).toEqual([])
  })

  test('o download usa o endereço que o painel já tem de cada anexo', () => {
    const urls = attachmentDownloadUrls([
      { attachments: [{ id: 'att-1', url: 'https://s3/a.pdf' }] },
      { attachments: [] },
    ])
    expect(urls.get('att-1')).toBe('https://s3/a.pdf')
    expect(urls.size).toBe(1)
  })
})
