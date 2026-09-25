/* Cópia por valor de apps/frontend-client/test/shared/environment-banner.contract.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { applyEnvironmentBadge } from '../../src/modules/shared/environmentBadge.service'
import { resolveDeploymentEnvironment } from '../../src/modules/shared/deploymentEnvironment.service'

/**
 * As apps não importam código uma da outra, então a faixa é cópia por valor — e é este contrato
 * que lê o texto da faixa do portal para as duas não divergirem (plan D3).
 */

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PORTAL_BANNER_PATH = new URL(
  '../frontend-client/src/components/EnvironmentBanner.component.tsx',
  APPLICATION_ROOT,
)
const PORTAL_WORK_IN_PROGRESS_ICON = new URL(
  '../frontend-client/public/icons/icon-work-in-progress.svg',
  APPLICATION_ROOT,
)
const WORK_IN_PROGRESS_ICON = '/icons/icon-work-in-progress.svg'
const PRODUCTION_ICON = '/icons/icon.svg'

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

type FakeLink = { href: string; rel: string; type: string; isRemoved: boolean }

function createFakeDocument(faviconHref: string | null): {
  readonly document: Document
  readonly links: FakeLink[]
} {
  const links: FakeLink[] = []
  if (faviconHref !== null) {
    links.push({ href: faviconHref, isRemoved: false, rel: 'icon', type: 'image/svg+xml' })
  }

  const document = {
    createElement: () => {
      const link: FakeLink = { href: '', isRemoved: false, rel: '', type: '' }
      return link
    },
    head: {
      appendChild: (link: FakeLink) => {
        links.push(link)
        return link
      },
    },
    querySelector: () => {
      const link = links.find((candidate) => candidate.rel === 'icon' && !candidate.isRemoved)
      if (link === undefined) return null
      return {
        remove: () => {
          link.isRemoved = true
        },
      }
    },
  }

  return { document: document as unknown as Document, links }
}

function activeFaviconHrefs(links: readonly FakeLink[]): string[] {
  return links.filter((link) => !link.isRemoved).map((link) => link.href)
}

describe('ambiente do deploy da app do motorista', () => {
  test('respeita o ambiente declarado', () => {
    expect(resolveDeploymentEnvironment({ declared: 'staging', isDevelopmentBuild: false })).toBe(
      'staging',
    )
    expect(resolveDeploymentEnvironment({ declared: ' LOCAL ', isDevelopmentBuild: false })).toBe(
      'local',
    )
    expect(resolveDeploymentEnvironment({ declared: 'production', isDevelopmentBuild: true })).toBe(
      'production',
    )
  })

  test('build de desenvolvimento sem declaração é local', () => {
    expect(resolveDeploymentEnvironment({ declared: undefined, isDevelopmentBuild: true })).toBe(
      'local',
    )
  })

  test('ausente ou desconhecido cai em produção, para nunca marcar a instalação do cliente', () => {
    for (const declared of [undefined, '', 'homolog']) {
      expect(resolveDeploymentEnvironment({ declared, isDevelopmentBuild: false })).toBe(
        'production',
      )
    }
  })

  test('o Dockerfile leva a variável para dentro do bundle', async () => {
    const dockerfile = await readApplicationFile('Dockerfile')

    expect(dockerfile).toMatch(/^ARG VITE_APP_ENV$/mu)
  })
})

describe('faixa de ambiente da app do motorista', () => {
  test('diz o mesmo que a faixa do portal, e nada em produção', async () => {
    const [banner, portalBanner] = await Promise.all([
      readApplicationFile('src/components/EnvironmentBanner.component.tsx'),
      Bun.file(PORTAL_BANNER_PATH).text(),
    ])

    for (const environment of ['local', 'staging'] as const) {
      expect(readBannerLabel(banner, environment)).toBe(readBannerLabel(portalBanner, environment))
    }
    expect(banner).toContain("if (environment === 'production')")
    expect(banner).toContain('return null')
  })

  test('anuncia a faixa ao leitor de tela sem esconder a mensagem', async () => {
    const banner = await readApplicationFile('src/components/EnvironmentBanner.component.tsx')

    expect(banner).toContain('className="environment-banner"')
    expect(banner).toContain('role="status"')
    expect(banner).toContain('<span aria-hidden="true">🚧</span>')
    expect(banner.match(/aria-hidden/g)?.length).toBe(1)
  })

  test('vai no topo da página, acima do conteúdo', async () => {
    const main = await readApplicationFile('src/main.tsx')
    const bannerIndex = main.indexOf('<EnvironmentBanner environment={deploymentEnvironment} />')

    expect(main).toContain('const deploymentEnvironment = getDeploymentEnvironment()')
    expect(bannerIndex).toBeGreaterThan(-1)
    expect(bannerIndex).toBeLessThan(main.indexOf('<main'))
    expect(main.match(/<EnvironmentBanner /g)?.length).toBe(1)
  })

  test('pinta com os tokens de cobre, na largura do layout, e quebra linha no celular', async () => {
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

describe('ícone 🚧 da app do motorista', () => {
  test('é o mesmo selo do portal', async () => {
    const [icon, portalIcon] = await Promise.all([
      readApplicationFile('public/icons/icon-work-in-progress.svg'),
      Bun.file(PORTAL_WORK_IN_PROGRESS_ICON).text(),
    ])

    expect(icon).toBe(portalIcon)
  })

  test('troca o ícone da aba fora de produção', () => {
    for (const environment of ['local', 'staging'] as const) {
      const { document, links } = createFakeDocument(PRODUCTION_ICON)

      applyEnvironmentBadge({ document, environment })

      expect(activeFaviconHrefs(links)).toEqual([WORK_IN_PROGRESS_ICON])
    }
  })

  test('deixa produção intacta', () => {
    const { document, links } = createFakeDocument(PRODUCTION_ICON)

    applyEnvironmentBadge({ document, environment: 'production' })

    expect(activeFaviconHrefs(links)).toEqual([PRODUCTION_ICON])
  })

  test('sobrevive a uma página sem ícone declarado', () => {
    const { document, links } = createFakeDocument(null)

    applyEnvironmentBadge({ document, environment: 'local' })

    expect(links).toEqual([])
  })

  /** Antes da primeira pintura: a aba nunca mostra a marca de produção num ambiente de teste. */
  test('é aplicado no boot, antes de montar a árvore', async () => {
    const main = await readApplicationFile('src/main.tsx')
    const badgeIndex = main.indexOf(
      'applyEnvironmentBadge({ document, environment: deploymentEnvironment })',
    )

    expect(badgeIndex).toBeGreaterThan(-1)
    expect(badgeIndex).toBeLessThan(main.indexOf('createRoot('))
  })
})
