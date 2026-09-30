/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 220 RF30 / CA13: **conferência, não portão**. Nenhum veredito do canhoto impede confirmar
 * entrega, despachar viagem, emitir CT-e ou faturar.
 *
 * A prova é por texto de fonte, como a da spec 082: um portão novo compila, passa em todo teste de
 * caminho feliz e só aparece no dia em que a operação trava por causa de uma foto torta. Se nenhum
 * caminho de decisão **lê** a coluna, nenhum caminho de decisão pode barrar por ela.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

const SOURCE_ROOT = new URL('../../src/', import.meta.url).pathname
const CANHOTO_REVIEW_MENTION = /canhotoReview|canhoto_review/u

/**
 * Quem pode falar do veredito: o módulo que o escreve, a tabela que o guarda, o `main.ts`, que só
 * liga a rota, e a fila de fotos pendentes do motorista, que a RF29 manda reabrir na recusa — dar
 * trabalho de volta a quem tirou a foto não é barrar entrega, viagem, CT-e nem fatura.
 *
 * Arquivo novo nesta lista é decisão de projeto, não descuido — por isso ela é exata.
 */
const CONFERENCE_MODULE = [
  'database/trip.schema.ts',
  'main.ts',
  'trips/application/canhoto-review.port.ts',
  'trips/domain/canhoto-review-decision.policy.ts',
  'trips/domain/canhoto-review.policy.ts',
  'trips/infrastructure/drizzle-canhoto-review.repository.ts',
  'trips/infrastructure/drizzle-current-driver-trip.repository.ts',
  'trips/presentation/canhoto-review.routes.ts',
] as const

/** Os quatro portões que a CA13 nomeia, e os caminhos vizinhos por onde cada um passa. */
const GATES = [
  'billing/application/billing.use-case.ts',
  'trips/application/create-trip-cte-batch.use-case.ts',
  'trips/application/dispatch-driver-trip.use-case.ts',
  'trips/application/dispatch-trip.use-case.ts',
  'trips/application/document-outcome.service.ts',
  'trips/application/read-trip-fiscal-readiness.use-case.ts',
  'trips/application/report-document-delivery.use-case.ts',
  'trips/application/try-auto-dispatch-trip.use-case.ts',
  'trips/domain/trip-manifest.policy.ts',
] as const

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: false })
    .map(String)
    .filter((entry) => entry.endsWith('.ts'))
}

const mentioningFiles = listSourceFiles(SOURCE_ROOT)
  .filter((file) => CANHOTO_REVIEW_MENTION.test(readFileSync(join(SOURCE_ROOT, file), 'utf8')))
  .sort()

describe('o veredito do canhoto não é portão (spec 220 CA13)', () => {
  /** Varredura vazia passaria em tudo e não provaria nada. */
  it('a varredura acha o módulo que ela existe para vigiar', () => {
    expect(mentioningFiles).toContain('trips/presentation/canhoto-review.routes.ts')
    expect(mentioningFiles).toContain('database/trip.schema.ts')
  })

  it('só o módulo de conferência fala do veredito', () => {
    expect(mentioningFiles).toEqual([...CONFERENCE_MODULE].sort())
  })

  for (const gate of GATES) {
    it(`src/${gate} decide sem olhar o veredito`, () => {
      const source = readFileSync(join(SOURCE_ROOT, gate), 'utf8')

      expect(CANHOTO_REVIEW_MENTION.test(source)).toBe(false)
    })
  }
})
