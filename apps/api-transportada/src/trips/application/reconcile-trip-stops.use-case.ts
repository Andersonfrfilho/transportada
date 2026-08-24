/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildStopAddressKey, type StopAddressComponents } from '../domain/stop-address-key.js'

export type TripStopRecord = {
  readonly addressKey: string
  readonly id: string
  readonly sequence: bigint
}

/**
 * Escopo mínimo que o reconciliador precisa do banco. `T012` liga isso a `drizzle-trip.repository.ts`
 * quando as rotas de vínculo passarem a chamar este use case — hoje ele é testável sozinho, com um
 * port falso, como `trip.use-case.ts` já faz para o resto do módulo.
 */
export type TripStopReconciliationPort = {
  countLiveDocumentsAtStop(input: {
    readonly companyId: string
    readonly stopId: string
  }): Promise<number>
  createStop(input: {
    readonly addressKey: string
    readonly companyId: string
    readonly label: string
    readonly sequence: bigint
    readonly tripId: string
  }): Promise<TripStopRecord>
  deleteStop(input: { readonly companyId: string; readonly stopId: string }): Promise<void>
  findStopByAddressKey(input: {
    readonly addressKey: string
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStopRecord | null>
  /** Próxima posição livre na sequência da viagem — 1 quando ainda não há paradas. */
  nextStopSequence(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<bigint>
}

export type ReconcileStopOnLinkInput = {
  readonly addressComponents: StopAddressComponents
  readonly companyId: string
  readonly label: string
  readonly repository: TripStopReconciliationPort
  readonly tripId: string
}

/**
 * ADR-0043 §3: vincular uma nota cria a parada se não existir, ou reaproveita a que já agrupa
 * aquele endereço. `null` quando o CEP não normaliza — a nota cai fora de qualquer parada, e T010
 * é quem decide o que fazer com uma viagem que tem nota assim (o balde `SEM ENDEREÇO`).
 */
export async function reconcileStopOnLink(
  input: ReconcileStopOnLinkInput,
): Promise<TripStopRecord | null> {
  const { addressComponents, companyId, label, repository, tripId } = input
  const addressKey = buildStopAddressKey(addressComponents)
  if (addressKey === null) return null

  const existing = await repository.findStopByAddressKey({ addressKey, companyId, tripId })
  if (existing !== null) return existing

  const sequence = await repository.nextStopSequence({ companyId, tripId })
  return repository.createStop({ addressKey, companyId, label, sequence, tripId })
}

export type ReconcileStopOnUnlinkInput = {
  readonly companyId: string
  readonly repository: TripStopReconciliationPort
  /** `null` é o caso comum: nota que nunca chegou a ter parada (CEP inválido, ou ainda não vinculada). */
  readonly stopId: string | null
}

export type ReconcileStopOnUnlinkResult = {
  readonly deleted: boolean
}

/**
 * ADR-0043 §3: desvincular a última nota de uma parada apaga a parada. Chamar **depois** de a
 * nota já ter perdido a referência ao `stopId` — senão ela mesma se conta como "ainda ligada" e a
 * parada nunca esvazia.
 */
export async function reconcileStopOnUnlink(
  input: ReconcileStopOnUnlinkInput,
): Promise<ReconcileStopOnUnlinkResult> {
  const { companyId, repository, stopId } = input
  if (stopId === null) return { deleted: false }

  const remaining = await repository.countLiveDocumentsAtStop({ companyId, stopId })
  if (remaining > 0) return { deleted: false }

  await repository.deleteStop({ companyId, stopId })
  return { deleted: true }
}
