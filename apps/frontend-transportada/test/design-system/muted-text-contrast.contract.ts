/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { contrastRatio, readApplicationFile, readThemes } from './contrast.helper.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/** WCAG 2.2 §1.4.3 (AA) para corpo de texto — e todo texto discreto do produto é corpo de texto. */
const MINIMUM_TEXT_CONTRAST = 4.5

/** As duas superfícies sobre as quais qualquer texto do produto pousa, em cada tema. */
const SURFACE_TOKENS = ['--color-asphalt', '--color-graphite'] as const
const TEXT_TOKENS = ['--color-slate', '--color-slate-muted'] as const

/**
 * ⚠️ **Clarear o cinza é o defeito, e ele estava escrito 67 vezes.** `color-mix(… --color-slate 90%,
 * white 10%)` some no tema escuro (o fundo é escuro, clarear aumenta o contraste) e **reprova** no
 * tema claro: medido em 2026-09-29 no `.hint` do `cte-batch`, 4,23:1 a 0,8rem, contra o piso de
 * 4,5:1. A mesma receita aparecia em 14 folhas, com três variações de 4% (88/90/92) que ninguém
 * distingue a olho e que todas reprovavam igual.
 *
 * Por isso a regra não é "escrever a receita certa": é **não escrever receita**. Texto discreto usa
 * `--color-slate-muted`, que cada tema declara com o valor que serve ao próprio fundo — no escuro
 * clareia, no claro não clareia, porque ali não há para onde clarear sem cair de AA.
 *
 * ⚠️ **A ardósia precisa ser a base da mistura, e não só aparecer nela.** A primeira varredura
 * casava `var(--color-slate)` em qualquer posição e achatou sete declarações de
 * `color-mix(… var(--color-fog) 88%, var(--color-slate) 12%)` — que são o **oposto** do defeito:
 * texto quase branco levemente puxado para o cinza, não cinza clareado. O botão fantasma ficou com
 * texto cinza-escuro sobre fundo escuro. Ancorar na base é o que separa as duas receitas.
 */
const SLATE_TEXT_RECIPE = /^color:\s*color-mix\(in srgb,\s*var\(--color-slate\)\s/

/** WCAG isenta controle desabilitado do piso de contraste — e só ele. */
const EXEMPT_SELECTOR = ':disabled'

type RecipeViolation = Readonly<{ location: string; selector: string }>

export function findSlateTextRecipes(
  input: Readonly<{ filePath: string; source: string }>,
): readonly RecipeViolation[] {
  const violations: RecipeViolation[] = []
  let selector = ''

  input.source.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.endsWith('{')) selector = trimmed.slice(0, -1).trim()
    if (!SLATE_TEXT_RECIPE.test(trimmed)) return
    if (selector.includes(EXEMPT_SELECTOR)) return
    violations.push({ location: `${input.filePath}:${index + 1}`, selector })
  })

  return violations
}

async function listStylesheets(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })

  return entries.filter((entry) => entry.endsWith('.css')).map((entry) => `src/${entry}`)
}

describe('o texto discreto é legível nos dois temas', () => {
  test('o cinza discreto é um token, declarado por tema', async () => {
    const themes = await readThemes()

    for (const [name, tokens] of themes) {
      expect(`${name}: ${tokens.get('--color-slate-muted') ?? 'ausente'}`).not.toContain('ausente')
    }
    expect(themes.get('escuro')?.get('--color-slate-muted')).not.toBe(
      themes.get('claro')?.get('--color-slate-muted'),
    )
  })

  /**
   * ⚠️ As duas superfícies entram porque o diálogo (`--color-graphite`) e a página
   * (`--color-asphalt`) não são a mesma cor em tema nenhum — e o aviso do modal de fatura, que
   * abriu esta tarefa, pousa na do diálogo.
   */
  test('cada cinza de texto alcança AA sobre as duas superfícies de cada tema', async () => {
    const themes = await readThemes()
    const measured: string[] = []

    for (const [name, tokens] of themes) {
      for (const textToken of TEXT_TOKENS) {
        for (const surfaceToken of SURFACE_TOKENS) {
          const text = tokens.get(textToken) ?? ''
          const surface = tokens.get(surfaceToken) ?? ''
          const ratio = contrastRatio(text, surface)
          if (ratio < MINIMUM_TEXT_CONTRAST) {
            measured.push(`${name} ${textToken} sobre ${surfaceToken}: ${ratio.toFixed(2)}`)
          }
        }
      }
    }

    expect(measured).toEqual([])
  })

  test('nenhuma folha volta a clarear o cinza na mão para pintar texto', async () => {
    const stylesheets = await listStylesheets()
    const sweeps = await Promise.all(
      stylesheets.map(async (filePath) =>
        findSlateTextRecipes({ filePath, source: await readApplicationFile(filePath) }),
      ),
    )

    expect(sweeps.flat().map((violation) => violation.location)).toEqual([])
  })

  test('acusa a receita plantada, com arquivo e linha', () => {
    const violations = findSlateTextRecipes({
      filePath: 'planted.css',
      source: '.hint {\n  color: color-mix(in srgb, var(--color-slate) 90%, white 10%);\n}',
    })

    expect(violations).toEqual([{ location: 'planted.css:2', selector: '.hint' }])
  })

  /**
   * ⚠️ **Texto sobre névoa não é texto discreto**, e confundir os dois foi o defeito que a primeira
   * varredura introduziu: `--color-fog` é a base quase branca, e a ardósia entra como o tempero que
   * tira um pouco do brilho. Trocar isso pelo cinza discreto pinta texto escuro sobre fundo escuro.
   */
  test('não confunde texto sobre névoa com cinza clareado', () => {
    const violations = findSlateTextRecipes({
      filePath: 'planted.css',
      source:
        '.ui-button-ghost {\n  color: color-mix(in srgb, var(--color-fog) 88%, var(--color-slate) 12%);\n}',
    })

    expect(violations).toEqual([])
  })

  /** Controle desabilitado é a única isenção do WCAG, e some do varredor por isso. */
  test('deixa passar o controle desabilitado', () => {
    const violations = findSlateTextRecipes({
      filePath: 'planted.css',
      source:
        '.trigger:disabled {\n  color: color-mix(in srgb, var(--color-slate) 75%, transparent);\n}',
    })

    expect(violations).toEqual([])
  })
})
