/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTripErrorDetail } from './offlineQueue.service'
import type { DriverTripStop } from './driverTrip.types'

/**
 * A API não deixa a viagem sair com nota viva que não chegou a `loaded` (`dispatch-readiness.policy.ts`):
 * só o escritório despacha assim, forçado e assinado. O motorista via o código cru
 * ("409 TRIP_HAS_UNLOADED_DOCUMENTS") e um "toque de novo" que falhava até o escritório agir. Aqui o app
 * diz quais notas seguram a saída — antes do toque, pelo snapshot, e depois da recusa, pelos ids que o
 * servidor devolve em `details`.
 */
export const UNLOADED_DOCUMENTS_CODE = 'TRIP_HAS_UNLOADED_DOCUMENTS'

/** Carregada ou já entregue conta como carregada; devolvida saiu da viagem. Nota liberada nem chega ao app. */
const LOADED_OR_GONE_STATUSES: ReadonlySet<string> = new Set(['delivered', 'loaded', 'returned'])

/** Os números das notas da viagem que ainda não foram marcadas como carregadas, na ordem das paradas. */
export function listUnloadedDocumentNumbers(stops: readonly DriverTripStop[]): string[] {
  return stops
    .flatMap((stop) => stop.documents)
    .filter((document) => !LOADED_OR_GONE_STATUSES.has(document.separationStatus))
    .map((document) => document.number)
}

/** Os números das notas que o servidor apontou na recusa; id que saiu do snapshot fica de fora. */
export function resolveRejectedDocumentNumbers(input: {
  readonly details: readonly DriverTripErrorDetail[] | undefined
  readonly stops: readonly DriverTripStop[]
}): string[] {
  const ids = new Set(
    (input.details ?? [])
      .filter((detail) => detail.field === 'documentId')
      .map((detail) => detail.message),
  )
  return input.stops
    .flatMap((stop) => stop.documents)
    .filter((document) => ids.has(document.id))
    .map((document) => document.number)
}

/** "NF 1, NF 2": vírgula só, para valer igual nos dois idiomas do app. */
export function formatDocumentNumbers(numbers: readonly string[]): string {
  return numbers.map((number) => `NF ${number}`).join(', ')
}
