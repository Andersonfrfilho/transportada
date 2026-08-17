/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const FOOTER_COMPONENT = 'ApplicationFooter'
const ADA_WEBSITE_URL = 'https://adatechnology.com.br'
const THEME_MESSAGES = ['messages_pt_BR.properties', 'messages_en.properties'] as const
/** As três raízes de render: o shell autenticado e as duas telas que abrem sem sessão. */
const ROOTED_SCREENS = [
  'src/main.tsx',
  'src/modules/identity/pages/FirstAccess.page.tsx',
  'src/modules/identity/pages/PasswordReset.page.tsx',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readRepositoryFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT)).text()
}

describe('application footer contract', () => {
  test('names the holder and the product once, from a single component', async () => {
    const footer = await readApplicationFile(
      'src/modules/foundation/components/ApplicationFooter.component.tsx',
    )

    expect(footer).toContain('Ada Technology')
    expect(footer).toContain('TransportAdA')
    expect(footer).toContain('<footer')
    // O ano sai do relógio: rodapé com ano fixo envelhece sem ninguém notar
    expect(footer).toContain('getFullYear()')
  })

  // Rodapé que mora numa tela só é rodapé que falta nas outras
  test('closes every screen that mounts a root', async () => {
    const screens = await Promise.all(ROOTED_SCREENS.map(readApplicationFile))

    for (const screen of screens) {
      expect(screen).toContain(`<${FOOTER_COMPONENT} />`)
      expect(screen).toContain(`${FOOTER_COMPONENT}.component`)
    }
  })

  test('aligns with the application width and never floats over the page', async () => {
    const stylesheet = await readApplicationFile('src/styles/index.css')
    const start = stylesheet.indexOf('.application-footer {')
    const rule = stylesheet.slice(start, stylesheet.indexOf('}', start))

    expect(start).toBeGreaterThan(-1)
    expect(rule).toContain('width: var(--layout-width)')
    expect(rule).not.toContain('position: fixed')
  })

  /**
   * O nome da Ada Technology no rodapé é a única saída do produto para o site de quem o fez. Sem
   * `rel="noreferrer"` a aba aberta herda `window.opener` e o caminho de volta para a sessão.
   */
  test('turns the holder name into a link to the ada website', async () => {
    const footer = await readApplicationFile(
      'src/modules/foundation/components/ApplicationFooter.component.tsx',
    )

    expect(footer).toContain(ADA_WEBSITE_URL)
    expect(footer).toContain('target="_blank"')
    expect(footer).toContain('rel="noreferrer"')
    // A URL é constante nomeada: literal no meio do JSX é o que faz um dos dois rodapés envelhecer
    expect(footer).toContain(`COPYRIGHT_HOLDER_URL = '${ADA_WEBSITE_URL}'`)
  })

  test('gives the footer link an affordance beyond the inherited colour', async () => {
    const stylesheet = await readApplicationFile('src/styles/index.css')
    const start = stylesheet.indexOf('.application-footer a {')
    const rule = stylesheet.slice(start, stylesheet.indexOf('}', start))

    expect(start).toBeGreaterThan(-1)
    expect(rule).toContain('text-decoration')
    expect(stylesheet).toContain('.application-footer a:hover')
  })

  /**
   * O tema de login não importa código nosso: a URL é cópia por valor, e é este contrato que
   * impede o rodapé da tela de entrada de apontar para outro lugar que o da aplicação.
   */
  test('links the same website from the login theme colophon', async () => {
    const colophon = await readRepositoryFile('deploy/keycloak/theme/login/footer.ftl')
    const dictionaries = await Promise.all(
      THEME_MESSAGES.map((fileName) =>
        readRepositoryFile(`deploy/keycloak/theme/login/messages/${fileName}`),
      ),
    )

    expect(colophon).toContain(ADA_WEBSITE_URL)
    expect(colophon).toContain('target="_blank"')
    expect(colophon).toContain('rel="noreferrer"')
    // O nome do titular sai do dicionário, não do FTL: markup em properties viraria escape na tela
    expect(colophon).toContain('transportadaColophonHolder')
    for (const dictionary of dictionaries) {
      expect(dictionary).toContain('transportadaColophonHolder=Ada Technology')
      expect(dictionary).not.toContain('<a ')
    }
  })
})
