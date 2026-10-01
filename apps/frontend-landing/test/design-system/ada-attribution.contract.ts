/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PANEL_ROOT = new URL('../../../frontend-transportada/', import.meta.url)
const ADA_WEBSITE_URL = 'https://adatechnology.com.br'
const ADA_MARK_SOURCE = '/icons/ada-technology.png'
const FOOTER_COMPONENT = 'src/modules/foundation/components/Footer.component.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('ada technology attribution', () => {
  /**
   * A landing é a única página pública do produto, e o cadastro do aplicativo da Meta é revisado
   * por quem abre o site e procura quem o fornece. Sem a atribuição no rodapé a revisão reprova o
   * nome de exibição, e nada no código denuncia a falta.
   */
  test('the footer names the provider and links to it', async () => {
    const footer = await readApplicationFile(FOOTER_COMPONENT)

    expect(footer).toContain('Ada Technology')
    expect(footer).toContain('uma solução')
    expect(footer).toContain(ADA_WEBSITE_URL)
  })

  /** Sem `rel="noreferrer"` a aba aberta herda `window.opener` e o caminho de volta para a sessão. */
  test('the outbound link does not hand over the opener', async () => {
    const footer = await readApplicationFile(FOOTER_COMPONENT)
    const anchor = footer.slice(footer.indexOf(`href={ADA_WEBSITE_URL}`))

    expect(anchor).toContain('rel="noreferrer"')
  })

  test('the brand of the carrier still signs the copyright line', async () => {
    const footer = await readApplicationFile(FOOTER_COMPONENT)

    expect(footer).toContain('{brandName}. Todos os direitos reservados.')
    // O ano sai do relógio: rodapé com ano fixo envelhece sem ninguém notar
    expect(footer).toContain('getUTCFullYear()')
  })

  /** Duas apps assinando com desenhos diferentes é o produto se apresentando como dois produtos. */
  test('the mark is the same bytes the panel footer signs with', async () => {
    const [landing, panel] = await Promise.all([
      Bun.file(new URL(`public${ADA_MARK_SOURCE}`, APPLICATION_ROOT)).arrayBuffer(),
      Bun.file(new URL(`public${ADA_MARK_SOURCE}`, PANEL_ROOT)).arrayBuffer(),
    ])

    expect(landing.byteLength).toBeGreaterThan(0)
    expect(Buffer.from(landing).equals(Buffer.from(panel))).toBe(true)
  })
})
