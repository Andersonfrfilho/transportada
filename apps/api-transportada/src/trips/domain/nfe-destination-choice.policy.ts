/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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
  /** RF4: quem consulta a parada precisa saber de onde o endereço veio — o rótulo, nunca o endereço. */
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
    label: [chosen.row.street, chosen.row.city, chosen.row.state].filter(Boolean).join(', '),
    origin: chosen.origin,
  }
}
