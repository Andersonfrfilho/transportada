/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Cada participante (contratante, motorista, operador) tem ícone e cor próprios que não se repetem; cada canal tem
 * ícone próprio; cor nunca vem sozinha. E o modo de exibição (lado a lado × abas) é lógica pura, lembrada só em
 * `localStorage`, sem nunca lançar.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  CHANNEL_ICONS,
  CONVERSATION_PARTICIPANTS,
  PARTICIPANT_APPEARANCE,
} from '@/modules/occurrence-conversation/shared/conversationParticipant.constant'
import { OCCURRENCE_CONVERSATION_CHANNELS } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'
import {
  conversationLayoutStorageKey,
  readConversationLayout,
  resolveConversationLayout,
  writeConversationLayout,
} from '@/modules/occurrence-conversation/shared/occurrenceConversationLayout.service'

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../src/${path}`, import.meta.url), 'utf8')
}

describe('participante: ícone e cor próprios', () => {
  test('todo participante tem ícone e tom, e nenhum se repete', () => {
    const icons = CONVERSATION_PARTICIPANTS.map((item) => PARTICIPANT_APPEARANCE[item].icon)
    const tones = CONVERSATION_PARTICIPANTS.map((item) => PARTICIPANT_APPEARANCE[item].tone)
    expect(new Set(icons).size).toBe(CONVERSATION_PARTICIPANTS.length)
    expect(new Set(tones).size).toBe(CONVERSATION_PARTICIPANTS.length)
    expect([...CONVERSATION_PARTICIPANTS]).toEqual(['contractor', 'driver', 'client', 'operator'])
  })

  test('os ícones existem no catálogo e o CSS tem uma classe de tom por participante, só com tokens', async () => {
    const catalog = await source('components/ui/icon.tsx')
    for (const participant of CONVERSATION_PARTICIPANTS) {
      expect(catalog).toContain(`'${PARTICIPANT_APPEARANCE[participant].icon}'`)
    }
    const css = await source('modules/occurrence-conversation/styles/occurrenceThread.module.css')
    for (const tone of ['toneContractor', 'toneDriver', 'toneClient', 'toneOperator']) {
      expect(css).toContain(`.${tone} {`)
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u)
  })

  test('o crachá junta cor + ícone + nome, e o avatar do balão usa o ícone do participante', async () => {
    const badge = await source(
      'modules/occurrence-conversation/components/ParticipantBadge.component.tsx',
    )
    expect(badge).toContain('<Icon name={PARTICIPANT_APPEARANCE[participant].icon}')
    expect(badge).toContain('t(`participant.${participant}`)')
    const thread = await source(
      'modules/occurrence-conversation/components/OccurrenceThread.component.tsx',
    )
    expect(thread).toContain('renderAuthorAvatar=')
  })
})

describe('canal: ícone próprio, palavra e dica', () => {
  test('todo canal do modelo tem ícone do catálogo, e nenhum se repete', async () => {
    const catalog = await source('components/ui/icon.tsx')
    for (const channel of OCCURRENCE_CONVERSATION_CHANNELS) {
      expect(CHANNEL_ICONS[channel]).toBeString()
      expect(catalog).toContain(`'${CHANNEL_ICONS[channel]}'`)
    }
    expect(new Set(Object.values(CHANNEL_ICONS)).size).toBe(OCCURRENCE_CONVERSATION_CHANNELS.length)
  })

  test('a legenda mostra ícone + palavra + dica de cada canal e de cada participante, e se recolhe', async () => {
    const legend = await source(
      'modules/occurrence-conversation/components/OccurrenceConversationLegend.component.tsx',
    )
    expect(legend).toContain('OCCURRENCE_CONVERSATION_CHANNELS.map')
    expect(legend).toContain('CONVERSATION_PARTICIPANTS.map')
    expect(legend).toContain('<Tooltip')
    expect(legend).toContain('aria-expanded={isOpen}')
  })

  test('os dois locales têm rótulo, dica e "via" para todo canal e participante', async () => {
    for (const file of [
      'occurrenceConversation.locale.json',
      'occurrenceConversation.en.locale.json',
    ]) {
      const locale = JSON.parse(
        await source(`modules/occurrence-conversation/locales/${file}`),
      ) as {
        channel: Record<string, string>
        legend: { channelHint: Record<string, string> }
        participant: Record<string, string>
        thread: Record<string, unknown>
      }
      for (const channel of OCCURRENCE_CONVERSATION_CHANNELS) {
        expect(locale.channel[channel]).toBeString()
        expect(locale.legend.channelHint[channel]).toBeString()
      }
      for (const participant of CONVERSATION_PARTICIPANTS) {
        expect(locale.participant[participant]).toBeString()
      }
      expect(locale.thread.via).toContain('{{channel}}')
    }
  })
})

describe('modo de exibição das conversas', () => {
  test('sem escolha: lado a lado em tela larga, abas abaixo; a escolha explícita vence', () => {
    expect(resolveConversationLayout({ isWide: true, stored: null })).toBe('side-by-side')
    expect(resolveConversationLayout({ isWide: false, stored: null })).toBe('tabs')
    expect(resolveConversationLayout({ isWide: true, stored: 'tabs' })).toBe('tabs')
    expect(resolveConversationLayout({ isWide: false, stored: 'side-by-side' })).toBe(
      'side-by-side',
    )
  })

  test('a preferência é lida e gravada por empresa, e valor inválido ou storage que lança viram "sem escolha"', () => {
    const map = new Map<string, string>()
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    }
    const key = conversationLayoutStorageKey('company-1')
    expect(key).not.toBe(conversationLayoutStorageKey('company-2'))
    expect(readConversationLayout(storage, key)).toBeNull()
    writeConversationLayout(storage, key, 'tabs')
    expect(readConversationLayout(storage, key)).toBe('tabs')
    map.set(key, 'lixo')
    expect(readConversationLayout(storage, key)).toBeNull()
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readConversationLayout(throwing, key)).toBeNull()
    expect(() => writeConversationLayout(throwing, key, 'tabs')).not.toThrow()
    expect(readConversationLayout(null, key)).toBeNull()
  })

  test('o seletor está sempre à vista e o lado a lado empilha abaixo de 64 rem', async () => {
    const screen = await source(
      'modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
    )
    expect(screen).toContain('<ConversationLayoutSwitch')
    expect(screen).toContain("useMinWidth('64rem')")
    expect(screen).toContain('<ConversationColumn')
    // minimizar é por conversa: um estado por participante, o corpo continua montado
    expect(screen).toContain("onToggleCollapsed={() => toggleCollapsed('contractor')}")
    expect(screen).toContain("onToggleCollapsed={() => toggleCollapsed('driver')}")
    const columnSource = await source(
      'modules/occurrence-conversation/components/ConversationLayoutSwitch.component.tsx',
    )
    expect(columnSource).toContain('aria-expanded={!collapsed}')
    expect(columnSource).toContain('hidden={collapsed}')
    const css = await source('modules/occurrence-conversation/styles/occurrenceThread.module.css')
    expect(css).toContain('@media (min-width: 64rem)')
    expect(css).not.toMatch(/max-width\s*:\s*\d+(rem|px)\s*\)/u)
  })
})
