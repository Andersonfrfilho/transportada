/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatStoredPhone } from '@/modules/shared/phone.service'
import { formatTaxId } from '@/modules/shared/taxId.service'

import type { TripConference } from './tripConference.service'
import type { TripDriverLine } from './trip.types'

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
  const { conference, creatorName, drivers, labels, tripCode, vehiclePlate } = input
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
      value: `${summary.noteCount} · ${summary.totalVolumes} ${labels.volumes.toLowerCase()}`,
    },
  ]

  return fields.filter((field) => field.value !== '')
}

/** O que a folha mostra, já formatado: a impressão e o PDF desenham o mesmo conteúdo. */
export function buildTripConferenceSheet(
  input: BuildTripConferenceSheetInput,
): TripConferenceSheetModel {
  const { conference, labels, printedOn } = input
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
      row.totalValue === null ? '' : formatMoney(row.totalValue),
    ]),
    totalsRow: [
      `${labels.total} · ${summary.noteCount} ${labels.notes.toLowerCase()}`,
      String(summary.totalVolumes),
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
