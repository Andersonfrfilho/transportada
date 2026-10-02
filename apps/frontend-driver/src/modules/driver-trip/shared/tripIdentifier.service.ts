/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Pedido do usuário (01/10): o app do motorista mostra o identificador curto da viagem, e é o
 * **mesmo** que a listagem do escritório (`TripTable.component.tsx`: `trip.id.slice(0, 8)`) — o
 * código só serve se os dois lados lerem o mesmo ao telefone. Não há código humano na tabela
 * `trips`: só o UUID, e este recorte é a convenção que o painel já usa em três telas.
 *
 * Sem transformar caixa: o painel mostra o hex como vem, e divergir aqui quebraria a leitura
 * cruzada que é a razão de existir deste identificador.
 */
export const SHORT_TRIP_ID_LENGTH = 8

export function formatShortTripId(tripId: string): string {
  return tripId.slice(0, SHORT_TRIP_ID_LENGTH)
}

const TRIP_CREATED_AT_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/** Data inválida não vira "Invalid Date" na tela: sem data legível, a linha some. */
export function formatTripCreatedAt(createdAt: string): string {
  const moment = new Date(createdAt)
  return Number.isNaN(moment.getTime()) ? '' : TRIP_CREATED_AT_FORMATTER.format(moment)
}
