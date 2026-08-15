/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  NOTIFICATION_SETTINGS_CATEGORY_IDS,
  NOTIFICATION_SETTINGS_CHANNEL_IDS,
  buildNotificationSettingsOptions,
} from '../../src/modules/notification/shared/notificationCatalog.constant.js'

import ptBr from '../../src/modules/notification/locales/notification.locale.json'
import en from '../../src/modules/notification/locales/notification.en.locale.json'

const API_CATALOG_PATH = new URL(
  '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
  import.meta.url,
)

async function readApiCatalog(): Promise<string> {
  return await Bun.file(API_CATALOG_PATH).text()
}

describe('contrato do catálogo da tela de preferências', () => {
  /**
   * A tela oferece o que o produto entrega. Um canal a mais aqui promete entrega que não sai; um
   * assunto a menos esconde o desligamento de um aviso que existe.
   */
  test('os canais são exatamente os que a API declara como do produto', async () => {
    const source = await readApiCatalog()
    const declared = source.split('NOTIFICATION_PRODUCT_CHANNELS = [')[1]?.split(']')[0] ?? ''

    for (const channel of NOTIFICATION_SETTINGS_CHANNEL_IDS) {
      expect(declared.toLowerCase()).toContain(channel)
    }
    expect([...NOTIFICATION_SETTINGS_CHANNEL_IDS].toSorted()).toEqual(['email', 'inbox'])
  })

  test('as categorias disparadas pelo produto aparecem todas na tela', async () => {
    const source = await readApiCatalog()
    const triggered = [...source.matchAll(/category: NOTIFICATION_CATEGORY\.([A-Z_]+)/g)].map(
      (match) => match[1],
    )

    expect(triggered.length).toBeGreaterThan(0)
    for (const constantName of triggered) {
      const categoryId = source.split(`${constantName}: '`)[1]?.split("'")[0]

      expect([...NOTIFICATION_SETTINGS_CATEGORY_IDS] as readonly string[]).toContain(
        categoryId ?? '',
      )
    }
  })

  test('todo canal e toda categoria têm rótulo traduzido nos dois idiomas', () => {
    for (const id of [
      ...NOTIFICATION_SETTINGS_CHANNEL_IDS,
      ...NOTIFICATION_SETTINGS_CATEGORY_IDS,
    ]) {
      const key = id.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
      expect(ptBr.settings).toHaveProperty(key)
      expect(en.settings).toHaveProperty(key)
    }
  })

  test('as opções chegam ao componente com rótulo e dica resolvidos', () => {
    const options = buildNotificationSettingsOptions((key) => `traduzido:${key}`)

    expect(options.channels).toHaveLength(NOTIFICATION_SETTINGS_CHANNEL_IDS.length)
    expect(options.categories).toHaveLength(NOTIFICATION_SETTINGS_CATEGORY_IDS.length)
    for (const option of [...options.channels, ...options.categories]) {
      expect(option.label.startsWith('traduzido:')).toBe(true)
      expect(option.id).not.toBe('')
    }
  })
})
