/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 107 D3: **quando o caminhão fica livre.** A sobra existe porque a frota ofertada não cobriu
 * tudo; a segunda onda é o que o operador faz com ela, e a única pergunta que ele tem antes de
 * decidir é "a partir de que hora".
 *
 * ⚠️ A hora é **estimativa de planejamento**, não promessa: ela sai do ETA que o solver calculou no
 * momento do aceite, e a tela é obrigada a dizer isso ao lado — número plausível sem aviso é o modo
 * de falha da ADR-0044 §1.
 *
 * ⚠️ O que esta regra **não** diz é quantas das notas que sobraram cada caminhão cobriria — a frase
 * inteira da spec é "o RTD5J78 termina por volta das 14h **e cobre 40 delas**". A cobertura por
 * região de quem dirige é decidida no solver (`servableStopIndexes`, spec 106) e não é publicada por
 * parada descartada; inventá-la aqui por proximidade seria adivinhar o que a 106 mediu.
 */
export type AcceptedTripFinish = Readonly<{
  estimatedFinishAt: null | string
  tripId: string
  vehicleId: string
}>

export type FreeingVehicle = Readonly<{
  estimatedFinishAt: string
  /** `null` é placa que a frota carregada não nomeia — a linha continua, sem ela. */
  plate: null | string
  tripId: string
  vehicleId: string
}>

export function resolveFreeingVehicles(
  input: Readonly<{
    plateByVehicleId: ReadonlyMap<string, string>
    trips: readonly AcceptedTripFinish[]
  }>,
): readonly FreeingVehicle[] {
  return input.trips
    .flatMap((trip) =>
      trip.estimatedFinishAt === null
        ? []
        : [
            {
              estimatedFinishAt: trip.estimatedFinishAt,
              plate: input.plateByVehicleId.get(trip.vehicleId) ?? null,
              tripId: trip.tripId,
              vehicleId: trip.vehicleId,
            },
          ],
    )
    .sort((first, second) => first.estimatedFinishAt.localeCompare(second.estimatedFinishAt))
}
