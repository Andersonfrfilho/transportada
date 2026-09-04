/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import { isAwaitingDispatch } from '../../src/modules/driver-trip/shared/driverTripView.service'

const WORKSPACE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)
const CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)
const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)

function createCapturingClient(requests: Request[]) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      requests.push(input as Request)
      return Promise.resolve(
        new Response('{"data":{}}', { headers: { 'content-type': 'application/json' } }),
      )
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

/**
 * Spec 082 (revisão, CRITICAL): o snapshot inclui viagem `route_planned`, e é o motorista quem
 * inicia o trajeto. Antes disso as ações de campo ficam trancadas — a API recusa essas escritas, e
 * a fila offline não pode acumular eventos condenados.
 */
describe('iniciar trajeto (route_planned)', () => {
  const workspace = readFileSync(WORKSPACE, 'utf8')
  const card = readFileSync(CARD, 'utf8')

  it('o cliente despacha por POST /me/trips/current/dispatch', async () => {
    const requests: Request[] = []
    await createCapturingClient(requests).dispatchTrip({ tripId: 'trip-1' })

    expect(requests[0]?.url).toBe('https://api.test/me/trips/current/dispatch')
    expect(requests[0]?.method).toBe('POST')
    expect(await requests[0]?.json()).toEqual({ tripId: 'trip-1' })
  })

  it('só route_planned aguarda início', () => {
    const trip = { id: 't', manifest: null, status: 'route_planned', stops: [], vehiclePlate: 'A' }
    expect(isAwaitingDispatch(trip)).toBe(true)
    expect(isAwaitingDispatch({ ...trip, status: 'dispatched' })).toBe(false)
    expect(isAwaitingDispatch({ ...trip, status: 'in_transit' })).toBe(false)
  })

  it('a tela mostra o botão primário e refaz o snapshot no sucesso', () => {
    expect(workspace).toInclude('isAwaitingDispatch')
    expect(workspace).toInclude("t('dispatch.start')")
    expect(workspace).toInclude('dispatchTrip({ tripId })')
    expect(workspace).toInclude('driverTrip.refetchTrip()')
    expect(workspace).toInclude('isFieldWorkBlocked={isTripAwaitingDispatch}')
  })

  it('as ações de campo ficam trancadas com aviso enquanto o trajeto não começa', () => {
    expect(card).toInclude('isFieldWorkBlocked')
    expect(card).toInclude("t('dispatch.waiting')")
    expect(driverTrip.dispatch.start).toBe('Iniciar trajeto')
    expect(driverTrip.dispatch.waiting.toLowerCase()).toInclude('aguardando')
    expect(driverTripEn.dispatch.start).toBeString()
    expect(driverTripEn.dispatch.waiting).toBeString()
  })
})

describe('a fila offline no hook (revisão 082)', () => {
  const hook = readFileSync(HOOK, 'utf8')

  /**
   * 4a: uma drenagem por vez — duas em paralelo mandariam o mesmo evento duas vezes.
   *
   * ⚠️ **Mas o pedido concorrente não é mais descartado, e essa parte da 082 estava errada.** Ela
   * dizia "o gatilho seguinte (rede, refetch, manual) pega o que sobrou" — só que os gatilhos são a
   * rede voltando e a montagem da tela, e com a rede boa nenhum dos dois acontece. O toque do
   * motorista caía nessa janela e a confirmação ficava parada na fila **indefinidamente**, com a
   * tela dizendo "aguardando envio" e a conexão perfeita.
   *
   * Decisão de quem responde pelo produto, em 2026-09-04: ao voltar a conexão — e em qualquer
   * gatilho — os eventos que faltam têm de sair. O pedido que chega ocupado marca uma repetição, e
   * ela roda quando a atual termina. Continua sendo uma por vez.
   */
  it('a drenagem é single-flight, e o pedido concorrente reexecuta em vez de sumir', () => {
    expect(hook).toInclude('isDrainingRef')
    expect(hook).toInclude('hasPendingDrainRef')
    expect(hook).toInclude('requestDrain')
    expect(hook).not.toInclude('drain.mutate(undefined)')
    /** O que não pode voltar: largar o pedido sem deixar rastro de que ele existiu. */
    expect(hook).not.toInclude('if (isDrainingRef.current) return\n')
  })

  /**
   * ⚠️ **A trava se libera no `onSettled` da mutação, nunca no callback do `mutate()`** — e a
   * diferença trancava a fila para sempre. Callback passado a `mutate(vars, {...})` não roda se o
   * observador for desmontado antes de a mutação terminar, e o `useEffect` de montagem roda duas
   * vezes sob StrictMode: a primeira drenagem terminava com o observador já descartado, o
   * `onSettled` nunca disparava, e `isDrainingRef` — que é `useRef` e sobrevive à remontagem —
   * ficava `true` pelo resto da vida da tela. Medido pelo smoke do motorista: a confirmação
   * enfileirava e nunca saía, com a tela dizendo "aguardando envio" e a rede perfeita.
   *
   * Fora do StrictMode o sintoma some, e foi por isso que ele sobreviveu — mas navegar para fora e
   * voltar durante uma drenagem trancaria a fila do mesmo jeito em produção.
   */
  it('a trava da drenagem se libera pela mutação, não pelo callback da chamada', () => {
    const chamada = hook.slice(hook.indexOf('drain.mutate'))
    expect(chamada.slice(0, 60)).not.toInclude('onSettled')

    const mutacao = hook.slice(
      hook.indexOf('const drain = useMutation'),
      hook.indexOf('const requestDrain = useCallback'),
    )
    expect(mutacao).toInclude('onSettled')
    expect(mutacao).toInclude('isDrainingRef.current = false')
  })

  /** 4b: a chave do anexo nasce na captura e vai nos dois caminhos — fila e multipart direto. */
  it('a chave do anexo nasce na captura e acompanha o multipart direto', () => {
    expect(hook).toInclude('const attachmentKey = createIdempotencyKey()')
    expect(hook).toInclude('attachProof({ ...input, attachmentKey })')
    expect(hook).toInclude('attachmentKey: attachment.attachmentKey')
  })

  /** 5: o teto tipado da fila de eventos chega à tela como recusa anunciada, no locale. */
  it('o teto de eventos recusa tipado e a mensagem existe nos dois locales', () => {
    expect(driverTrip.eventLimitCount.toLowerCase()).toInclude('nada foi descartado')
    expect(driverTripEn.eventLimitCount).toBeString()
    const workspace = readFileSync(WORKSPACE, 'utf8')
    expect(workspace).toInclude("t('eventLimitCount')")
    expect(workspace).toInclude("outcome === 'count-limit'")
  })
})

describe('o attachmentKey no multipart de comprovante', () => {
  it('sobe como campo do FormData quando presente', async () => {
    const requests: Request[] = []
    await createCapturingClient(requests).attachProof({
      attachmentKey: 'anexo-1',
      documentId: 'document-1',
      file: new File([new Uint8Array(4)], 'canhoto.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })

    const form = await requests[0]?.formData()
    expect(form?.get('attachmentKey')).toBe('anexo-1')
    expect(form?.get('kind')).toBe('photo')
  })
})
