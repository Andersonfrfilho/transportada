/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 T3.6 (D3 revista): o motorista manda a localização numa mensagem própria, e o toque que a
 * usa (entregar, devolver, ocorrência) é outra mensagem. O ponto atravessa os dois turnos aqui,
 * só em memória e por um toque — nunca no contexto da sessão (PII) e nunca em log.
 */
import type { WhatsAppMessage } from '@adatechnology/meta-whatsapp-contracts'
import { z } from 'zod'

import type { ReportedLocation } from '../../trips/application/driver-field-report.port.js'
import {
  locationSchema,
  toReportedLocation,
} from '../../trips/presentation/reported-location.schema.js'
import {
  WHATSAPP_SHARED_LOCATION_MAX_ENTRIES,
  WHATSAPP_SHARED_LOCATION_TTL_MS,
} from '../domain/whatsapp-command.constant.js'

export type WhatsAppSharedLocationKey = {
  readonly companyId: string
  readonly whatsappNumber: string
}

export type WhatsAppSharedLocationStore = {
  /** Devolve o ponto lembrado e o esquece: um ponto vale para um toque só. `null` se vencido. */
  consume(key: WhatsAppSharedLocationKey): ReportedLocation | null
  remember(input: WhatsAppSharedLocationKey & { readonly location: ReportedLocation }): void
}

type CreateWhatsAppSharedLocationStoreParams = {
  readonly clock: () => Date
  readonly maxEntries?: number
  readonly ttlMs?: number
}

type RememberedLocation = {
  readonly expiresAtMs: number
  readonly location: ReportedLocation
}

function toMapKey(key: WhatsAppSharedLocationKey): string {
  return `${key.companyId}:${key.whatsappNumber}`
}

export function createInMemoryWhatsAppSharedLocationStore(
  params: CreateWhatsAppSharedLocationStoreParams,
): WhatsAppSharedLocationStore {
  const ttlMs = params.ttlMs ?? WHATSAPP_SHARED_LOCATION_TTL_MS
  const maxEntries = params.maxEntries ?? WHATSAPP_SHARED_LOCATION_MAX_ENTRIES
  const remembered = new Map<string, RememberedLocation>()

  function evictOverflow(nowMs: number): void {
    if (remembered.size < maxEntries) return
    for (const [mapKey, entry] of remembered) {
      if (entry.expiresAtMs <= nowMs) remembered.delete(mapKey)
    }
    while (remembered.size >= maxEntries) {
      const oldest = remembered.keys().next()
      if (oldest.done === true) return
      remembered.delete(oldest.value)
    }
  }

  return {
    consume(key) {
      const mapKey = toMapKey(key)
      const entry = remembered.get(mapKey)
      if (entry === undefined) return null
      remembered.delete(mapKey)

      return entry.expiresAtMs > params.clock().getTime() ? entry.location : null
    },
    remember({ location, ...key }) {
      const nowMs = params.clock().getTime()
      const mapKey = toMapKey(key)
      remembered.delete(mapKey)
      evictOverflow(nowMs)
      remembered.set(mapKey, { expiresAtMs: nowMs + ttlMs, location })
    },
  }
}

/** O recorte da Cloud API: nome, endereço e url são texto do motorista e ficam de fora. */
const incomingLocationSchema = z.object({ latitude: z.number(), longitude: z.number() })

function toCapturedAt(timestamp: string | undefined, fallback: Date): string {
  const capturedAt = new Date(Number(timestamp) * 1000)

  return Number.isNaN(capturedAt.getTime()) ? fallback.toISOString() : capturedAt.toISOString()
}

/**
 * A mensagem `location` da Cloud API vira o mesmo `ReportedLocation` das rotas HTTP: a faixa do
 * globo vem de `locationSchema` e o formato de `toReportedLocation`, sem validação paralela. O
 * WhatsApp não manda precisão, então ela fica `null`.
 */
export function extractWhatsAppIncomingLocation(
  message: WhatsAppMessage,
  now: Date,
): ReportedLocation | undefined {
  if (message.type !== 'location' || !('location' in message)) return undefined

  const incoming = incomingLocationSchema.safeParse(message.location)
  if (!incoming.success) return undefined

  const location = locationSchema.safeParse({
    capturedAt: toCapturedAt(message.timestamp, now),
    latitude: incoming.data.latitude,
    longitude: incoming.data.longitude,
  })

  return location.success ? (toReportedLocation(location.data) ?? undefined) : undefined
}
