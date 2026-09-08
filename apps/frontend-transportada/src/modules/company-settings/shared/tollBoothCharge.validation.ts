import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { isRecord } from './companySettingsResponse.validation'

const CATALOG_KEYS = ['chargeCar', 'chargePerAxle', 'chargePerAxleAutomatic', 'observedOn']
const ENTRY_KEYS = [
  'actorUserId',
  'catalog',
  'chargeCarSource',
  'chargePerAxleAutomaticSource',
  'chargePerAxleSource',
  'effectiveChargeCar',
  'effectiveChargePerAxle',
  'effectiveChargePerAxleAutomatic',
  'name',
  'observedOn',
  'operator',
  'osmNodeId',
  'source',
  'updatedAt',
]
const CHARGE_SOURCES = ['catalog', 'manual']
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/u
const OBSERVED_ON = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u

export type TollBoothChargeSource = 'catalog' | 'manual'

/** A tarifa que o OSM publica para a praça — nunca o que a empresa ajustou. */
export type TollBoothCatalogTariff = Readonly<{
  chargeCar: string | null
  chargePerAxle: string | null
  chargePerAxleAutomatic: string | null
  observedOn: string
}>

/**
 * Uma praça, na forma da tela de correção (spec 095): a tarifa do mapa ao lado do valor efetivo,
 * um par por campo — a origem é por campo, nunca por linha, porque corrigir só o por eixo e deixar
 * o carro no mapa é o caso comum.
 */
export type TollBoothChargeEntry = Readonly<{
  actorUserId: string | null
  catalog: TollBoothCatalogTariff
  chargeCarSource: TollBoothChargeSource
  chargePerAxleAutomaticSource: TollBoothChargeSource
  chargePerAxleSource: TollBoothChargeSource
  effectiveChargeCar: string | null
  effectiveChargePerAxle: string | null
  effectiveChargePerAxleAutomatic: string | null
  name: string | null
  observedOn: string
  operator: string | null
  osmNodeId: number
  source: TollBoothChargeSource
  updatedAt: string | null
}>

export type TollBoothChargeListResponse = Readonly<{ data: readonly TollBoothChargeEntry[] }>
export type TollBoothChargeResponse = Readonly<{ data: TollBoothChargeEntry }>

function isNullableMoney(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && MONEY_DECIMAL.test(value))
}

function isChargeSource(value: unknown): value is TollBoothChargeSource {
  return typeof value === 'string' && CHARGE_SOURCES.includes(value)
}

function isNullableIsoDate(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'string') return false
  const timestamp = Date.parse(value)
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value
}

function isTollBoothCatalogTariff(value: unknown): value is TollBoothCatalogTariff {
  if (!isRecord(value) || !hasExactKeys(value, CATALOG_KEYS)) return false
  return (
    isNullableMoney(value.chargeCar) &&
    isNullableMoney(value.chargePerAxle) &&
    isNullableMoney(value.chargePerAxleAutomatic) &&
    typeof value.observedOn === 'string' &&
    OBSERVED_ON.test(value.observedOn)
  )
}

export function isTollBoothChargeEntry(value: unknown): value is TollBoothChargeEntry {
  if (!isRecord(value) || !hasExactKeys(value, ENTRY_KEYS)) return false
  return (
    (value.actorUserId === null || typeof value.actorUserId === 'string') &&
    isTollBoothCatalogTariff(value.catalog) &&
    isChargeSource(value.chargeCarSource) &&
    isChargeSource(value.chargePerAxleAutomaticSource) &&
    isChargeSource(value.chargePerAxleSource) &&
    isNullableMoney(value.effectiveChargeCar) &&
    isNullableMoney(value.effectiveChargePerAxle) &&
    isNullableMoney(value.effectiveChargePerAxleAutomatic) &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.observedOn === 'string' &&
    OBSERVED_ON.test(value.observedOn) &&
    (value.operator === null || typeof value.operator === 'string') &&
    typeof value.osmNodeId === 'number' &&
    isChargeSource(value.source) &&
    isNullableIsoDate(value.updatedAt)
  )
}

export function isTollBoothChargeListResponse(
  value: unknown,
): value is TollBoothChargeListResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['data']) &&
    Array.isArray(value.data) &&
    value.data.every(isTollBoothChargeEntry)
  )
}

export function isTollBoothChargeResponse(value: unknown): value is TollBoothChargeResponse {
  return isRecord(value) && hasExactKeys(value, ['data']) && isTollBoothChargeEntry(value.data)
}
