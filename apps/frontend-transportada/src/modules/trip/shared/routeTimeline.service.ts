/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 110 D4: **o dia em ordem.**
 *
 * O roteiro era uma lista de paradas e um extrato de pedágio ao lado, e casar praça com trecho era
 * trabalho de cabeça do operador. Aqui os dois são a mesma sequência: base, perna, praça, entrega,
 * perna, praça, entrega… e a volta, quando a política da empresa traz o caminhão de volta.
 *
 * ⚠️ **Serviço puro**, e é ele que a proposta multi-veículo e a criação manual compartilham.
 */

/** As três políticas de `company_route_optimization_settings.end_policy`, sem inventar uma quarta. */
export type RouteEndPolicy = 'address' | 'depot' | 'last_stop'

export type RouteTimelineStop = Readonly<{
  distanceFromPreviousMeters: null | number
  documentCount: number
  durationFromPreviousSeconds: null | number
  estimatedArrivalAt: null | string
  /** ADR-0044 §5: precisão de município sai da otimização, e a marca acompanha até a tela. */
  excludedFromOptimization: boolean
  label: string
}>

/**
 * Uma praça no trajeto. `leg` é o índice da **perna**: `0` é da base à primeira entrega, e
 * `stops.length` é a perna de volta.
 *
 * ⚠️ `amount` nulo é **tarifa não conhecida**, nunca zero: 4 das 166 praças mapeadas declaram
 * `0.00`, e nem sempre isso é isenção (spec 090).
 */
export type RouteTimelineBooth = Readonly<{
  amount: null | string
  leg: number
  name: string
  operator: null | string
}>

export type RouteTimelineLeg = Readonly<{
  distanceMeters: null | number
  durationSeconds: null | number
}>

export type RouteTimelineDriverPayment = Readonly<{
  amount: null | string
  paymentModel: string
  regionCity: null | string
  regionCode: null | string
  vehicleClass: string
}>

export type RouteTimelineEvent =
  | Readonly<{ arrivalAt: null | string; label: string; of: 'end' }>
  | Readonly<{ departureAt: null | string; label: string; of: 'origin' }>
  | Readonly<{
      amount: null | string
      name: string
      of: 'booth'
      operator: null | string
    }>
  | Readonly<{
      approximate: boolean
      arrivalAt: null | string
      documentCount: number
      label: string
      of: 'stop'
      sequence: number
    }>
  | Readonly<{
      distanceMeters: null | number
      durationSeconds: null | number
      isReturn: boolean
      of: 'leg'
    }>
  | Readonly<{ of: 'openEnd' }>
  | (RouteTimelineDriverPayment & Readonly<{ of: 'driverPayment' }>)

export type BuildRouteTimelineInput = Readonly<{
  booths: readonly RouteTimelineBooth[]
  /** ⚠️ Fecha a linha, e **não entra numa perna**: é um pagamento pela viagem inteira (spec 086 D1). */
  driverPayment: null | RouteTimelineDriverPayment
  endLabel: null | string
  endPolicy: RouteEndPolicy
  originLabel: null | string
  returnLeg: null | RouteTimelineLeg
  stops: readonly RouteTimelineStop[]
}>

export function buildRouteTimeline(input: BuildRouteTimelineInput): readonly RouteTimelineEvent[] {
  /** Sem parada não há dia: a base sozinha não é roteiro, e desenhá-la seria desenhar nada. */
  if (input.stops.length === 0) return []

  const events: RouteTimelineEvent[] = []
  const boothsByLeg = new Map<number, RouteTimelineBooth[]>()
  for (const booth of input.booths) {
    boothsByLeg.set(booth.leg, [...(boothsByLeg.get(booth.leg) ?? []), booth])
  }

  function pushBooths(leg: number): void {
    for (const booth of boothsByLeg.get(leg) ?? []) {
      events.push({ amount: booth.amount, name: booth.name, of: 'booth', operator: booth.operator })
    }
  }

  /**
   * ⚠️ Sem base cadastrada o dia começa na **primeira entrega**, e a perna até ela não existe —
   * inventar uma origem seria desenhar uma saída de um lugar que ninguém cadastrou.
   */
  const hasOrigin = input.originLabel !== null
  if (hasOrigin) {
    events.push({ departureAt: null, label: input.originLabel ?? '', of: 'origin' })
  }

  input.stops.forEach((stop, index) => {
    const isFirst = index === 0
    if (!isFirst || hasOrigin) {
      events.push({
        distanceMeters: stop.distanceFromPreviousMeters,
        durationSeconds: stop.durationFromPreviousSeconds,
        isReturn: false,
        of: 'leg',
      })
      pushBooths(index)
    }
    events.push({
      approximate: stop.excludedFromOptimization,
      arrivalAt: stop.estimatedArrivalAt,
      documentCount: stop.documentCount,
      label: stop.label,
      of: 'stop',
      sequence: index + 1,
    })
  })

  if (input.endPolicy === 'last_stop' || input.endLabel === null) {
    /** A política não traz o caminhão de volta, e a linha **diz isso** em vez de simplesmente parar. */
    events.push({ of: 'openEnd' })
  } else {
    events.push({
      distanceMeters: input.returnLeg?.distanceMeters ?? null,
      durationSeconds: input.returnLeg?.durationSeconds ?? null,
      isReturn: true,
      of: 'leg',
    })
    pushBooths(input.stops.length)
    events.push({ arrivalAt: null, label: input.endLabel, of: 'end' })
  }

  if (input.driverPayment !== null) {
    events.push({ ...input.driverPayment, of: 'driverPayment' })
  }

  return events
}
