/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.11 (CA08): nenhum log dos arquivos do alarme leva e-mail, nome de arquivo, CNPJ ou número
 * de nota. O contrato lê os arquivos novos e exercita o detector contra um trecho ruim, para ele não
 * passar vazio.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

const ALERT_DIRECTORY = fileURLToPath(
  new URL('../../src/occurrence-contractor-reply-alert', import.meta.url),
)

const FORBIDDEN_LOG_FIELD =
  /(e-?mail|address|file-?name|object-?key|tax-?id|cnpj|invoice|label|recipient|contact|attachment)/iu

const LOG_CALL = /(?:safeLog(?:Info|Warn|Error)|logger\.(?:info|warn|error|debug))\s*\(/gu

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? listSourceFiles(join(directory, entry.name))
      : entry.name.endsWith('.ts')
        ? [join(directory, entry.name)]
        : [],
  )
}

/** O texto de cada chamada de log, do nome até o parêntese que a fecha. */
export function extractLogCalls(source: string): readonly string[] {
  const calls: string[] = []
  for (const match of source.matchAll(LOG_CALL)) {
    let depth = 1
    let cursor = match.index + match[0].length
    while (cursor < source.length && depth > 0) {
      const character = source[cursor]
      if (character === '(') depth += 1
      if (character === ')') depth -= 1
      cursor += 1
    }
    calls.push(source.slice(match.index, cursor))
  }
  return calls
}

export function findForbiddenLogFields(source: string): readonly string[] {
  return extractLogCalls(source).flatMap((call) => {
    const match = FORBIDDEN_LOG_FIELD.exec(call)
    return match === null ? [] : [match[0]]
  })
}

describe('o alarme do retorno vencido não loga dado pessoal (spec 248 T4.11)', () => {
  test('o detector reprova e-mail, nome de arquivo, CNPJ e número de nota num log', () => {
    const bad = [
      "safeLogInfo({ logger, message: 'x', metadata: { toAddress } })",
      "logger.warn('x', { fileName })",
      "safeLogWarn({ logger, message: 'x', metadata: { cnpj } })",
      "safeLogInfo({ logger, message: 'x', metadata: { invoiceNumber } })",
      "safeLogInfo({ logger, message: 'x', metadata: { occurrenceLabel } })",
    ]
    for (const snippet of bad) expect(findForbiddenLogFields(snippet)).not.toEqual([])
  })

  test('o detector aceita log só de ids e números', () => {
    const good =
      "safeLogInfo({ logger, message: 'x', metadata: { ...counters, correlationId, executionId } })"
    expect(extractLogCalls(good)).toHaveLength(1)
    expect(findForbiddenLogFields(good)).toEqual([])
  })

  test('nenhum arquivo do alarme loga campo proibido, e há ao menos um log para vigiar', () => {
    const files = listSourceFiles(ALERT_DIRECTORY)
    expect(files.length).toBeGreaterThan(0)

    const offenders = files.flatMap((file) =>
      findForbiddenLogFields(readFileSync(file, 'utf8')).map((field) => `${file}: ${field}`),
    )
    const logCalls = files.flatMap((file) => extractLogCalls(readFileSync(file, 'utf8')))

    expect(offenders).toEqual([])
    expect(logCalls.length).toBeGreaterThan(0)
  })

  test('nenhum arquivo do alarme usa console', () => {
    for (const file of listSourceFiles(ALERT_DIRECTORY)) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/console\./u)
    }
  })
})
