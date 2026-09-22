/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import {
  TRIP_FIELD_CHANNELS,
  type TripFieldChannel,
} from '../domain/trip-field-channel.constant.js'

export const FIELD_TRIP_TARGET_KIND = { driver: 'driver', trip: 'trip' } as const

/** O motorista logado: a viagem é a dele na rua (ADR-0045 §2). PWA e WhatsApp. */
export type DriverFieldTripTarget = {
  readonly driverId: string
  readonly kind: typeof FIELD_TRIP_TARGET_KIND.driver
}

/**
 * O escritório: a viagem do caminho `/trips/:id`, na empresa do contexto (ADR-0067 §1). `driverId`
 * é o motorista **pedido** — quem o valida é `resolveFieldTripTarget`, e nenhuma consulta das portas
 * filtra por ele.
 */
export type TripFieldTripTarget = {
  readonly driverId?: string
  readonly kind: typeof FIELD_TRIP_TARGET_KIND.trip
  readonly tripId: string
}

/** O que as consultas das portas de campo recebem para achar a viagem. */
export type FieldTripTarget = DriverFieldTripTarget | TripFieldTripTarget

declare const RESOLVED_TRIP_FIELD_TARGET: unique symbol

/**
 * O alvo `trip` depois de resolvido: a viagem existe nesta empresa e tem motorista. A marca impede
 * montá-lo à mão — só `resolveFieldTripTarget` o constrói. O motorista pedido não viaja aqui: o
 * que vale depois da resolução é o efetivo.
 */
export type ResolvedTripFieldTarget = {
  readonly kind: typeof FIELD_TRIP_TARGET_KIND.trip
  /** ADR-0067 §2: o motorista em nome de quem o escritório registra. */
  readonly onBehalfOfDriverId: string
  readonly tripId: string
  readonly tripStatus: TripStatus
  readonly [RESOLVED_TRIP_FIELD_TARGET]: true
}

/**
 * Como um caso de uso de campo chega à viagem: pelo motorista logado (a forma de sempre) ou pelo
 * alvo que o escritório resolveu. Os dois nunca andam juntos.
 *
 * ADR-0067 §2: `channel` só existe na variante do motorista — o WhatsApp o informa (`'whatsapp'`);
 * ausente, é `'driver_app'` (o PWA). O escritório não manda `channel`: ele sempre é `'office'`,
 * porque é o próprio `target` resolvido que o entrega.
 */
export type FieldTripLocator =
  | { readonly channel?: TripFieldChannel; readonly driverId: string; readonly target?: never }
  | { readonly driverId?: never; readonly target: ResolvedTripFieldTarget }

export function toFieldTripTarget(locator: FieldTripLocator): FieldTripTarget {
  if (locator.target !== undefined) {
    return { kind: FIELD_TRIP_TARGET_KIND.trip, tripId: locator.target.tripId }
  }

  return { driverId: locator.driverId, kind: FIELD_TRIP_TARGET_KIND.driver }
}

/** ADR-0067 §2: quem gravou o registro de campo, e em nome de qual motorista. */
export type FieldAuthorship = {
  readonly channel: TripFieldChannel
  readonly onBehalfOfDriverId: string | null
}

/**
 * A autoria não é escolha de quem grava — ela nasce de **como** a viagem foi achada.
 * `{ target }` só existe para o escritório (`resolveFieldTripTarget`), então é sempre `'office'`,
 * com o motorista efetivo já resolvido. `{ driverId }` é o motorista: `'whatsapp'` quando o
 * localizador o diz, senão `'driver_app'`.
 */
export function deriveFieldAuthorship(locator: FieldTripLocator): FieldAuthorship {
  if (locator.target !== undefined) {
    return {
      channel: TRIP_FIELD_CHANNELS.office,
      onBehalfOfDriverId: locator.target.onBehalfOfDriverId,
    }
  }

  return {
    channel: locator.channel ?? TRIP_FIELD_CHANNELS.driverApp,
    onBehalfOfDriverId: null,
  }
}
