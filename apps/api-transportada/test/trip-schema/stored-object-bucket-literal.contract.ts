/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161: cinco repositórios de `src/trips/**` gravavam `bucket: 'fiscal'` em `stored_objects`
 * enquanto os bytes subiam para o bucket real configurado — a leitura assinava a URL para um host
 * que não existe, e a foto/miniatura da ocorrência respondia 403/503. Todos os outros módulos
 * (nfse, nfe, toll-booths) já gravam o bucket real. Este contrato varre o texto do módulo e reprova
 * qualquer literal de bucket, para o defeito não voltar por um repositório novo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const TRIPS_SOURCE_ROOT = new URL('../../src/trips', import.meta.url)

/** `bucket: 'algo'` ou `bucket: "algo"` num `insert(storedObjects).values({...})` ou `.set({...})`. */
const LITERAL_BUCKET_PATTERN = /\bbucket\s*:\s*['"][^'"]*['"]/g

function listSourceFiles(directory: string): readonly string[] {
  const entries = readdirSync(directory)
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(directory, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath)
    }
  }

  return files
}

describe('nenhum literal de bucket em src/trips/** (spec 161)', () => {
  test('todo `bucket:` grava a variável recebida por injeção, nunca um texto fixo', () => {
    const offenders = listSourceFiles(TRIPS_SOURCE_ROOT.pathname).flatMap((path) => {
      const content = readFileSync(path, 'utf8')
      const matches = [...content.matchAll(LITERAL_BUCKET_PATTERN)]
      return matches.map((match) => `${path}: ${match[0]}`)
    })

    expect(offenders).toEqual([])
  })
})
