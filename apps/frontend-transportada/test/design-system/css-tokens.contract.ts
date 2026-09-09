import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/**
 * ⚠️ **`var(--x)` sem definição não degrada: ele apaga a declaração inteira.** O navegador trata a
 * substituição vazia como valor inválido em tempo de computação, e a propriedade cai para o valor
 * herdado ou inicial — sem erro, sem aviso, sem nada no console.
 *
 * Foi assim que o painel da proposta multi-veículo passou meses **sem borda nenhuma** e com o texto
 * "apagado" na cor cheia: `.proposal` pedia `--color-border`, `--radius-md` e `--color-text-muted`,
 * e nenhum dos três existe em lugar nenhum do produto. Medido em 2026-09-09, antes desta feature:
 * **57 declarações descartadas em 5 arquivos**, com onze tokens fantasmas.
 *
 * O contrato vale para toda folha futura, e é por isso que ele varre por glob em vez de listar
 * arquivo: módulo novo entra na varredura sozinho.
 */

/** `var(--x, algo)` **não** é violação: quem escreveu o alvo declarou o que fazer sem ele. */
const VAR_WITHOUT_FALLBACK = /var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g
const CUSTOM_PROPERTY_DEFINITION = /(--[A-Za-z0-9_-]+)\s*:/g
/**
 * Token que o componente injeta por `style`, e que por isso **não tem** — nem deve ter — definição
 * em folha: `--skeleton-width`, `--progress-value`, `--box-index`. Eles são dado em tempo de
 * execução, e a folha só os consome.
 */
const INLINE_PROPERTY_DEFINITION = /['"](--[A-Za-z0-9_-]+)['"]\s*:/g

type TokenViolation = Readonly<{ location: string; token: string }>

export function findUndefinedTokens(
  input: Readonly<{ defined: ReadonlySet<string>; filePath: string; source: string }>,
): readonly TokenViolation[] {
  const violations: TokenViolation[] = []

  input.source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(VAR_WITHOUT_FALLBACK)) {
      const token = match[1] ?? ''
      if (input.defined.has(token)) continue
      violations.push({ location: `${input.filePath}:${index + 1}`, token })
    }
  })

  return violations
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceFiles(extensions: readonly string[]): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries
    .filter((entry) => extensions.some((extension) => entry.endsWith(extension)))
    .map((entry) => `src/${entry}`)
}

async function collectDefinedTokens(): Promise<ReadonlySet<string>> {
  const [stylesheets, modules] = await Promise.all([
    listSourceFiles(['.css']),
    listSourceFiles(['.ts', '.tsx']),
  ])
  const defined = new Set<string>()

  for (const filePath of stylesheets) {
    const source = await readApplicationFile(filePath)
    for (const match of source.matchAll(CUSTOM_PROPERTY_DEFINITION)) {
      defined.add(match[1] ?? '')
    }
  }
  for (const filePath of modules) {
    const source = await readApplicationFile(filePath)
    for (const match of source.matchAll(INLINE_PROPERTY_DEFINITION)) {
      defined.add(match[1] ?? '')
    }
  }

  return defined
}

async function sweepStylesheets(): Promise<readonly TokenViolation[]> {
  const [stylesheets, defined] = await Promise.all([
    listSourceFiles(['.css']),
    collectDefinedTokens(),
  ])
  const sweeps = await Promise.all(
    stylesheets.map(async (filePath) =>
      findUndefinedTokens({ defined, filePath, source: await readApplicationFile(filePath) }),
    ),
  )

  return sweeps.flat()
}

describe('css tokens contract', () => {
  test('nenhuma folha consome token que não existe', async () => {
    const violations = await sweepStylesheets()

    expect(violations.map((violation) => `${violation.location} ${violation.token}`)).toEqual([])
  })

  test('acusa o token fantasma plantado, com arquivo e linha', () => {
    const violations = findUndefinedTokens({
      defined: new Set(['--color-fog']),
      filePath: 'planted.css',
      source: '.a {\n  color: var(--color-fog);\n  border: 1px solid var(--color-border);\n}',
    })

    expect(violations).toEqual([{ location: 'planted.css:3', token: '--color-border' }])
  })

  /**
   * ⚠️ Sem esta, o contrato reprovaria `--skeleton-width` e o time aprenderia a ignorá-lo — que é
   * como um contrato barulhento deixa de proteger o que ele protegia.
   */
  test('aceita o token que o componente injeta por estilo inline', () => {
    const violations = findUndefinedTokens({
      defined: new Set(['--skeleton-width']),
      filePath: 'planted.css',
      source: '.a { width: var(--skeleton-width); }',
    })

    expect(violations).toEqual([])
  })

  test('aceita `var()` com alternativa: ali a ausência foi decidida', () => {
    const violations = findUndefinedTokens({
      defined: new Set(),
      filePath: 'planted.css',
      source: '.a { border-radius: var(--radius-md, 0); }',
    })

    expect(violations).toEqual([])
  })
})
