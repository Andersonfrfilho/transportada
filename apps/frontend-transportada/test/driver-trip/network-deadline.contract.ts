/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  DriverTripRequestError,
} from '@/modules/driver-trip/shared/driverTripClient.service'

const PROOF_FILE = new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' })

/**
 * Conexão presa: o socket abre e nunca anda.
 *
 * ⚠️ O cliente chama `fetch(new Request(url, init))` — com **um** argumento. O sinal viaja no
 * `Request`, não num `init`, e um dublê que o procurasse em `init` nunca veria o aborto.
 */
function neverSettlingFetch(input: RequestInfo | URL): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const { signal } = input as Request
    signal.addEventListener('abort', () => reject(new Error('AbortError')), { once: true })
  })
}

function attachProof(client: ReturnType<typeof createDriverTripClient>): Promise<unknown> {
  return client.attachProof({ documentId: 'doc-1', file: PROOF_FILE, kind: 'photo' })
}

/**
 * ⚠️ **Defeito de produção, 02/10 — e é este o aplicativo que o campo usa.** Enquanto
 * `VITE_DRIVER_APP_URL` estiver desligado, o painel é quem serve `/minha-viagem`.
 *
 * Nenhuma espera de rede tinha teto. Num celular com sinal preso o `fetch` do comprovante nunca se
 * resolvia; a drenagem é uma por vez com trava (`isDrainingRef`), e sem o `onSettled` a trava não
 * abria. Pior: `isSyncing` é o `drain.isPending`, e ele desabilita "Enviar agora" e "Enviar todos
 * agora" na tela de pendentes — o motorista ficava olhando o comprovante na fila com todos os
 * botões apagados, sem nenhuma saída que não recarregar o aplicativo. Medido: entrega registrada
 * (`POST .../deliver` 201 às 12:33:42) e nenhuma requisição ao `/proof` jamais saiu do aparelho.
 */
describe('toda espera de rede tem teto (defeito de produção 02/10)', () => {
  it('a subida do comprovante presa falha como OFFLINE em vez de pendurar para sempre', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => neverSettlingFetch(input),
      getAccessToken: () => Promise.resolve('token'),
      timeouts: { uploadMilliseconds: 20 },
    })

    const error = await attachProof(client).then(
      () => undefined,
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(DriverTripRequestError)
    expect((error as DriverTripRequestError).code).toBe('OFFLINE')
    /** `isOffline` é o que devolve o anexo para a fila em vez de marcá-lo como recusado. */
    expect((error as DriverTripRequestError).isOffline).toBe(true)
  })

  it('o refresh do token preso também falha, antes de a requisição sair', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () => Promise.reject(new Error('não deveria chegar aqui')),
      getAccessToken: () => new Promise<string>(() => undefined),
      timeouts: { accessTokenMilliseconds: 20 },
    })

    const error = await attachProof(client).then(
      () => undefined,
      (caught: unknown) => caught,
    )

    expect((error as DriverTripRequestError).code).toBe('OFFLINE')
  })

  it('a promessa assenta: sem isso a trava e o isSyncing nunca se soltariam', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: (input) => neverSettlingFetch(input),
      getAccessToken: () => Promise.resolve('token'),
      timeouts: { uploadMilliseconds: 20 },
    })

    const settled = await Promise.race([
      attachProof(client).then(
        () => 'resolvida',
        () => 'rejeitada',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('pendurada'), 2_000)),
    ])

    expect(settled).toBe('rejeitada')
  })
})
