/* Copyright (c) 2026 Ada Technology. MIT License. */
import { findBrazilianHoliday } from '@/components/ui/brazilianHoliday.service'

/**
 * Quando o roteiro **termina**, e o que há de errado com esse momento.
 *
 * ⚠️ O número não é nosso: `estimatedArrivalAt` vem do solver, que conta a partir da saída do
 * depósito somando estrada, tempo de serviço por parada e as pausas de jornada. Recalcular aqui
 * produziria um segundo término que discorda do primeiro.
 */
export type RouteFinishWarning = Readonly<{ detail: string; kind: 'feriado' | 'fim-de-semana' }>

export type RouteFinish = Readonly<{
  arrivalIso: null | string
  distanceKilometres: null | number
  minutes: null | number
  warnings: readonly RouteFinishWarning[]
}>

type ScheduleStop = Readonly<{ estimatedArrivalAt: null | string; sequence: number }>

const METRES_PER_KILOMETRE = 1000
const SECONDS_PER_MINUTE = 60

/**
 * ⚠️ **O término é a chegada da última parada, e ele pode não existir.** Sem janela configurada e
 * sem histórico de tempo de serviço o solver devolve `estimatedArrivalAt` nulo — e aí a tela não
 * inventa horário. Ausência é ausência.
 */
export function resolveRouteFinish(input: {
  readonly distanceMetres: null | number
  readonly durationSeconds: null | number
  readonly stops: readonly ScheduleStop[]
}): RouteFinish {
  const ultima = [...input.stops]
    .sort((left, right) => right.sequence - left.sequence)
    .find((stop) => stop.estimatedArrivalAt !== null)

  const arrivalIso = ultima?.estimatedArrivalAt ?? null

  return {
    arrivalIso,
    distanceKilometres:
      input.distanceMetres === null ? null : input.distanceMetres / METRES_PER_KILOMETRE,
    minutes:
      input.durationSeconds === null
        ? null
        : Math.round(input.durationSeconds / SECONDS_PER_MINUTE),
    warnings: arrivalIso === null ? [] : resolveWarnings(arrivalIso),
  }
}

/**
 * ⚠️ **Só o que se deriva sem configurar nada.** Sábado, domingo e feriado nacional saem do
 * calendário que o seletor de data já usa. Horário comercial **não entra aqui**: não existe jornada
 * da empresa cadastrada em lugar nenhum, e inventar "das 8 às 18" seria política de negócio escrita
 * à revelia de quem responde por ela. Estouro de janela do cliente já vem do solver, em
 * `violations` — é lá que ele deve ser lido, não recalculado aqui.
 */
function resolveWarnings(arrivalIso: string): readonly RouteFinishWarning[] {
  const dia = arrivalIso.slice(0, 10)
  const warnings: RouteFinishWarning[] = []

  const feriado = findBrazilianHoliday(dia)
  if (feriado !== undefined) warnings.push({ detail: feriado, kind: 'feriado' })

  /** `T12:00` neutraliza o fuso: `new Date('2026-09-05')` é meia-noite UTC e volta um dia em SP. */
  const semana = new Date(`${dia}T12:00:00`).getDay()
  if (semana === 0 || semana === 6) {
    warnings.push({ detail: semana === 0 ? 'domingo' : 'sábado', kind: 'fim-de-semana' })
  }

  return warnings
}
