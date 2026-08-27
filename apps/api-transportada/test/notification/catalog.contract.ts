/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  NOTIFICATION_CHANNEL,
  extractTemplatePlaceholders,
} from '@adatechnology/notification-contracts'

import { buildNotificationTemplateSeeds } from '../../src/notification/application/notification-template-seed.service.js'
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_PRODUCT_CHANNELS,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../src/notification/domain/notification-catalog.constant.js'
import { NOTIFICATION_DEFAULT_LOCALE } from '../../src/notification/notification.constant.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'

/**
 * O catálogo é o vocabulário que o produto fala com o módulo: categoria, canal e chave de template
 * viajam como string livre pela API do pacote, e string livre erra em silêncio — o disparo grava a
 * notificação e a renderização não acha template nenhum. Quem trava isso é este contrato.
 */
describe('contrato do catálogo de notificações', () => {
  test('as categorias são as cinco do produto e nada além', () => {
    expect(Object.values(NOTIFICATION_CATEGORY).toSorted()).toEqual([
      'billing',
      'cte-batch',
      'identity',
      'mdfe',
      'nfse',
    ])
  })

  test('o produto entrega por caixa e por e-mail, e os dois são canais do módulo', () => {
    expect([...NOTIFICATION_PRODUCT_CHANNELS]).toEqual([
      NOTIFICATION_CHANNEL.INBOX,
      NOTIFICATION_CHANNEL.EMAIL,
    ])
    for (const channel of NOTIFICATION_PRODUCT_CHANNELS) {
      expect(Object.values(NOTIFICATION_CHANNEL)).toContain(channel)
    }
  })

  test('toda entrada declara categoria conhecida e chave prefixada por ela', () => {
    const categories = Object.values(NOTIFICATION_CATEGORY)
    const keys = Object.values(NOTIFICATION_TEMPLATE_KEY)

    expect(NOTIFICATION_CATALOG.length).toBe(keys.length)
    for (const entry of NOTIFICATION_CATALOG) {
      expect(categories).toContain(entry.category)
      expect(keys).toContain(entry.templateKey)
      expect(entry.templateKey.startsWith(`${entry.category}.`)).toBe(true)
    }
  })

  test('cada entrada tem texto para todo canal que declara, com assunto no e-mail', () => {
    for (const entry of NOTIFICATION_CATALOG) {
      expect(entry.channels.length).toBeGreaterThan(0)
      for (const channel of entry.channels) {
        expect(NOTIFICATION_PRODUCT_CHANNELS).toContain(channel)
        const template = entry.templates[channel]
        expect(template).toBeDefined()
        expect(template?.body.trim().length).toBeGreaterThan(0)
        if (channel === NOTIFICATION_CHANNEL.EMAIL) {
          expect(template?.subject?.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  /**
   * Marcador não declarado renderiza string vazia: o e-mail sai com "o lote  falhou" e ninguém vê
   * erro. A checagem é nos dois sentidos porque sobra e falta quebram do mesmo jeito.
   */
  test('os marcadores usados no texto são exatamente os declarados na entrada', () => {
    for (const entry of NOTIFICATION_CATALOG) {
      for (const channel of entry.channels) {
        const template = entry.templates[channel]
        const used = extractTemplatePlaceholders(
          `${template?.subject ?? ''}\n${template?.body ?? ''}`,
        )
        expect(used.toSorted()).toEqual([...entry.placeholders].toSorted())
      }
    }
  })

  test('a semente produz um upsert por canal, ativo e no idioma do produto', () => {
    const seeds = buildNotificationTemplateSeeds({ companyId: COMPANY_ID })
    const expectedCount = NOTIFICATION_CATALOG.reduce(
      (total, entry) => total + entry.channels.length,
      0,
    )

    expect(seeds).toHaveLength(expectedCount)
    for (const seed of seeds) {
      expect(seed.companyId).toBe(COMPANY_ID)
      expect(seed.active).toBe(true)
      expect(seed.locale).toBe(NOTIFICATION_DEFAULT_LOCALE)
    }

    const identities = seeds.map((seed) => `${seed.key}:${seed.channel}`)
    expect(new Set(identities).size).toBe(identities.length)
  })
})
