/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As paradas das viagens ativas do motorista numa lista só, para o bot do WhatsApp. `trip_stops.sequence` é da
 * viagem: com duas ou mais viagens ativas, "PARADA 1" existia em cada uma e o motorista não tinha como escolher
 * pelo número. Aqui as viagens entram na ordem recebida (a de `listActiveTrips`, por criação), cada uma na ordem
 * do roteiro, e a sequência passa a ser a posição na lista inteira (1..N). Com uma viagem só nada muda.
 */

type TripWithStops<Stop> = { readonly stops: readonly Stop[] }

export function flattenTripStopsWithUniqueSequence<Stop extends { readonly sequence: number }>(
  trips: readonly TripWithStops<Stop>[],
): Stop[] {
  if (trips.length <= 1) return trips.flatMap((trip) => [...trip.stops])
  return trips
    .flatMap((trip) => [...trip.stops].sort((left, right) => left.sequence - right.sequence))
    .map((stop, index) => ({ ...stop, sequence: index + 1 }))
}
