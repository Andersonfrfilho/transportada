/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { DOCUMENT_SUMMARY } from '../fixtures/nfe-http-payload.fixture'
import { documentDetailRequest, documentsListRequest } from '../fixtures/nfe-http-request.fixture'

/**
 * O `<fone>` de `<enderDest>` já era importado e guardado em `nfe_addresses` — o que faltava era a
 * listagem publicá-lo. Quem monta a viagem liga para o cliente antes de o caminhão sair, e sem este
 * campo o número existia no banco sem nenhum caminho até a tela.
 *
 * ⚠️ O contrato afirma o **cru**: a máscara é de quem imprime. O emitente preenche `<fone>` como
 * quer — com DDD, sem DDD, com pontuação —, e normalizar no servidor apagaria a diferença entre
 * "este telefone não tem DDD" e "o DDD foi jogado fora no caminho".
 */
describe('recipient phone on the NF-e document listing', () => {
  test('serves the phone exactly as the issuer wrote it', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentsListRequest())
    const body = (await response.json()) as {
      readonly data: readonly { readonly recipientPhone: string | null }[]
    }

    expect(response.status).toBe(200)
    expect(body.data.at(0)?.recipientPhone).toBe(DOCUMENT_SUMMARY.recipientPhone)
  })

  test('serves it on the detail route too, so both surfaces read the same note', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentDetailRequest())
    const body = (await response.json()) as {
      readonly data: { readonly recipientPhone: string | null }
    }

    expect(response.status).toBe(200)
    expect(body.data.recipientPhone).toBe(DOCUMENT_SUMMARY.recipientPhone)
  })

  /** Nota sem `<fone>` é o caso normal, e ausência é `null` — nunca string vazia, que a tela imprimiria. */
  test('carries absence as null instead of an empty string', async () => {
    const fixture = await createNfeHttpFixture({
      documentList: {
        items: [{ ...DOCUMENT_SUMMARY, recipientPhone: null }],
        nextCursor: null,
      },
    })

    const response = await fixture.handle(documentsListRequest())
    const body = (await response.json()) as {
      readonly data: readonly { readonly recipientPhone: string | null }[]
    }

    expect(body.data.at(0)?.recipientPhone).toBeNull()
  })
})
