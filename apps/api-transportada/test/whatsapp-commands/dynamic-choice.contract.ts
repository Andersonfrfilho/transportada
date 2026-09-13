/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T020 (B3) — a lista dinâmica é relida a cada passo, e a página fica no `context`. Entre
 * dois toques, alguém despachando pelo painel encolhe ou zera a lista; nenhum dos dois pode deixar a
 * conversa muda.
 */
import { describe, expect, test } from 'bun:test'
import type { ChannelAdapterInterface } from '@adatechnology/meta-whatsapp-contracts'

import { sendDynamicChoice } from '../../src/whatsapp-commands/application/whatsapp-dynamic-choice.service.js'
import { WHATSAPP_MENU_NOTHING_TO_SHOW } from '../../src/whatsapp-commands/domain/whatsapp-menu.constant.js'

const TO = '5516999990000'

function recordingChannel() {
  const lists: { readonly rows: readonly { readonly id: string }[] }[] = []
  const texts: string[] = []
  const channel = {
    async sendInteractiveList(input: { readonly rows: readonly { readonly id: string }[] }) {
      lists.push(input)
    },
    async sendText(_to: string, text: string) {
      texts.push(text)
    },
  } as unknown as ChannelAdapterInterface
  return { channel, lists, texts }
}

const options = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `o${index}`, title: `Opção ${index}` }))

describe('lista dinâmica que muda entre dois toques (spec 144 T020, B3)', () => {
  test('encolheu: a página gravada além do fim mostra a última, sem lançar', async () => {
    const recording = recordingChannel()

    const shown = await sendDynamicChoice({
      body: 'Toque na nota.',
      channel: recording.channel,
      options: options(12),
      page: 4,
      to: TO,
    })

    expect(shown).toBe(true)
    expect(recording.lists[0]?.rows.map((row) => row.id)).toEqual([
      '__back__:1',
      'o9',
      'o10',
      'o11',
    ])
  })

  test('zerou: sai o texto de "nada a mostrar", nenhuma lista, e quem chamou volta um menu', async () => {
    const recording = recordingChannel()

    const shown = await sendDynamicChoice({
      body: 'Toque na nota.',
      channel: recording.channel,
      options: [],
      page: 2,
      to: TO,
    })

    expect(shown).toBe(false)
    expect(recording.lists).toEqual([])
    expect(recording.texts).toEqual([WHATSAPP_MENU_NOTHING_TO_SHOW])
  })
})
