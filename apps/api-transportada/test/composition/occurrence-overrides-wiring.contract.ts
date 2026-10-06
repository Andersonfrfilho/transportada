/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF6, D-b): a exceção do contratante/destinatário só vale no registro se cada ponto que
 * monta `registerDriverOccurrence` em `main.ts` injetar a leitura das exceções do tipo — a porta é
 * opcional para os dublês de teste, então esquecê-la **não dá erro de tipo**: a exceção deixaria de
 * valer em silêncio. Os dois pontos: o app/PWA (`/me`) e o WhatsApp do motorista. Varredura do
 * texto-fonte, no molde de `event-location-wiring.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const MAIN_TS_PATH = new URL('../../src/main.ts', import.meta.url)
const CALL = 'await registerDriverOccurrence({'
const OVERRIDES_WIRING = 'findOccurrenceTypeOverrides:'

function extractCallSites(source: string): readonly string[] {
  const sites: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf(CALL, from)
    if (start === -1) return sites
    const end = source.indexOf('unitOfWork:', start)
    sites.push(source.slice(start, end))
    from = end
  }
}

describe('fiação das exceções do tipo no registro do motorista, em main.ts (246 RF6)', () => {
  const sites = extractCallSites(readFileSync(MAIN_TS_PATH, 'utf8'))

  test('existem os dois pontos: o app e o WhatsApp', () => {
    expect(sites).toHaveLength(2)
  })

  test.each([0, 1])('o ponto %d injeta a leitura das exceções do tipo', (index) => {
    expect(sites[index]).toContain(OVERRIDES_WIRING)
    expect(sites[index]).toContain('listOverridesForTypes')
  })
})
