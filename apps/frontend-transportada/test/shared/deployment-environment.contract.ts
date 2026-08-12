/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import {
  applyEnvironmentBadge,
  buildEnvironmentFaviconHref,
} from '../../src/modules/shared/environmentFavicon.service.js'
import { resolveDeploymentEnvironment } from '../../src/modules/shared/deploymentEnvironment.service.js'

function createDocument(faviconHref: string | null): {
  readonly document: {
    title: string
    querySelector: (selectors: string) => { href: string } | null
  }
  readonly link: { href: string } | null
} {
  const link = faviconHref === null ? null : { href: faviconHref }
  return {
    document: {
      querySelector: () => link,
      title: 'TransportAdA',
    },
    link,
  }
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

describe('environment favicon badge', () => {
  test('builds a work-in-progress icon outside production', () => {
    const staging = buildEnvironmentFaviconHref('staging')
    const local = buildEnvironmentFaviconHref('local')

    expect(staging).toBeDefined()
    expect(staging).toContain('%F0%9F%9A%A7')
    expect(local).toBe(staging)
  })

  test('leaves production without any badge', () => {
    expect(buildEnvironmentFaviconHref('production')).toBeUndefined()
  })

  test('swaps the tab icon and marks the title outside production', () => {
    const { document, link } = createDocument('/icons/icon.svg')

    applyEnvironmentBadge({ document, environment: 'staging' })

    expect(link?.href).toBe(buildEnvironmentFaviconHref('staging'))
    expect(document.title.startsWith('🚧')).toBe(true)
    expect(document.title).toContain('TransportAdA')
  })

  test('keeps production untouched', () => {
    const { document, link } = createDocument('/icons/icon.svg')

    applyEnvironmentBadge({ document, environment: 'production' })

    expect(link?.href).toBe('/icons/icon.svg')
    expect(document.title).toBe('TransportAdA')
  })

  test('marks the title even when the page declares no icon link', () => {
    const { document } = createDocument(null)

    applyEnvironmentBadge({ document, environment: 'local' })

    expect(document.title.startsWith('🚧')).toBe(true)
  })

  test('never stacks the mark when applied twice', () => {
    const { document } = createDocument('/icons/icon.svg')

    applyEnvironmentBadge({ document, environment: 'staging' })
    applyEnvironmentBadge({ document, environment: 'staging' })

    expect(document.title).toBe('🚧 TransportAdA')
  })
})
