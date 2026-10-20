/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('sino de notificações', () => {
  test('o clique abre o painel e a navegação fica em "Ver todas"', async () => {
    const [main, menu] = await Promise.all([
      readApplicationFile('src/main.tsx'),
      readApplicationFile('src/modules/notification/components/NotificationBellMenu.component.tsx'),
    ])

    expect(main).toContain('<NotificationBellMenu')
    expect(main).not.toContain('<NotificationBell\n')
    expect(menu).toContain('onClick={() => setIsOpen(!isOpen)}')
    expect(menu).toContain('onViewAll()')
    expect(menu).toContain('onSelect={selectNotification}')
    expect(menu).toContain('openNotificationTarget(notification)')
  })

  test('os dois idiomas têm os textos do painel', async () => {
    for (const file of ['notification.locale.json', 'notification.en.locale.json']) {
      const locale = JSON.parse(
        await readApplicationFile(`src/modules/notification/locales/${file}`),
      ) as { popover?: { title?: string; viewAll?: string } }
      expect(locale.popover?.title).toBeTruthy()
      expect(locale.popover?.viewAll).toBeTruthy()
    }
  })
})
