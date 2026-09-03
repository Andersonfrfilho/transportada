/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildStopLabel } from './stop-label.policy.js'

import {
  resolvePhysicalDestination,
  type PhysicalDestinationOrigin,
} from '../../nfe-documents/domain/physical-destination.policy.js'
import type { StopAddressComponents } from './stop-address-key.js'

export type NfeDestinationRow = {
  readonly city: string | null
  readonly cityCode: string | null
  readonly number: string | null
  readonly postalCode: string | null
  readonly role: string
  readonly state: string | null
  readonly street: string | null
}

export type NfeDestinationChoice = {
  readonly components: StopAddressComponents
  readonly label: string
  /** A UF da parada — é ela que diz qual malha o mapa busca para desenhar o contorno. */
  readonly state: string
  /**
   * RF4: de onde o endereço veio — o rótulo, nunca o endereço (RNF1).
   *
   * ⚠️ **Nenhum consumidor de produção lê isto ainda**, e por isso a CA10 está em aberto: o vínculo
   * (`drizzle-trip.repository.ts`) descarta o campo ao chamar `reconcileStopOnLink`. Persistir a
   * origem é decisão que a spec não tomou, e ela **não é da parada**: uma parada agrupa várias
   * notas, e a mesma chave pode ser alcançada pela entrega de uma e pelo cadastro de outra. O lugar
   * é `trip_documents`, o vínculo — com migration própria.
   */
  readonly origin: PhysicalDestinationOrigin
}

/**
 * Spec 073 P1: a parada agrupa pelo endereço **de entrega** quando a nota traz um. Duas notas do
 * mesmo cliente, uma com `<entrega>` e outra sem, são dois portões — e por isso duas paradas.
 */
export function chooseNfeDestinationRow(
  rows: readonly NfeDestinationRow[],
): NfeDestinationChoice | null {
  const chosen = resolvePhysicalDestination(
    rows.flatMap((row) =>
      row.role === 'delivery' || row.role === 'recipient'
        ? [
            {
              components: {
                cityCode: row.cityCode,
                number: row.number,
                postalCode: row.postalCode,
              },
              origin: row.role,
              row,
            },
          ]
        : [],
    ),
  )
  if (chosen === null) return null

  return {
    components: chosen.components,
    /** A UF da parada: é ela que diz **qual malha** o mapa precisa buscar para desenhar o contorno. */
    state: chosen.row.state ?? '',
    label: buildStopLabel({
      city: chosen.row.city,
      number: chosen.row.number,
      state: chosen.row.state ?? '',
      street: chosen.row.street,
    }),
    origin: chosen.origin,
  }
}
