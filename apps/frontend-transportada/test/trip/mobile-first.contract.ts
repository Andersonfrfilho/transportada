/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TRIP_STYLESHEET_PATH = 'src/modules/trip/styles/trip.module.css'
const ROOT_STYLESHEET_PATH = 'src/styles/index.css'
const TABLET_MEDIA = '@media (min-width: 40rem)'
const ALLOWED_BREAKPOINTS = ['40rem', '64rem', '80rem'] as const

type Rule = Readonly<{ body: string; media: string; selector: string }>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** Regra com o `@media` que a envolve: sem o contexto, base e tablet viram a mesma declaração. */
function listRules(stylesheet: string): readonly Rule[] {
  const source = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const preludes: string[] = []
  let buffer = ''

  for (const character of source) {
    if (character === '{') {
      preludes.push(buffer.replaceAll(/\s+/g, ' ').trim())
      buffer = ''
      continue
    }
    if (character === '}') {
      const prelude = preludes.pop() ?? ''
      const media = preludes.find((candidate) => candidate.startsWith('@media')) ?? ''
      if (!prelude.startsWith('@')) rules.push({ body: buffer.trim(), media, selector: prelude })
      buffer = ''
      continue
    }
    buffer += character
  }

  return rules
}

function findRule(rules: readonly Rule[], selector: string, media = ''): Rule | undefined {
  return rules.find((rule) => rule.selector === selector && rule.media === media)
}

describe('trip mobile-first contract', () => {
  test('adds width with min-width only, on the shared breakpoint grid', async () => {
    const stylesheet = await readApplicationFile(TRIP_STYLESHEET_PATH)
    const queries = [...stylesheet.matchAll(/@media[^{]+/g)].map((match) => match[0].trim())

    expect(queries.length).toBeGreaterThan(2)
    for (const query of queries) {
      expect(query).not.toMatch(/max-width|width\s*<=/)
      expect(ALLOWED_BREAKPOINTS.some((breakpoint) => query.includes(breakpoint))).toBe(true)
    }
  })

  // O separador abre o portão de CT-e com a nota na outra mão: em 375px o diálogo é a tela inteira.
  test('opens the mdfe gate fullscreen on the phone and boxes it from the tablet up', async () => {
    const rules = listRules(await readApplicationFile(TRIP_STYLESHEET_PATH))
    const overlay = findRule(rules, '.mdfeGateOverlay')
    const dialog = findRule(rules, '.mdfeGateDialog')

    expect(overlay?.body).toContain('padding: 0')
    expect(dialog?.body).toContain('width: 100%')
    expect(dialog?.body).toContain('height: 100%')
    expect(dialog?.body).toContain('max-height: 100vh')
    expect(dialog?.body).toContain('border: none')

    const boxedOverlay = findRule(rules, '.mdfeGateOverlay', TABLET_MEDIA)
    const boxedDialog = findRule(rules, '.mdfeGateDialog', TABLET_MEDIA)

    expect(boxedOverlay?.body).toContain('padding: var(--space-4)')
    expect(boxedDialog?.body).toContain('width: min(38rem, 100%)')
    expect(boxedDialog?.body).toContain('height: auto')
    expect(boxedDialog?.body).toContain('max-height: 92vh')
    expect(boxedDialog?.body).toContain('border: 1px solid')
  })

  test('lets the note table scroll inside its own container, never the body', async () => {
    const rules = listRules(await readApplicationFile(TRIP_STYLESHEET_PATH))

    expect(findRule(rules, '.tableScroll')?.body).toContain('overflow-x: auto')
    expect(findRule(rules, '.dataTable')?.body).toContain('width: 100%')
    expect(findRule(rules, '.dataTable')?.body).toContain('white-space: nowrap')
    expect(findRule(rules, '.tripShell')?.body).toContain('width: var(--layout-width)')
  })

  // O compacto do design system tem 2,4rem; o dedo do separador pede 2,75rem (44px, `web.md` §10).
  test('raises every compact control of the trip screen to the touch target on the phone', async () => {
    const rootStylesheet = await readApplicationFile(ROOT_STYLESHEET_PATH)
    const rules = listRules(await readApplicationFile(TRIP_STYLESHEET_PATH))

    expect(rootStylesheet).toContain('--touch-target: 2.75rem')
    expect(findRule(rules, '.tripShell')?.body).toContain(
      '--control-height-compact: var(--touch-target)',
    )
    expect(findRule(rules, '.tripShell', TABLET_MEDIA)?.body).toContain(
      '--control-height-compact: var(--field-height-compact)',
    )
  })

  test('keeps the phone header light and grows its padding from the tablet up', async () => {
    const rules = listRules(await readApplicationFile(TRIP_STYLESHEET_PATH))

    expect(findRule(rules, '.header')?.body).toContain('padding: var(--space-4)')
    expect(findRule(rules, '.header', TABLET_MEDIA)?.body).toContain('padding: var(--space-6)')
  })
})
