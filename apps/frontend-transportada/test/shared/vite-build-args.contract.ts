/* Copyright (c) 2026 Ada Technology. MIT License. */
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

describe('toda VITE_* lida pelo código chega ao bundle', () => {
  /**
   * ⚠️ **`VITE_*` é inlinada em tempo de BUILD, e o `Dockerfile` só passa adiante o que declara como
   * `ARG`.** Sem a linha, a variável pode estar preenchida no painel, o serviço pode reimplantar, e
   * o valor **não entra no bundle** — nada falha, nada avisa, e o recurso simplesmente não existe
   * na tela.
   *
   * Aconteceu com `VITE_MAP_TILES_URL` em 04/09/2026: ela foi configurada em produção, o serviço
   * reimplantou duas vezes, e o mapa continuou ausente porque o `ARG` nunca existiu. O `CLAUDE.md`
   * já registrava a armadilha para `VITE_APP_ENV`; o que faltava era o contrato cobrindo a classe,
   * em vez de uma variável por vez.
   *
   * A CSP depende disto duas vezes: origem que o bundle busca sem estar no `connect-src` é pedido
   * bloqueado pelo navegador, e o `connect-src` nasce **deste** build.
   */
  test('cada uma tem ARG no Dockerfile', () => {
    /**
     * ⚠️ Linha inteira, não `includes`: `ARG VITE_MAP` casaria dentro de `ARG VITE_MAP_TILES_URL` e
     * o contrato passaria por prefixo. Descoberto ao testar a mutação — a primeira versão desta
     * asserção não reprovava com o `ARG` renomeado.
     */
    const declared = new Set(
      [...DOCKERFILE.matchAll(/^ARG (VITE_[A-Z_]+)\s*$/gmu)].map((match) => match[1]),
    )
    const faltando = readVariables().filter(
      (name) => !SOMENTE_EM_TESTE.has(name) && !declared.has(name),
    )

    expect(faltando).toEqual([])
  })

  /** A varredura tem de estar achando algo: um `src/` renomeado a esvaziaria e o teste passaria. */
  test('a varredura encontra as variáveis de verdade', () => {
    const found = readVariables()

    expect(found.length).toBeGreaterThan(5)
    expect(found).toContain('VITE_MAP_TILES_URL')
    expect(found).toContain('VITE_API_URL')
  })
})
