/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 283 T6 (RF7): o log da conversa da ocorrência não leva dado do cliente em claro. Telefone, e-mail e destino
 * entram só mascarados (`*Masked`, `maskClientAddress`). Este teste lê o código-fonte dos logs da conversa e reprova
 * qualquer chamada de log que passe um desses campos cru.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const CONVERSATION_DIR = join(import.meta.dir, '..', '..', 'src', 'occurrence-conversation')
const LOG_CALL_PATTERN = /\b(?:logger|Logger)\??\.(?:info|warn|error|debug)\(|\bsafeLog(?:Info|Warn|Error)\(|\blog\(\s*\{/g
const RAW_CLIENT_FIELD_PATTERN = /(?:^|[{,\s])(phone|phoneNumber|whatsappNumber|number|email|e-?mail|address|recipient|recipients|to|destination|body|text)\s*(?::|,|\})/gm

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

// Lê a chamada até o parêntese que a fecha, para não cruzar para o código seguinte.
function logCallArguments(source: string, start: number): string {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char === '(' || char === '{' || char === '[') depth += 1
    if (char === ')' || char === '}' || char === ']') depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  return source.slice(start)
}

function logCallWindows(source: string): string[] {
  return [...source.matchAll(LOG_CALL_PATTERN)].map((match) => logCallArguments(source, match.index + match[0].indexOf('(')))
}

function rawClientFields(window: string): string[] {
  return [...window.matchAll(RAW_CLIENT_FIELD_PATTERN)].map((match) => match[1] ?? '')
}

describe('log da conversa da ocorrência não leva dado do cliente', () => {
  const files = sourceFiles(CONVERSATION_DIR)

  test('há chamadas de log para inspecionar', () => {
    const calls = files.flatMap((file) => logCallWindows(readFileSync(file, 'utf8')))
    expect(calls.length).toBeGreaterThan(0)
  })

  test('nenhum log da conversa passa telefone, e-mail ou destino em claro', () => {
    const leaks = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return logCallWindows(source)
        .flatMap(rawClientFields)
        .map((field) => `${relative(CONVERSATION_DIR, file)}: ${field}`)
    })

    expect(leaks).toEqual([])
  })

  test('o detector pega um campo cru e aceita o mascarado', () => {
    expect(rawClientFields("logger.info('x', { companyId, email })")).toEqual(['email'])
    expect(rawClientFields("logger.info('x', { companyId, addressMasked: '****1234' })")).toEqual([])
  })
})
