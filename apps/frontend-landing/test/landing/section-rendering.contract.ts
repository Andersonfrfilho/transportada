/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import {
  resolveSectionList,
  resolveSectionText,
} from '../../src/modules/landing/shared/landingSections.service.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

describe('landing section text resolution', () => {
  test('configured text overrides the locale default', () => {
    const sections = { hero: { subtitle: 'Texto configurado pela transportadora' } }

    expect(resolveSectionText(sections, 'hero', 'subtitle', 'Padrão')).toBe(
      'Texto configurado pela transportadora',
    )
  })

  test('a section absent, malformed, or with the wrong field type falls back to the default', () => {
    expect(resolveSectionText({}, 'hero', 'subtitle', 'Padrão')).toBe('Padrão')
    expect(resolveSectionText({ hero: 'texto solto' }, 'hero', 'subtitle', 'Padrão')).toBe('Padrão')
    expect(resolveSectionText({ hero: { subtitle: 42 } }, 'hero', 'subtitle', 'Padrão')).toBe(
      'Padrão',
    )
    expect(resolveSectionText({ hero: { subtitle: '   ' } }, 'hero', 'subtitle', 'Padrão')).toBe(
      'Padrão',
    )
  })

  test('a configured list overrides the default list entirely, not merges', () => {
    const sections = { offer: { items: ['Item configurado'] } }

    expect(resolveSectionList(sections, 'offer', 'items', ['A', 'B'])).toEqual(['Item configurado'])
  })

  test('an empty or malformed list falls back to the default', () => {
    expect(resolveSectionList({ offer: { items: [] } }, 'offer', 'items', ['A', 'B'])).toEqual([
      'A',
      'B',
    ])
    expect(resolveSectionList({ offer: { items: 'não é lista' } }, 'offer', 'items', ['A'])).toEqual(
      ['A'],
    )
  })
})

describe('no unsanitized HTML injection', () => {
  test('dangerouslySetInnerHTML never appears in the app', async () => {
    const glob = new Bun.Glob('**/*.{ts,tsx}')
    for await (const relativePath of glob.scan({
      cwd: fileURLToPath(new URL('src', APPLICATION_ROOT)),
    })) {
      const content = await Bun.file(
        fileURLToPath(new URL(`src/${relativePath}`, APPLICATION_ROOT)),
      ).text()
      expect(content).not.toContain('dangerouslySetInnerHTML')
    }
  })
})
