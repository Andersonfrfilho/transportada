/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão final da spec 154 (T502, defeito D-8): as duas rotas de escrita do extrato subiram sem
 * teto próprio. `POST /extracts` aceita até 1 MiB direto para o bucket, e a recarga baixa o objeto
 * e calcula o sha256 **antes** de pegar a trava (de propósito, para encurtar o lock) — então N
 * chamadas concorrentes pagam N downloads para receber N × 409. A security.md §3 pede teto mais
 * duro em rota que dispara custo externo, e o precedente do repositório é
 * `aggregate-application-attachment.routes.ts` (`UPLOAD_RATE_LIMIT`).
 *
 * O balde é o de memória, por usuário: uma réplica hoje (`.railway/railway.ts`), e o custo aqui é
 * do processo que atende (banda e CPU do sha256), não de um terceiro cobrado por chamada — o balde
 * compartilhado no Postgres existe para envio de e-mail, que é custo externo de verdade.
 */
import { describe, expect, test } from 'bun:test'

import {
  TOLL_BOOTH_CATALOG_RELOAD_RATE_LIMIT,
  TOLL_BOOTH_EXTRACT_UPLOAD_RATE_LIMIT,
} from '../../src/toll-booths/presentation/toll-booth-extract.rate-limit.js'
import {
  buildExtractRow,
  createReloadFixture,
  encodeExtract,
  RELOAD_BOOTH_ROW,
} from '../fixtures/toll-booth-reload-http.fixture.js'
import { createExtractUploadFixture } from '../fixtures/toll-booth-extract-http.fixture.js'

const QUERY = '?dataset=sudeste&observedOn=2026-09-14'
const EXTRACT_BYTES = encodeExtract([RELOAD_BOOTH_ROW])

describe('teto das rotas de escrita do extrato (spec 154, revisão final D-8)', () => {
  test('a recarga responde 429 com retry-after depois do teto, no mesmo usuário', async () => {
    const fixture = createReloadFixture({
      extract: buildExtractRow(EXTRACT_BYTES),
      objectBytes: EXTRACT_BYTES,
    })

    for (
      let attempt = 0;
      attempt < TOLL_BOOTH_CATALOG_RELOAD_RATE_LIMIT.maxRequests;
      attempt += 1
    ) {
      const allowed = await fixture.handle(QUERY)
      expect(allowed.status).toBe(200)
    }

    const throttled = await fixture.handle(QUERY)
    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('retry-after')).not.toBeNull()
  })

  test('a recarga recusada pelo teto não baixa o objeto nem toca a trava', async () => {
    const fixture = createReloadFixture({
      extract: buildExtractRow(EXTRACT_BYTES),
      objectBytes: EXTRACT_BYTES,
    })

    for (
      let attempt = 0;
      attempt < TOLL_BOOTH_CATALOG_RELOAD_RATE_LIMIT.maxRequests;
      attempt += 1
    ) {
      await fixture.handle(QUERY)
    }
    const eventsBeforeThrottle = [...fixture.events]

    const throttled = await fixture.handle(QUERY)

    expect(throttled.status).toBe(429)
    expect(fixture.events).toEqual(eventsBeforeThrottle)
  })

  test('a subida do extrato responde 429 depois do teto, sem chamar o use case', async () => {
    const fixture = await createExtractUploadFixture()

    for (
      let attempt = 0;
      attempt < TOLL_BOOTH_EXTRACT_UPLOAD_RATE_LIMIT.maxRequests;
      attempt += 1
    ) {
      const allowed = await fixture.handle(fixture.postRequest(QUERY, [RELOAD_BOOTH_ROW]))
      expect(allowed.status).toBe(201)
    }
    const callsBeforeThrottle = fixture.createExtractCalls.length

    const throttled = await fixture.handle(fixture.postRequest(QUERY, [RELOAD_BOOTH_ROW]))

    expect(throttled.status).toBe(429)
    expect(throttled.headers.get('retry-after')).not.toBeNull()
    expect(fixture.createExtractCalls.length).toBe(callsBeforeThrottle)
  })

  test('a listagem dos extratos não tem teto próprio — leitura barata, sem efeito externo', async () => {
    const fixture = await createExtractUploadFixture()

    for (
      let attempt = 0;
      attempt < TOLL_BOOTH_EXTRACT_UPLOAD_RATE_LIMIT.maxRequests + 2;
      attempt += 1
    ) {
      const response = await fixture.handle(fixture.getRequest())
      expect(response.status).toBe(200)
    }
  })
})
