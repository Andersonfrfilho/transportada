/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A troca do cliente da viagem do motorista, feita **uma vez** para o processo inteiro — mesmo
 * motivo de `tripClientMocks.helper.ts`: `mock.module` não se desfaz, e duas suítes trocando o
 * mesmo módulo cada uma com o seu objeto disputariam qual fica. Cada teste só reconfigura
 * `driverTripHookFakes`.
 */
import { mock } from 'bun:test'

import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'

function emptySnapshot(): DriverTripSnapshot {
  return { isRegisteredDriver: true, pendingProofs: [], score: null, trips: [] }
}

export const driverTripHookFakes: {
  /** Conta as tentativas de `send` — é o proxy de "quantas vezes a fila drenou". */
  sendCallCount: number
  snapshot: DriverTripSnapshot
} = {
  sendCallCount: 0,
  snapshot: emptySnapshot(),
}

export function resetDriverTripHookFakes(): void {
  driverTripHookFakes.sendCallCount = 0
  driverTripHookFakes.snapshot = emptySnapshot()
}

/** Antes de qualquer hook ser importado: ele tem de nascer já apontando para o falso. */
const clientModule = await import('@/modules/driver-trip/shared/driverTripClient.service')
void mock.module('@/modules/driver-trip/shared/driverTripClient.service', () => ({
  ...clientModule,
  getDriverTripClient: () => ({
    attachProof: () => Promise.reject(new Error('UNEXPECTED_ATTACH_PROOF')),
    readCurrent: () => Promise.resolve(driverTripHookFakes.snapshot),
    /**
     * Rede indisponível: o item nunca ganha `rejectionCause` (`toOutcome` só marca `rejected` para
     * erro que não seja offline), e continua drenável para sempre — é o que deixa o temporizador
     * vivo por vários gatilhos sem a fila se esvaziar sozinha no meio do teste.
     */
    send: () => {
      driverTripHookFakes.sendCallCount += 1
      return Promise.reject(
        new clientModule.DriverTripRequestError({ code: 'OFFLINE', isOffline: true }),
      )
    },
  }),
}))
