/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

/**
 * O site trocava o ícone da aba fora de produção, mas não mostrava a faixa: quem abria a homologação
 * pelo celular, onde a aba nem aparece, não tinha aviso nenhum. A faixa é cópia por valor da do
 * painel — as apps não importam código uma da outra — e este contrato lê a do painel para as duas
 * não divergirem.
 */

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PANEL_BANNER_PATH = new URL(
  '../frontend-transportada/src/modules/foundation/components/EnvironmentBanner.component.tsx',
  APPLICATION_ROOT,
)
const BANNER_PATH = 'src/modules/foundation/components/EnvironmentBanner.component.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readBannerLabel(source: string, environment: 'local' | 'staging'): string {
  const match = new RegExp(`${environment}:\\s*'([^']+)'`).exec(source)
  if (match?.[1] === undefined) {
    throw new Error(`EnvironmentBanner sem rótulo para ${environment}`)
  }
  return match[1]
}

describe('environment banner', () => {
  test('says what the panel banner says, and nothing in production', async () => {
    const [banner, panelBanner] = await Promise.all([
      readApplicationFile(BANNER_PATH),
      Bun.file(PANEL_BANNER_PATH).text(),
    ])

    for (const environment of ['local', 'staging'] as const) {
      expect(readBannerLabel(banner, environment)).toBe(readBannerLabel(panelBanner, environment))
    }
    expect(banner).toContain("if (environment === 'production')")
    expect(banner).toContain('return null')
  })

  test('announces itself to screen readers without hiding the message', async () => {
    const banner = await readApplicationFile(BANNER_PATH)

    expect(banner).toContain('className="environment-banner"')
    expect(banner).toContain('role="status"')
    expect(banner).toContain('<span aria-hidden="true">🚧</span>')
    expect(banner.match(/aria-hidden/g)?.length).toBe(1)
  })

  test('sits on top of every page, above the header', async () => {
    const application = await readApplicationFile('src/App.tsx')
    const bannerIndex = application.indexOf(
      '<EnvironmentBanner environment={deploymentEnvironment} />',
    )

    expect(application).toContain('const deploymentEnvironment = getDeploymentEnvironment()')
    expect(bannerIndex).toBeGreaterThan(-1)
    expect(bannerIndex).toBeLessThan(application.indexOf('<Header'))
    expect(application.match(/<EnvironmentBanner /g)?.length).toBe(1)
  })

  test('paints with the copper tokens, at layout width, wrapping on small screens', async () => {
    const stylesheet = await readApplicationFile('src/styles/index.css')
    const ruleStart = stylesheet.indexOf('.environment-banner {')
    const rule = stylesheet.slice(ruleStart, stylesheet.indexOf('}', ruleStart))

    expect(ruleStart).toBeGreaterThan(-1)
    expect(rule).toContain('width: var(--layout-width)')
    expect(rule).toContain(
      'border: 1px solid color-mix(in srgb, var(--color-copper) 55%, transparent)',
    )
    expect(rule).toContain('background: color-mix(in srgb, var(--color-copper) 18%, transparent)')
    expect(rule).toContain('color: var(--color-fog)')
    expect(rule).toContain('flex-wrap: wrap')
    expect(rule).not.toMatch(/#[0-9a-f]{3,6}\b/i)
  })
})
