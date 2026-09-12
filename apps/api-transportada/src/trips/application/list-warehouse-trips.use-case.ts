/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T016: o que o operador vê na lista "Viagens do armazém" do WhatsApp — viagens ainda no
 * barracão (`route_planned`/`separating`/`loading`), nunca as já despachadas, concluídas ou
 * canceladas. Payload enxuto de propósito: só o que decide a próxima ação (placa, notas com o
 * estado de separação), sem XML, sem histórico de evento, sem produto item a item.
 */
import type { TripDocumentSeparationStatus, TripStatus } from '../../database/trip.schema.js'

export type WarehouseTripDocument = {
  readonly id: string
  readonly number: string
  readonly recipientName: string
  readonly separationStatus: TripDocumentSeparationStatus
}

export type WarehouseTrip = {
  readonly documents: readonly WarehouseTripDocument[]
  /**
   * Sempre `true` nesta lista: os três estados que a filtram (`route_planned`/`separating`/
   * `loading`) só se alcançam depois de o roteiro ser planejado (`checkTripAcceptsDocumentWork`
   * recusa separar/carregar em `draft`) — não há consulta extra a fazer.
   */
  readonly hasRoute: boolean
  readonly id: string
  readonly status: TripStatus
  readonly vehiclePlate: string
}

export type WarehouseTripPort = {
  listWarehouseTrips(input: { readonly companyId: string }): Promise<readonly WarehouseTrip[]>
}

export async function listWarehouseTrips(input: {
  readonly companyId: string
  readonly repository: WarehouseTripPort
}): Promise<readonly WarehouseTrip[]> {
  return input.repository.listWarehouseTrips({ companyId: input.companyId })
}
