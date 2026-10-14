/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatStoredPhone } from '@/modules/shared/phone.service'
import { formatTaxId } from '@/modules/shared/taxId.service'

import type { TripConference } from './tripConference.service'
import type { TripCargoWeight, TripDriverLine } from './trip.types'

export type TripConferenceSheetLabels = Readonly<{
  checkedBy: string
  city: string
  client: string
  createdBy: string
  date: string
  deliveredAt: string
  deliveryStatus: string
  driver: string
  driverSignature: string
  invoice: string
  issuedAt: string
  notes: string
  printedAt: string
  quantity: string
  routeCities: string
  title: string
  total: string
  trip: string
  value: string
  vehicle: string
  volumes: string
  weight: string
  weightEstimated: string
  weightMissingNotes: string
  weightNotInformed: string
}>

export type TripConferenceSheetField = Readonly<{ label: string; value: string }>

export type TripConferenceSheetModel = Readonly<{
  columns: readonly string[]
  fields: readonly TripConferenceSheetField[]
  printedAtText: string
  /** Em linha própria, de largura total: a lista cresce com a viagem e não cabe numa coluna. */
  routeCities: string
  rows: readonly (readonly string[])[]
  totalsRow: readonly string[]
}>

export type BuildTripConferenceSheetInput = Readonly<{
  /** O peso da carga da viagem (spec 079): `null` quando a API não o calculou. */
  cargoWeight: TripCargoWeight | null
  conference: TripConference
  creatorName: null | string | undefined
  drivers: readonly TripDriverLine[]
  labels: TripConferenceSheetLabels
  printedOn: Date
  tripCode: string
  vehiclePlate: null | string
}>

/** `›` existe na fonte padrão do PDF; a seta `→` não. */
export const ROUTE_SEPARATOR = ' › '
const NON_BREAKING_SPACE = /\u00a0/gu
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: SAO_PAULO_TIME_ZONE,
})
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: SAO_PAULO_TIME_ZONE,
})

function formatMoney(value: string): string {
  return formatAmount(value).replace(NON_BREAKING_SPACE, ' ')
}

const weightFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
})

/**
 * O peso que o motorista assina, em kg e com a mesma casa decimal do painel. Sem peso em nenhuma nota
 * é "peso não informado", nunca `0,00 kg`: zero afirmaria que a carga não pesa. Com parte das notas
 * sem peso, o total é só do que se sabe e a folha diz quantas ficaram de fora; peso estimado leva a
 * marca ao lado do número, como em todo lugar que o painel o mostra.
 */
export function describeTripConferenceWeight(input: {
  readonly cargoWeight: TripCargoWeight | null
  readonly labels: TripConferenceSheetLabels
}): string {
  const { cargoWeight, labels } = input
  const kilograms =
    cargoWeight === null ? Number.NaN : Number.parseFloat(cargoWeight.grossWeightKilograms)

  if (cargoWeight === null || !Number.isFinite(kilograms) || kilograms <= 0) {
    return labels.weightNotInformed
  }

  const parts = [`${weightFormatter.format(kilograms).replace(NON_BREAKING_SPACE, ' ')} kg`]
  if (cargoWeight.source === 'estimated') parts.push(`(${labels.weightEstimated})`)
  const missing = cargoWeight.documentsWithoutWeight
  const text = parts.join(' ')

  return missing > 0 ? `${text} · ${missing} ${labels.weightMissingNotes}` : text
}

function formatWeightKilograms(kilograms: number): string {
  return weightFormatter.format(kilograms).replace(NON_BREAKING_SPACE, ' ')
}

function describeDriver(driver: TripDriverLine): string {
  const taxId = driver.driverTaxId === null ? '' : ` · ${formatTaxId(driver.driverTaxId)}`
  const phone =
    driver.driverPhone === null || driver.driverPhone === undefined
      ? ''
      : ` · ${formatStoredPhone(driver.driverPhone)}`

  return `${driver.driverName}${taxId}${phone}`.toUpperCase()
}

/** Cada campo só existe se tiver valor: a folha leva o que há na viagem, nunca um rótulo vazio. */
function buildFields(input: BuildTripConferenceSheetInput): readonly TripConferenceSheetField[] {
  const { cargoWeight, conference, creatorName, drivers, labels, tripCode, vehiclePlate } = input
  const { summary } = conference
  const crew = drivers.filter((driver) => driver.role !== 'helper')
  const fields: TripConferenceSheetField[] = [
    ...crew.map((driver) => ({ label: labels.driver, value: describeDriver(driver) })),
    { label: labels.vehicle, value: vehiclePlate ?? '' },
    { label: labels.trip, value: tripCode },
    {
      label: labels.createdBy,
      value: typeof creatorName === 'string' ? creatorName.toUpperCase() : '',
    },
    {
      label: labels.notes,
      value: `${summary.noteCount} · ${summary.totalVolumes} ${labels.volumes.toLowerCase()} · ${describeTripConferenceWeight({ cargoWeight, labels })}`,
    },
  ]

  return fields.filter((field) => field.value !== '')
}

/**
 * O peso embaixo da coluna: a soma das notas que a API pesou; API anterior (sem peso por nota) cai no
 * total da viagem. Sem nenhum dos dois fica vazio — o "peso não informado" já está no campo Notas.
 */
function describeTotalWeight(input: {
  readonly cargoWeight: TripCargoWeight | null
  readonly summary: TripConference['summary']
}): string {
  const { cargoWeight, summary } = input
  const fallback =
    cargoWeight === null ? Number.NaN : Number.parseFloat(cargoWeight.grossWeightKilograms)
  const kilograms =
    summary.totalWeightKilograms ?? (Number.isFinite(fallback) && fallback > 0 ? fallback : null)

  return kilograms === null ? '' : formatWeightKilograms(kilograms)
}

/** O que a folha mostra, já formatado: a impressão e o PDF desenham o mesmo conteúdo. */
export function buildTripConferenceSheet(
  input: BuildTripConferenceSheetInput,
): TripConferenceSheetModel {
  const { cargoWeight, conference, labels, printedOn } = input
  const { rows, summary } = conference

  return {
    columns: [
      labels.quantity,
      labels.invoice,
      labels.issuedAt,
      labels.client,
      labels.city,
      labels.deliveredAt,
      labels.deliveryStatus,
      labels.volumes,
      labels.weight,
      labels.value,
    ],
    fields: buildFields(input),
    routeCities: summary.cities.join(ROUTE_SEPARATOR).toUpperCase(),
    printedAtText: `${labels.printedAt} ${dateTimeFormatter.format(printedOn)}`,
    rows: rows.map((row, index) => [
      String(index + 1),
      row.noteNumber,
      row.issuedAt === null ? '' : dayFormatter.format(new Date(row.issuedAt)),
      row.clientName,
      row.city === '' ? row.destinationLabel : row.city,
      '',
      '',
      row.volumeCount === null ? '' : String(row.volumeCount),
      row.weightKilograms === null
        ? ''
        : `${formatWeightKilograms(row.weightKilograms)}${row.weightSource === 'estimated' ? ` (${labels.weightEstimated})` : ''}`,
      row.totalValue === null ? '' : formatMoney(row.totalValue),
    ]),
    totalsRow: [
      `${labels.total} · ${summary.noteCount} ${labels.notes.toLowerCase()}`,
      String(summary.totalVolumes),
      describeTotalWeight({ cargoWeight, summary }),
      formatMoney(summary.totalValue),
    ],
  }
}

/** `conferencia-<viagem>-AAAAMMDD-HHMM.pdf`, no horário de São Paulo: cada download é um arquivo distinto. */
export function buildTripConferenceFileName(input: {
  readonly at: Date
  readonly tripCode: string
}): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(input.at)
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''

  return `conferencia-${input.tripCode}-${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}.pdf`
}
