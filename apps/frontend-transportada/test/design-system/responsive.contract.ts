/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/**
 * web.md §10: base · 640px · 1024px · 1280px, e **uma grafia só** para cada um. Duas grafias do
 * mesmo ponto (`640px` e `40rem`) foi como nove pontos nasceram de quatro.
 */
const BREAKPOINTS = ['40rem', '64rem', '80rem'] as const

const MEDIA_PRELUDE = /@media([^{]*)\{/g
const WIDTH_CONDITION = /(max-width|min-width)\s*:\s*([^)\s]+)|width\s*(<=|<|>=|>)\s*([^)\s]+)/g

type ResponsiveViolation = Readonly<{ location: string; reason: string }>

/**
 * `max-width` e `width <=` são a mesma consulta em duas grafias, e as duas removem em tela pequena.
 * Cobrir só a primeira deixaria a regra valendo pela metade, com seis sites já usando a segunda.
 */
function findResponsiveViolations(
  filePath: string,
  source: string,
): readonly ResponsiveViolation[] {
  const violations: ResponsiveViolation[] = []

  for (const media of source.matchAll(MEDIA_PRELUDE)) {
    const prelude = (media[1] ?? '').trim()
    const location = `${filePath} — @media ${prelude}`

    for (const condition of prelude.matchAll(WIDTH_CONDITION)) {
      const feature = condition[1]
      const comparison = condition[3]
      const value = condition[2] ?? condition[4] ?? ''

      if (feature === 'max-width' || comparison === '<=' || comparison === '<') {
        violations.push({ location, reason: 'consulta desktop-first: remove em tela pequena' })
        continue
      }

      if (!BREAKPOINTS.some((breakpoint) => breakpoint === value)) {
        violations.push({ location, reason: `ponto de quebra fora dos quatro: ${value}` })
      }
    }
  }

  return violations
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listStylesheets(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.css')).map((entry) => `src/${entry}`)
}

async function sweepStylesheets(): Promise<readonly ResponsiveViolation[]> {
  const stylesheets = await listStylesheets()
  const sweeps = await Promise.all(
    stylesheets.map(async (filePath) =>
      findResponsiveViolations(filePath, await readApplicationFile(filePath)),
    ),
  )
  return sweeps.flat()
}

describe('responsive contract', () => {
  test('nenhuma folha de estilo remove layout em tela pequena', async () => {
    const violations = await sweepStylesheets()
    const desktopFirst = violations.filter((violation) =>
      violation.reason.includes('desktop-first'),
    )

    expect(desktopFirst.map((violation) => violation.location)).toEqual([])
  })

  test('nenhuma folha de estilo declara ponto de quebra fora dos quatro', async () => {
    const violations = await sweepStylesheets()
    const offGrid = violations.filter((violation) => violation.reason.includes('ponto de quebra'))

    expect(offGrid.map((violation) => `${violation.location} (${violation.reason})`)).toEqual([])
  })

  test('recusa o `max-width` plantado, nas duas grafias', () => {
    const withMaxWidth = findResponsiveViolations(
      'planted.css',
      '@media (max-width: 47.99rem) { .a { display: none; } }',
    )
    const withRangeSyntax = findResponsiveViolations(
      'planted.css',
      '@media (width <= 40rem) { .a { display: none; } }',
    )

    expect(withMaxWidth).toHaveLength(1)
    expect(withMaxWidth[0]?.reason).toContain('desktop-first')
    expect(withRangeSyntax).toHaveLength(1)
    expect(withRangeSyntax[0]?.reason).toContain('desktop-first')
  })

  test('recusa o `min-width: 47.99rem` plantado, nas duas grafias', () => {
    const withMinWidth = findResponsiveViolations(
      'planted.css',
      '@media (min-width: 47.99rem) { .a { display: grid; } }',
    )
    const withRangeSyntax = findResponsiveViolations(
      'planted.css',
      '@media (width >= 48rem) { .a { display: grid; } }',
    )

    expect(withMinWidth[0]?.reason).toContain('47.99rem')
    expect(withRangeSyntax[0]?.reason).toContain('48rem')
  })

  test('aceita os quatro pontos de quebra, e a base é ausência de consulta', () => {
    const source = [
      '.a { display: grid; }',
      '@media (min-width: 40rem) { .a { grid-template-columns: repeat(2, 1fr); } }',
      '@media (width >= 64rem) { .a { grid-template-columns: repeat(3, 1fr); } }',
      '@media (min-width: 80rem) { .a { grid-template-columns: repeat(4, 1fr); } }',
    ].join('\n')

    expect(findResponsiveViolations('planted.css', source)).toEqual([])
  })

  test('não confunde preferência de usuário com largura', () => {
    const source = [
      '@media (prefers-reduced-motion: reduce) { .a { animation: none; } }',
      '@media (pointer: coarse) { .a { min-height: 2.75rem; } }',
      '@media (prefers-color-scheme: dark) { .a { color: white; } }',
    ].join('\n')

    expect(findResponsiveViolations('planted.css', source)).toEqual([])
  })

  test('declara a regra dos quatro pontos para toda tela futura', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/responsive.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('40rem')
    expect(rule).toContain('64rem')
    expect(rule).toContain('80rem')
    expect(rule).toContain('max-width')
    expect(projectContext).toContain('docs/frontend/responsive.md')
  })
})
