/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0056 §2: o rastro tem teto de idade, e ele não depende de a viagem fechar.
 *
 * A ADR-0050 §5 disse que o ping morre com a viagem, e cumpriu isso com `purgeByTrip`, no fechamento
 * e no cancelamento. Enquanto o rastro só existia com a tela na mão, isso bastava: viagem esquecida
 * aberta deixava um rastro parado. Com o segundo plano do aplicativo, a mesma viagem esquecida
 * aberta na sexta-feira **acompanha o motorista no fim de semana inteiro, em casa** — e aí a
 * ausência de prazo deixa de ser um defeito e vira incidente de dado pessoal.
 */

/**
 * Trinta e seis horas: um dia de trabalho mais a pernoite, com folga. Passado isso, uma viagem
 * ainda aberta não é uma viagem em andamento — é uma viagem que ninguém fechou.
 *
 * ⚠️ É o número a revisitar se o produto passar a ter roteiro de vários dias. Hoje a viagem é a
 * rota do dia, e o portal do contratante pergunta "chega quando?", não "onde esteve".
 */
export const TRIP_TRACKING_MAX_AGE_HOURS = 36

const MILLISECONDS_PER_HOUR = 3_600_000

export type TrackingWindowVerdict = 'open' | 'trip_too_old'

/**
 * ⚠️ **Ausência de data não é idade.**
 *
 * A primeira versão recusava o ping quando `dispatchedAt` era nulo, lendo a ausência como "viagem
 * que nunca saiu". Mas a data vem de `trip_dispatch_snapshots` por `leftJoin` — `trips` **não tem**
 * `dispatched_at` —, então toda viagem sem snapshot passou a perder o rastro **em silêncio**: o
 * motorista seguia mandando posição, o portal do contratante mostrava vazio, e nada acusava. Duas
 * integrações do portal reprovaram por isso, e elas descrevem o caso real.
 *
 * Sem data não há o que comparar, e a resposta honesta é deixar passar. O prazo da ADR-0056 §2
 * continua cumprido por `resolveTrackingPurgeCutoff`, que corta o ping velho tenha a viagem fechado
 * ou não — é o expurgo que garante a LGPD aqui, não este portão.
 */
export function checkTrackingWindow(input: {
  readonly dispatchedAt: Date | null
  readonly now: Date
}): TrackingWindowVerdict {
  if (input.dispatchedAt === null) return 'open'

  const elapsedHours = (input.now.getTime() - input.dispatchedAt.getTime()) / MILLISECONDS_PER_HOUR

  return elapsedHours > TRIP_TRACKING_MAX_AGE_HOURS ? 'trip_too_old' : 'open'
}

/** O corte do expurgo: ping anterior a este instante cai, tenha a viagem fechado ou não. */
export function resolveTrackingPurgeCutoff(now: Date): Date {
  return new Date(now.getTime() - TRIP_TRACKING_MAX_AGE_HOURS * MILLISECONDS_PER_HOUR)
}
