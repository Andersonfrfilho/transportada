/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Pedido do usuário (01/10): quando o aparelho não tem a miniatura — foto anexada pelo escritório,
 * celular trocado, 24 h vencidas —, a foto do canhoto vem do servidor, por URL assinada.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '@/modules/driver-trip/shared/driverTripClient.service'

const HOOK = new URL(
  '../../src/modules/driver-trip/hooks/useStoredProofThumbnail.hook.ts',
  import.meta.url,
)
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000010'

function createClient(body: string, requests: Request[] = []) {
  return {
    client: createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        requests.push(input as Request)
        return Promise.resolve(
          new Response(body, { headers: { 'content-type': 'application/json' } }),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    }),
    requests,
  }
}

describe('a leitura do canhoto no servidor', () => {
  it('lê a rota da nota, no caminho /me, com GET', async () => {
    const { client, requests } = createClient('{"data":[]}')
    await client.readDeliveryProofs(DOCUMENT_ID)

    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe(
      `https://api.test/me/trips/current/documents/${DOCUMENT_ID}/proof`,
    )
  })

  it('devolve a miniatura e o original de cada comprovante', async () => {
    const { client } = createClient(
      '{"data":[{"id":"p1","kind":"photo","createdAt":"2026-10-01T12:00:00.000Z","downloadUrl":"https://bucket.test/original","expiresAt":"2026-10-01T12:05:00.000Z","thumbnailUrl":"https://bucket.test/mini"}]}',
    )
    const proofs = await client.readDeliveryProofs(DOCUMENT_ID)

    expect(proofs).toEqual([
      {
        downloadUrl: 'https://bucket.test/original',
        id: 'p1',
        kind: 'photo',
        thumbnailUrl: 'https://bucket.test/mini',
      },
    ])
  })

  it('entrega sem canhoto é lista vazia, nunca erro', async () => {
    const { client } = createClient('{"data":[]}')
    expect(await client.readDeliveryProofs(DOCUMENT_ID)).toEqual([])
  })

  it('corpo fora do contrato não vira meia tela', async () => {
    const { client } = createClient('{"data":[{"id":"p1","kind":"foto"}]}')
    let failed = false
    await client.readDeliveryProofs(DOCUMENT_ID).catch(() => {
      failed = true
    })

    expect(failed).toBe(true)
  })
})

describe('a ordem das duas fontes da miniatura', () => {
  const source = readFileSync(HOOK, 'utf8')

  /** O aparelho abre na hora e funciona sem sinal; a rede é a saída, não a primeira escolha. */
  it('a rede só é consultada quando o aparelho não tem a miniatura', () => {
    expect(source).toInclude('enabled: enabled && canSync && isDeviceEmpty')
    expect(source).toInclude('if (previewUrl !== undefined) return previewUrl')
  })

  it('a URL assinada não é relida a cada montagem', () => {
    expect(source).toInclude('staleTime')
  })

  it('a foto é a do canhoto, nunca a da mercadoria nem a assinatura', () => {
    expect(source).toInclude("proof.kind === 'photo'")
  })

  it('sem miniatura no servidor, cai no original', () => {
    expect(source).toInclude('photo.thumbnailUrl ?? photo.downloadUrl')
  })
})
