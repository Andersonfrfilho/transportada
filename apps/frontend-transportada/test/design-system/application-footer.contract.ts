/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FOOTER_COMPONENT = 'ApplicationFooter'
/** As três raízes de render: o shell autenticado e as duas telas que abrem sem sessão. */
const ROOTED_SCREENS = [
  'src/main.tsx',
  'src/modules/identity/pages/FirstAccess.page.tsx',
  'src/modules/identity/pages/PasswordReset.page.tsx',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
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
})
