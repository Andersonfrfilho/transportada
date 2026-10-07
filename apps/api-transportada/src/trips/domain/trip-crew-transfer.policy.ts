/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249: as três perguntas puras da transferência de tripulação. O repositório as chama sob o
 * lock da viagem; nada aqui lê banco nem relógio.
 */
import type { TripCrewEventMember } from '../../database/trip.schema.js'
import { TRIP_CREW_ROLES, type TripCrewRole } from '../../shared/trip-crew-role.constant.js'
import type { TripDriverLine } from './trip.policy.js'

export type TripCrewSlot = {
  readonly driverId: string
  readonly role: TripCrewRole
}

export type IsCrewRequestUnchangedParams = {
  readonly current: readonly TripCrewSlot[]
  readonly requested: readonly TripCrewSlot[]
}

export type HasDriverSetChangedParams = {
  readonly next: readonly TripCrewSlot[]
  readonly previous: readonly TripCrewSlot[]
}

/**
 * Spec 249 D5: igual é mesma pessoa, mesmo papel **e mesma posição** — o primeiro motorista é o
 * principal, então trocar a ordem é uma transferência.
 */
export function isCrewRequestUnchanged({
  current,
  requested,
}: IsCrewRequestUnchangedParams): boolean {
  if (current.length !== requested.length) return false
  return current.every((slot, index) => {
    const requestedSlot = requested[index]
    return requestedSlot?.driverId === slot.driverId && requestedSlot.role === slot.role
  })
}

/**
 * Spec 249 D8: o MDF-e declara só os condutores (ADR-0065) e como **conjunto** — trocar só o
 * ajudante, ou reordenar os mesmos motoristas, não deixa o manifesto autorizado com a pessoa errada.
 */
export function hasDriverSetChanged({ next, previous }: HasDriverSetChangedParams): boolean {
  const previousDrivers = driverIdsOf(previous)
  const nextDrivers = driverIdsOf(next)
  if (previousDrivers.size !== nextDrivers.size) return true
  return [...nextDrivers].some((driverId) => !previousDrivers.has(driverId))
}

/** Spec 249 D6: o retrato que o evento guarda — id, nome, papel e posição, nunca o CPF. */
export function buildCrewSnapshot(crew: readonly TripDriverLine[]): readonly TripCrewEventMember[] {
  return crew.map((member) => ({
    driverId: member.driverId,
    name: member.driverName,
    position: member.position,
    role: member.role,
  }))
}

/**
 * O `jsonb` do retrato chega como lista ou como texto, conforme o caminho do Bun SQL. Integrante
 * malformado é descartado: a linha do tempo da viagem não cai por causa de um item.
 */
export function parseCrewSnapshot(value: unknown): readonly TripCrewEventMember[] {
  const list = typeof value === 'string' ? parseJsonText(value) : value
  if (!Array.isArray(list)) return []
  return list.filter(isCrewEventMember)
}

function driverIdsOf(crew: readonly TripCrewSlot[]): ReadonlySet<string> {
  return new Set(crew.filter((slot) => slot.role === 'driver').map((slot) => slot.driverId))
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

function isCrewEventMember(value: unknown): value is TripCrewEventMember {
  if (typeof value !== 'object' || value === null) return false
  const member = value as Record<string, unknown>
  return (
    typeof member.driverId === 'string' &&
    typeof member.name === 'string' &&
    typeof member.position === 'number' &&
    typeof member.role === 'string' &&
    (TRIP_CREW_ROLES as readonly string[]).includes(member.role)
  )
}
