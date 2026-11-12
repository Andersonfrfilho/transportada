/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 RF9: todo texto de mensagem vem do módulo de notificação. Texto literal passado a
 * `sendText`/`sendMedia`/`sendMail` fora de `notification/` falha o CI, salvo nos arquivos da lista abaixo.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(import.meta.dir, '..', '..', 'src')
const SEND_CALL = /\b(?:sendText|sendMedia|sendMail)\(/g
const LITERAL = /'[^'\n]*[\p{L}]{3,}[^'\n]*'|"[^"\n]*[\p{L}]{3,}[^"\n]*"|`[^`]*[\p{L}]{3,}[^`]*`/u

/** Sem exceções: as falas do bot saíram do código na T8 (nós `fala_*` do grafo de conversa). Não cresce. */
const EXCEPTIONS = new Set<string>()

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

function callArguments(source: string, from: number): string {
  let depth = 1
  let index = from
  while (index < source.length && depth > 0) {
    const char = source[index]
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    index += 1
  }
  return source.slice(from, index)
}

function filesWithLiteralMessageText(): string[] {
  return sourceFiles(SRC)
    .map((path) => relative(SRC, path))
    .filter((path) => !path.startsWith('notification/') && !path.startsWith('notification\\'))
    .filter((path) => {
      const source = readFileSync(join(SRC, path), 'utf8')
      return [...source.matchAll(SEND_CALL)].some((match) =>
        LITERAL.test(callArguments(source, (match.index ?? 0) + match[0].length)),
      )
    })
}

describe('texto de mensagem solto (spec 286 RF9)', () => {
  test('nenhum arquivo fora de notification/ passa texto literal a sendText/sendMedia/sendMail, fora da lista', () => {
    expect(filesWithLiteralMessageText().filter((path) => !EXCEPTIONS.has(path))).toEqual([])
  })

  test('a lista de exceções não guarda arquivo que já ficou limpo', () => {
    const offenders = new Set(filesWithLiteralMessageText())
    expect([...EXCEPTIONS].filter((path) => !offenders.has(path))).toEqual([])
  })

  test('o detector pega texto literal e ignora variável', () => {
    expect(LITERAL.test("'Olá, tudo bem?'")).toBe(true)
    expect(LITERAL.test('`Nota ${number}`')).toBe(true)
    expect(LITERAL.test('to, body')).toBe(false)
  })
})
