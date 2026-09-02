/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const PAGES = ['NotificationWorkspace', 'NotificationSettings'] as const

async function readSource(path: string): Promise<string> {
  return await Bun.file(new URL(path, import.meta.url)).text()
}

async function readPage(name: string): Promise<string> {
  return await readSource(`../../src/modules/notification/pages/${name}.page.tsx`)
}

async function readThemeStyles(): Promise<string> {
  return await readSource('../../src/modules/notification/styles/notification.module.css')
}

describe('contrato do tema das telas do pacote de notificação', () => {
  /**
   * ⚠️ O que quebra em silêncio: `NotificationsWorkspace` e `NotificationSettingsWorkspace` montam
   * `className={\`adn-settings ${className}\`}` e **não** aplicam o `theme.rootClassName` do
   * provider — só o sino, a lista e o painel de preferências o fazem. Sem a classe no `className`,
   * as duas telas compostas ficam com a paleta de fábrica do pacote enquanto o resto do produto
   * segue a nossa, e nada falha: só fica ilegível.
   */
  test('as duas telas compostas recebem a classe de tema pelo `className`', async () => {
    for (const name of PAGES) {
      const source = await readPage(name)

      expect(source, `${name} não passa a classe de tema`).toContain(
        'className={NOTIFICATION_THEME_CLASS}',
      )
    }
  })

  /**
   * ⚠️ Sem `senderName` o pacote assina a prévia com a **primeira letra do título** — a fatura vinha
   * como "F", e quem escreve o texto via um remetente que não existe. E a variável do remetente só
   * chega ao bundle se o `Dockerfile` a declarar: `VITE_*` é inlinada no build.
   */
  test('a prévia assina com a marca da instalação, e o remetente vem da configuração', async () => {
    const page = await readPage('NotificationSettings')
    const dockerfile = await readSource('../../Dockerfile')

    expect(page).toContain('senderName={senderName}')
    expect(page).toContain('useInstallationBrand')
    expect(page).toContain("'preview.senderAddress'")
    expect(dockerfile).toContain('ARG VITE_EMAIL_FROM')
  })

  /**
   * O pacote publica o modo escuro sob um ancestral `.dark`, e o aplica em `.dark .adn-*` — duas
   * classes de especificidade, acima de qualquer tradução nossa. A aplicação tem tema escuro único,
   * então a classe é estática no documento; tirá-la devolve as telas do pacote ao modo claro.
   */
  test('o documento declara o escopo escuro que o pacote publica', async () => {
    const document = await readSource('../../index.html')

    expect(document).toContain('<html lang="pt-BR" class="dark">')
  })

  /**
   * A prévia imita a caixa de entrada do destinatário: fundo branco. Sem devolver a tinta do
   * cliente ali dentro, o texto claro do nosso tema vaza para o papel branco — foi medido em
   * 1,13:1 no assunto do e-mail, que é justamente o que a prévia existe para mostrar.
   */
  test('a moldura de prévia volta à tinta do cliente de e-mail', async () => {
    const styles = await readThemeStyles()

    expect(styles).toContain(':global(.adn-preview-mail)')
    expect(styles).toContain('--adn-color-text: var(--adn-preview-mail-text)')
  })
})
