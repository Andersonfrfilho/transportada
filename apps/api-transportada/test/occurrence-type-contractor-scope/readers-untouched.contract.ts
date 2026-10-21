/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T2.6 (RF8): o escopo é para registrar, não para ler. Nenhum leitor de ocorrência já registrada
 * (feed, detalhe, linha do tempo, rota do motorista da 266, correção) lê o escopo do tipo.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const READERS = [
  'trip-occurrence-feed.query.ts',
  'trip-occurrence-detail.query.ts',
  'trip-occurrence-timeline.query.ts',
  'drizzle-driver-route-occurrence.repository.ts',
  'drizzle-occurrence-correction.repository.ts',
  'occurrence-correction-read.query.ts',
] as const

describe('spec 270 RF8: os leitores de ocorrência já registrada não conhecem o escopo do tipo', () => {
  for (const reader of READERS) {
    test(reader, () => {
      const source = readFileSync(
        new URL(`../../src/trips/infrastructure/${reader}`, import.meta.url),
        'utf8',
      )
      expect(source).not.toContain('contractorScope')
      expect(source).not.toContain('contractor_scope')
      expect(source).not.toContain('occurrence-type-contractors')
    })
  }
})
