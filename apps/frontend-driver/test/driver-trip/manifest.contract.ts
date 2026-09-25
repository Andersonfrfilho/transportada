/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '@/modules/driver-trip/shared/driverTripClient.service'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'

const MANIFEST_ID = '00000000-0000-4000-8000-000000000002'
const ACCESS_KEY = '35260712345678000199580010000000011000000017'

function buildSnapshot(manifest: unknown): unknown {
  return {
    data: {
      isRegisteredDriver: true,
      trips: [{ id: 'trip', manifest, status: 'in_transit', stops: [], vehiclePlate: 'GCQ8E47' }],
    },
  }
}

function buildClient(handler: (request: Request) => Promise<Response>) {
  const seen: Request[] = []
  return {
    client: createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => {
        const request = input as Request
        seen.push(request)
        return handler(request)
      },
      getAccessToken: () => Promise.resolve('token-de-mentira'),
    }),
    seen,
  }
}

describe('o MDF-e na mão do motorista', () => {
  /** Carga urbana não tem manifesto: ausência é o caso normal, e não pode virar recusa de resposta. */
  it('aceita a viagem sem manifesto', () => {
    const snapshot = toDriverTripSnapshot(buildSnapshot(null))

    expect(snapshot.trips[0]?.manifest).toBeNull()
  })

  it('recusa manifesto pela metade, porque sem chave não há o que apresentar', () => {
    expect(() => toDriverTripSnapshot(buildSnapshot({ id: MANIFEST_ID }))).toThrow()
  })

  it('lê chave, protocolo e id quando o manifesto autorizou', () => {
    const snapshot = toDriverTripSnapshot(
      buildSnapshot({
        accessKey: ACCESS_KEY,
        authorizedAt: '2026-08-26T12:16:10.000Z',
        id: MANIFEST_ID,
        protocol: '135260000000099',
      }),
    )

    expect(snapshot.trips[0]?.manifest?.accessKey).toBe(ACCESS_KEY)
    expect(snapshot.trips[0]?.manifest?.id).toBe(MANIFEST_ID)
  })

  /**
   * O DAMDFE vem como bytes e o nome do arquivo é o que o servidor mandou — é ele que carrega a
   * chave, e um `damdfe.pdf` genérico some entre downloads no celular.
   */
  it('traz o DAMDFE com o nome que o servidor deu', async () => {
    const { client, seen } = buildClient(() =>
      Promise.resolve(
        new Response(new Blob(['%PDF-1.3']), {
          headers: { 'content-disposition': `attachment; filename="damdfe-${ACCESS_KEY}.pdf"` },
        }),
      ),
    )

    const file = await client.readManifestDamdfe(MANIFEST_ID)

    expect(file.fileName).toBe(`damdfe-${ACCESS_KEY}.pdf`)
    expect(seen[0]?.url).toBe(`https://api.test/me/trips/current/manifests/${MANIFEST_ID}/damdfe`)
  })

  it('cai no nome padrão quando o servidor não nomeia o arquivo', async () => {
    const { client } = buildClient(() => Promise.resolve(new Response(new Blob(['%PDF-1.3']))))

    expect((await client.readManifestDamdfe(MANIFEST_ID)).fileName).toBe('damdfe.pdf')
  })

  /** O código da recusa sobe como veio: é ele que a tela traduz, e um genérico apagaria o motivo. */
  it('sobe o código quando o manifesto ainda não autorizou', async () => {
    const { client } = buildClient(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'DAMDFE_DOCUMENT_NOT_AUTHORIZED' } }), {
          status: 422,
        }),
      ),
    )

    const error = await client.readManifestDamdfe(MANIFEST_ID).catch((caught: unknown) => caught)

    expect((error as { code: string }).code).toBe('DAMDFE_DOCUMENT_NOT_AUTHORIZED')
  })

  it('o XML sai por URL assinada, e a resposta torta é recusada', async () => {
    const { client } = buildClient(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              accessKey: ACCESS_KEY,
              downloadUrl: 'https://bucket.test/assinada',
              expiresAt: '2026-08-26T12:21:10.000Z',
            },
          }),
        ),
      ),
    )

    expect((await client.readManifestXml(MANIFEST_ID)).downloadUrl).toBe(
      'https://bucket.test/assinada',
    )

    const broken = buildClient(() => Promise.resolve(new Response(JSON.stringify({ data: {} }))))
    expect(broken.client.readManifestXml(MANIFEST_ID)).rejects.toThrow()
  })
})
