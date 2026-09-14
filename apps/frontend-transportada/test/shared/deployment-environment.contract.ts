/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import { applyEnvironmentBadge } from '../../src/modules/shared/environmentBadge.service.js'
import { resolveDeploymentEnvironment } from '../../src/modules/shared/deploymentEnvironment.service.js'

const FAVICON_SELECTOR = 'link[rel="icon"]'
const ICON_CANVAS_SIZE = 192

type StubLink = {
  href: string
  type?: string
  rel?: string
  remove: () => void
}

function createDocument(faviconHref: string | null): {
  readonly document: Document
  readonly currentFavicon: () => StubLink | null
} {
  let link: StubLink | null =
    faviconHref === null ? null : { href: faviconHref, remove: () => (link = null) }

  const stub = {
    createElement: (): StubLink => ({ href: '', remove: () => (link = null) }),
    head: {
      appendChild: (node: StubLink) => {
        link = node
      },
    },
    querySelector: (selectors: string) => (selectors === FAVICON_SELECTOR ? link : null),
    title: 'TransportAdA',
  }

  return { document: stub as unknown as Document, currentFavicon: () => link }
}

describe('deployment environment resolution', () => {
  test('honours the declared environment', () => {
    expect(resolveDeploymentEnvironment({ declared: 'staging', isDevelopmentBuild: false })).toBe(
      'staging',
    )
    expect(
      resolveDeploymentEnvironment({ declared: 'production', isDevelopmentBuild: false }),
    ).toBe('production')
    expect(resolveDeploymentEnvironment({ declared: ' LOCAL ', isDevelopmentBuild: false })).toBe(
      'local',
    )
  })

  test('treats the development build as local when nothing is declared', () => {
    expect(resolveDeploymentEnvironment({ declared: undefined, isDevelopmentBuild: true })).toBe(
      'local',
    )
  })

  test('falls back to production so a missing variable never flags a customer install', () => {
    expect(resolveDeploymentEnvironment({ declared: undefined, isDevelopmentBuild: false })).toBe(
      'production',
    )
    expect(resolveDeploymentEnvironment({ declared: '', isDevelopmentBuild: false })).toBe(
      'production',
    )
    expect(resolveDeploymentEnvironment({ declared: 'homolog', isDevelopmentBuild: false })).toBe(
      'production',
    )
  })
})

describe('environment declaration reaches the bundle', () => {
  test('documents the variable and carries it into the image build', async () => {
    const applicationRoot = new URL('../..', import.meta.url)
    const environmentExample = await Bun.file(
      fileURLToPath(new URL('../../.env.example', applicationRoot)),
    ).text()
    const dockerfile = await Bun.file(fileURLToPath(new URL('Dockerfile', applicationRoot))).text()

    expect(environmentExample).toContain('VITE_APP_ENV=')
    // Sem o ARG o valor não entra no bundle e o staging se anuncia como produção
    expect(dockerfile).toContain('ARG VITE_APP_ENV')
  })
})

describe('application icon', () => {
  test('is declared in the shell and shipped as an asset', async () => {
    const applicationRoot = new URL('../..', import.meta.url)
    const shell = await Bun.file(fileURLToPath(new URL('index.html', applicationRoot))).text()

    expect(shell).toContain('rel="icon"')
    expect(shell).toContain('/icons/icon.svg')
    expect(
      await Bun.file(fileURLToPath(new URL('public/icons/icon.svg', applicationRoot))).exists(),
    ).toBe(true)
    expect(
      await Bun.file(fileURLToPath(new URL('public/icons/icon-192.png', applicationRoot))).exists(),
    ).toBe(true)
  })

  // Mesmo desenho do favicon de ambiente do site da Ada: o ícone continua grande e ocupa o canto
  // de trás, e o 🚧 é um selo pequeno na frente dele. Trocar o ícone pelo emoji perderia a marca;
  // o que o teste guarda é a hierarquia — selo menor que o ícone e desenhado por último.
  test('ships a work in progress variant badging the mark over a large icon', async () => {
    const applicationRoot = new URL('../..', import.meta.url)
    const variant = await Bun.file(
      fileURLToPath(new URL('public/icons/icon-work-in-progress.svg', applicationRoot)),
    ).text()

    expect(variant).toContain('🚧')
    expect(variant).toContain('viewBox="0 0 192 192"')

    const iconSize = Number(/<rect [^>]*width="(\d+)"/u.exec(variant)?.[1])
    const markSize = Number(/font-size="(\d+)"/u.exec(variant)?.[1])

    expect(iconSize).toBeGreaterThanOrEqual(ICON_CANVAS_SIZE * 0.75)
    expect(markSize).toBeLessThan(iconSize * 0.75)
    expect(variant.indexOf('🚧')).toBeGreaterThan(variant.indexOf('M38 46h116v22H108v78H84V68H38z'))
  })
})

describe('environment badge', () => {
  test('moves the mark ahead of the application icon outside production', () => {
    for (const environment of ['local', 'staging'] as const) {
      const { document, currentFavicon } = createDocument('/icons/icon.svg')

      applyEnvironmentBadge({ document, environment })

      const favicon = currentFavicon()

      // O elemento é trocado, não editado: editar o `href` deixa a aba com o ícone já buscado.
      expect(favicon?.href).toBe('/icons/icon-work-in-progress.svg')
      expect(favicon?.rel).toBe('icon')
      expect(favicon?.type).toBe('image/svg+xml')
    }
  })

  // Um aviso só: com o 🚧 no ícone, repetí-lo no título punha dois lado a lado na mesma aba.
  test('leaves the title with the product name alone', () => {
    const { document } = createDocument('/icons/icon.svg')

    applyEnvironmentBadge({ document, environment: 'staging' })

    expect(document.title).toBe('TransportAdA')
  })

  test('keeps production untouched', () => {
    const { document, currentFavicon } = createDocument('/icons/icon.svg')

    applyEnvironmentBadge({ document, environment: 'production' })

    expect(document.title).toBe('TransportAdA')
    expect(currentFavicon()?.href).toBe('/icons/icon.svg')
  })

  test('survives a page that declares no icon link', () => {
    const { document } = createDocument(null)

    applyEnvironmentBadge({ document, environment: 'local' })

    expect(document.title).toBe('TransportAdA')
  })

  test('never stacks the mark when applied twice', () => {
    const { document, currentFavicon } = createDocument('/icons/icon.svg')

    applyEnvironmentBadge({ document, environment: 'staging' })
    applyEnvironmentBadge({ document, environment: 'staging' })

    expect(currentFavicon()?.href).toBe('/icons/icon-work-in-progress.svg')
  })
})
