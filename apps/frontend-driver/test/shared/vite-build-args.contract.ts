/* Cópia por valor de apps/frontend-transportada/test/shared/vite-build-args.contract.ts (ADR-0075 §7). */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const ROOT = new URL('../..', import.meta.url).pathname
const DOCKERFILE = readFileSync(join(ROOT, 'Dockerfile'), 'utf8')

/**
 * ⚠️ **Ela é lida só pelo smoke, e entrar no `Dockerfile` seria abrir o bypass de autenticação em
 * toda imagem publicada.** É a única ausência legítima, e por isso está nomeada aqui em vez de o
 * contrato varrer menos.
 */
const SOMENTE_EM_TESTE = new Set(['VITE_SMOKE_AUTH_BYPASS'])

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/u.test(entry) ? [path] : []
  })
}

function readVariables(): readonly string[] {
  const found = new Set<string>()
  for (const file of sourceFiles(join(ROOT, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /import\.meta\.env\.(VITE_[A-Z_]+)/gu,
    )) {
      const name = match[1]
      if (name !== undefined) found.add(name)
    }
  }
  return [...found].sort()
}

function readDeclaredArguments(): ReadonlySet<string | undefined> {
  return new Set([...DOCKERFILE.matchAll(/^ARG (VITE_[A-Z_]+)\s*$/gmu)].map((match) => match[1]))
}

describe('toda VITE_* lida pelo código chega ao bundle', () => {
  /**
   * ⚠️ **`VITE_*` é inlinada em tempo de BUILD, e o `Dockerfile` só passa adiante o que declara como
   * `ARG`.** Sem a linha, a variável pode estar preenchida no painel da Railway, o serviço pode
   * reimplantar, e o valor **não entra no bundle** — nada falha, e a app quebra no celular.
   *
   * ⚠️ Linha inteira, não `includes`: `ARG VITE_MAP` casaria dentro de `ARG VITE_MAP_TILES_URL` e o
   * contrato passaria por prefixo.
   */
  test('cada uma tem ARG no Dockerfile', () => {
    const declared = readDeclaredArguments()
    const faltando = readVariables().filter(
      (name) => !SOMENTE_EM_TESTE.has(name) && !declared.has(name),
    )

    expect(faltando).toEqual([])
  })

  /** A varredura tem de estar achando algo: um `src/` renomeado a esvaziaria e o teste passaria. */
  test('a varredura encontra as variáveis de verdade', () => {
    const found = readVariables()

    expect(found).toContain('VITE_API_URL')
    expect(found).toContain('VITE_APP_ENV')
    expect(found).toContain('VITE_DRIVER_APP_URL')
  })

  /** ADR-0075 §7: o bypass de fumaça nunca entra numa imagem publicada. */
  test('o Dockerfile nunca declara o bypass de fumaça', () => {
    for (const name of SOMENTE_EM_TESTE) {
      expect(readDeclaredArguments().has(name)).toBe(false)
      expect(DOCKERFILE).not.toContain(name)
    }
  })
})
