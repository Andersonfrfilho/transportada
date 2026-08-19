/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { NOTIFICATION_SETTINGS_HREF } from '../../src/modules/notification/shared/notificationCatalog.constant.js'

const PAGES = ['NotificationWorkspace', 'NotificationSettings'] as const

async function readPage(name: string): Promise<string> {
  return await Bun.file(
    new URL(`../../src/modules/notification/pages/${name}.page.tsx`, import.meta.url),
  ).text()
}

describe('contrato do cabeçalho das telas de notificação', () => {
  /**
   * O workspace do pacote desenha um `<h1>` porque ele é a tela. A página desenhava outro, com o
   * mesmo texto, e a tela abria com dois títulos idênticos — para leitor de tela, duas primeiras
   * manchetes é o mesmo que nenhuma. O cabeçalho do produto entra por `renderHeader`, que substitui
   * o padrão em vez de somar a ele.
   */
  test('cada página entrega o próprio cabeçalho ao workspace', async () => {
    for (const name of PAGES) {
      const source = await readPage(name)

      expect(source, `${name} não passa renderHeader`).toContain('renderHeader={')
      expect(source, `${name} perdeu o título do produto`).toContain('<h1')
    }
  })

  /**
   * Substituir o cabeçalho apaga junto o que morava nele: o link de configuração que o pacote
   * desenha a partir de `settingsHref`. Passar a prop e o slot ao mesmo tempo é prometer um link
   * que nunca aparece — quem substitui o cabeçalho leva o link junto.
   */
  test('a inbox leva o link de preferências dentro do cabeçalho que ela mesma desenha', async () => {
    const source = await readPage('NotificationWorkspace')

    expect(source).not.toContain('settingsHref=')
    expect(source).toContain('NOTIFICATION_SETTINGS_HREF')
    expect(NOTIFICATION_SETTINGS_HREF.startsWith('/notificacoes')).toBe(true)
  })
})
