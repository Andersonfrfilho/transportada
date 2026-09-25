/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTripSnapshot } from './driverTrip.types'

/**
 * O último `GET /me/trips/current`, guardado no aparelho para a app abrir sem rede (plan D5,
 * ADR-0075 §8). É dado pessoal de terceiro (destinatário, endereço) num celular que pode trocar de
 * mão, então tem **dono** e **prazo**:
 *
 * - a chave é `SHA-256(sub)` em hex — o `sub` em si nunca é gravado;
 * - o ponteiro `last` diz de quem é o snapshot que o boot sem rede pode abrir;
 * - sai quando outro `sub` autentica, depois de 24 h de `savedAt`, quando nenhuma viagem está
 *   aberta, e no "Sair". Registro em `docs/SECURITY.md`.
 */
export const TRIP_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** Viagem encerrada não se entrega mais — snapshot só com elas não tem o que mostrar sem rede. */
const CONCLUDED_TRIP_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled'])

export type StoredTripSnapshot = Readonly<{
  savedAt: string
  snapshot: DriverTripSnapshot
}>

export type OwnedTripSnapshot = StoredTripSnapshot & Readonly<{ subHash: string }>

export type TripSnapshotStore = Readonly<{
  clear: () => Promise<void>
  read: (subHash: string) => Promise<StoredTripSnapshot | undefined>
  readLastOwner: () => Promise<string | undefined>
  remove: (subHash: string) => Promise<void>
  /** Apaga o snapshot de todo outro dono e aponta `last` para este, na mesma transação. */
  retainOnly: (subHash: string) => Promise<void>
  /** Grava e aponta `last` para o dono, na mesma transação. */
  write: (input: { readonly record: StoredTripSnapshot; readonly subHash: string }) => Promise<void>
}>

export async function hashSubject(subject: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subject))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** O IndexedDB devolve `unknown`: o que não tem a forma do snapshot não abre a tela. */
export function isStoredTripSnapshot(value: unknown): value is StoredTripSnapshot {
  if (!isRecord(value) || typeof value.savedAt !== 'string') return false
  const snapshot = value.snapshot
  if (!isRecord(snapshot)) return false
  return Array.isArray(snapshot.trips) && Array.isArray(snapshot.pendingProofs)
}

/** Lista vazia conta como concluída: resposta sem viagem apaga o snapshot (plan D5). */
export function hasOnlyConcludedTrips(snapshot: DriverTripSnapshot): boolean {
  return snapshot.trips.every((trip) => CONCLUDED_TRIP_STATUSES.has(trip.status))
}

export function isTripSnapshotUsable(input: {
  readonly now: Date
  readonly stored: StoredTripSnapshot
}): boolean {
  const savedAt = Date.parse(input.stored.savedAt)
  if (!Number.isFinite(savedAt)) return false
  if (input.now.getTime() - savedAt > TRIP_SNAPSHOT_MAX_AGE_MS) return false
  return !hasOnlyConcludedTrips(input.stored.snapshot)
}

/** O boot sem rede: o snapshot de quem usou por último, se ainda vale. O vencido sai aqui. */
export async function readLastTripSnapshot(input: {
  readonly now: Date
  readonly store: TripSnapshotStore
}): Promise<OwnedTripSnapshot | undefined> {
  const subHash = await input.store.readLastOwner()
  if (subHash === undefined) return undefined

  const stored = await input.store.read(subHash)
  if (stored === undefined) return undefined
  if (!isTripSnapshotUsable({ now: input.now, stored })) {
    await input.store.remove(subHash)
    return undefined
  }

  return { ...stored, subHash }
}

/** Autenticou: o snapshot de outro `sub` sai, e o deste vira o dado inicial da tela, se vale. */
export async function claimTripSnapshot(input: {
  readonly now: Date
  readonly store: TripSnapshotStore
  readonly subHash: string
}): Promise<StoredTripSnapshot | undefined> {
  await input.store.retainOnly(input.subHash)

  const stored = await input.store.read(input.subHash)
  if (stored === undefined) return undefined
  if (!isTripSnapshotUsable({ now: input.now, stored })) {
    await input.store.remove(input.subHash)
    return undefined
  }

  return stored
}

export async function saveTripSnapshot(input: {
  readonly now: Date
  readonly snapshot: DriverTripSnapshot
  readonly store: TripSnapshotStore
  readonly subHash: string
}): Promise<void> {
  if (hasOnlyConcludedTrips(input.snapshot)) {
    await input.store.remove(input.subHash)
    return
  }

  await input.store.write({
    record: { savedAt: input.now.toISOString(), snapshot: input.snapshot },
    subHash: input.subHash,
  })
}

/** "Sair": nada da viagem fica no aparelho. A fila não sai — ela tem dono e espera o dela. */
export async function discardTripSnapshots(input: {
  readonly store: TripSnapshotStore
}): Promise<void> {
  await input.store.clear()
}
