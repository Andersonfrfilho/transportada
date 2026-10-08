/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  DriverTripRequestError,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import { createDrainScheduler } from '@/modules/driver-trip/shared/pendingQueue.service'

const PROOF_FILE = new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' })

/**
 * Conexão presa: o socket abre e nunca anda. Foi o que prendeu o comprovante em produção.
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

function createStalledClient(timeouts: {
  readonly accessTokenMilliseconds?: number
  readonly uploadMilliseconds?: number
}) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => neverSettlingFetch(input),
    getAccessToken: () => Promise.resolve('token'),
    timeouts,
  })
}

function attachProof(client: ReturnType<typeof createDriverTripClient>): Promise<unknown> {
  return client.attachProof({ documentId: 'doc-1', file: PROOF_FILE, kind: 'photo' })
}

/**
 * ⚠️ **Defeito de produção, 02/10.** Nenhuma espera de rede tinha teto. Num celular com sinal preso
 * o `fetch` do comprovante nunca se resolvia; a drenagem é uma mutação única com trava, e sem o
 * `onSettled` a trava não abria — todo envio seguinte era engolido, inclusive o "Enviar agora". A
 * entrega ficou registrada (`POST .../deliver` 201 às 12:33:42) e nenhuma requisição ao `/proof`
 * jamais saiu do aparelho; a tela dizia "aguardando envio" com a rede já boa, e só recarregar o
 * aplicativo destravava.
 *
 * O teto estourado é rede que não respondeu (`OFFLINE`): o anexo fica na fila e vai de novo.
 */
describe('toda espera de rede tem teto (defeito de produção 02/10)', () => {
  it('a subida do comprovante presa falha como OFFLINE em vez de pendurar para sempre', async () => {
    const client = createStalledClient({ uploadMilliseconds: 20 })

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

  it('a promessa assenta: sem isso a trava da drenagem nunca abriria', async () => {
    const client = createStalledClient({ uploadMilliseconds: 20 })

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

/**
 * Defesa em profundidade: mesmo que uma drenagem futura deixe de assentar por outro motivo, a fila
 * volta a andar sozinha. A trava já ficou presa uma vez por um caminho que ninguém previu (o
 * `onSettled` do observador desmontado sob StrictMode, documentado em `useDriverTrip.hook.ts`).
 */
describe('a trava da drenagem não fica presa para sempre', () => {
  /**
   * ⚠️ A drenagem geral roda com `only === undefined`, e `toEqual` **ignora `undefined` em array**:
   * `expect([undefined]).toEqual([undefined, undefined])` passa. A primeira versão deste teste
   * passava com o cão de guarda arrancado. O sentinela e o `length` são o que o prendem.
   */
  const FULL_DRAIN = 'geral'
  function recordRun(runs: string[]): (only: string | undefined) => void {
    return (only) => runs.push(only ?? FULL_DRAIN)
  }

  it('o cão de guarda devolve o direito de tentar de novo', () => {
    const runs: string[] = []
    let release: (() => void) | undefined
    const scheduler = createDrainScheduler({
      run: recordRun(runs),
      scheduleWatchdog: (fire) => {
        release = fire
        return () => undefined
      },
    })

    scheduler.request(undefined, 'immediate')
    expect(runs).toEqual([FULL_DRAIN])

    /** Drenagem que nunca assenta: sem o cão de guarda, daqui em diante tudo era engolido. */
    scheduler.request(undefined, 'immediate')
    expect(runs).toEqual([FULL_DRAIN])

    expect(release).toBeDefined()
    release?.()
    expect(runs).toEqual([FULL_DRAIN, FULL_DRAIN])
    expect(runs).toHaveLength(2)
  })

  it('a drenagem abandonada, ao terminar, não abre a trava da que a substituiu', () => {
    const runs: string[] = []
    let release: (() => void) | undefined
    const scheduler = createDrainScheduler({
      run: recordRun(runs),
      scheduleWatchdog: (fire) => {
        release = fire
        return () => undefined
      },
    })

    scheduler.request('chave-a', 'immediate')
    scheduler.request('chave-b', 'immediate')
    scheduler.request('chave-c', 'immediate')
    expect(runs).toEqual(['chave-a'])

    /** O cão de guarda abandona a drenagem de 'chave-a' e deixa a de 'chave-b' começar. */
    release?.()
    expect(runs).toEqual(['chave-a', 'chave-b'])

    /** Agora a de 'chave-a' finalmente termina: 'chave-c' **não** pode começar junto com 'chave-b'. */
    scheduler.settled()
    expect(runs).toEqual(['chave-a', 'chave-b'])
    expect(runs).toHaveLength(2)

    /** Quando a de 'chave-b' termina de verdade, a fila volta a andar. */
    scheduler.settled()
    expect(runs).toEqual(['chave-a', 'chave-b', 'chave-c'])
  })
})
