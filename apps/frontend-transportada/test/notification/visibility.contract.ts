/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isNotificationVisible,
  toNotificationDay,
} from '../../src/modules/notification/shared/notificationVisibility.service'

// 25/11/2026 23:30 em Brasília (UTC-3) já é 26/11 02:30 em UTC.
const NOW = new Date('2026-11-26T02:30:00Z')

describe('notificações lidas só do dia', () => {
  test('não lida sempre aparece', () => {
    expect(isNotificationVisible({}, NOW)).toBe(true)
    expect(isNotificationVisible({ readAt: null }, NOW)).toBe(true)
  })

  test('lida hoje aparece, lida ontem some', () => {
    expect(isNotificationVisible({ readAt: '2026-11-25T14:00:00Z' }, NOW)).toBe(true)
    expect(isNotificationVisible({ readAt: '2026-11-25T02:59:00Z' }, NOW)).toBe(false)
    expect(isNotificationVisible({ readAt: '2026-11-24T20:00:00Z' }, NOW)).toBe(false)
  })

  test('o dia é o de Brasília, não o UTC', () => {
    expect(toNotificationDay('2026-11-26T02:30:00Z')).toBe('2026-11-25')
    expect(isNotificationVisible({ readAt: '2026-11-26T01:00:00Z' }, NOW)).toBe(true)
    expect(isNotificationVisible({ readAt: '2026-11-26T03:00:00Z' }, NOW)).toBe(false)
  })

  test('data ilegível esconde', () => {
    expect(isNotificationVisible({ readAt: 'lixo' }, NOW)).toBe(false)
  })

  test('o sino usa a lista filtrada e "Ver todas" segue como histórico', async () => {
    const root = new URL('../../src/modules/notification/', import.meta.url)
    const [menu, page] = await Promise.all([
      Bun.file(new URL('components/NotificationBellMenu.component.tsx', root)).text(),
      Bun.file(new URL('pages/NotificationWorkspace.page.tsx', root)).text(),
    ])
    expect(menu).toContain('<NotificationInboxList')
    expect(page).not.toContain('NotificationInboxList')
  })
})
