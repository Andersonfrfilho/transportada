/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A resposta de `GET /v1/toll-booths` (spec 154 RF1/RF2): o catálogo inteiro, com o valor efetivo
 * por campo — mesma forma de `TollBoothChargeEntry` (spec 095), mais `catalogKnown` e `seen`
 * (spec 154 D1) e o resumo (`summary`) que a aba de pedágio passa a mostrar no cabeçalho.
 */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import {
  isBoolean,
  isNullableDecimalString,
  isNullableString,
  isOneOf,
  isString,
  isUnsignedIntegerNumber,
} from './fleetGuards.validation'

const TOLL_BOOTH_CATALOG_STATUSES = ['empty', 'stale', 'current'] as const
export type TollBoothCatalogStatus = (typeof TOLL_BOOTH_CATALOG_STATUSES)[number]

const CHARGE_SOURCES = ['catalog', 'manual'] as const
export type TollBoothChargeSource = (typeof CHARGE_SOURCES)[number]

const CATALOG_TARIFF_KEYS = [
  'chargeCar',
  'chargePerAxle',
  'chargePerAxleAutomatic',
  'observedOn',
] as const

const CATALOG_ENTRY_KEYS = [
  'actorUserId',
  'catalog',
  'catalogKnown',
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
  'seen',
  'source',
  'updatedAt',
] as const

const CATALOG_SUMMARY_KEYS = [
  'boothCount',
  'boothsWithoutAxleChargeCount',
  'observedOn',
  'status',
] as const

const CATALOG_PAGINATION_KEYS = ['page', 'perPage', 'total'] as const

export type TollBoothCatalogTariff = Readonly<{
  chargeCar: string | null
  chargePerAxle: string | null
  chargePerAxleAutomatic: string | null
  observedOn: string
}>

/**
 * Uma praça do catálogo, na forma da tela de correção (spec 095) mais `catalogKnown`/`seen` (spec
 * 154 D1) — a origem continua por campo, nunca por linha.
 */
export type TollBoothCatalogEntry = Readonly<{
  actorUserId: string | null
  catalog: TollBoothCatalogTariff
  catalogKnown: boolean
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
  seen: boolean
  source: TollBoothChargeSource
  updatedAt: string | null
}>

export type TollBoothCatalogSummary = Readonly<{
  boothCount: number
  boothsWithoutAxleChargeCount: number
  observedOn: null | string
  status: TollBoothCatalogStatus
}>

export type TollBoothCatalogPagination = Readonly<{
  page: number
  perPage: number
  total: number
}>

export type TollBoothCatalogPage = Readonly<{
  data: readonly TollBoothCatalogEntry[]
  pagination: TollBoothCatalogPagination
  summary: TollBoothCatalogSummary
}>

function isChargeSource(value: unknown): value is TollBoothChargeSource {
  return isOneOf(value, CHARGE_SOURCES)
}

function isTollBoothCatalogTariff(value: unknown): value is TollBoothCatalogTariff {
  return (
    hasExactKeys(value, CATALOG_TARIFF_KEYS) &&
    isNullableDecimalString(value.chargeCar) &&
    isNullableDecimalString(value.chargePerAxle) &&
    isNullableDecimalString(value.chargePerAxleAutomatic) &&
    isString(value.observedOn)
  )
}

function isTollBoothCatalogEntry(value: unknown): value is TollBoothCatalogEntry {
  return (
    hasExactKeys(value, CATALOG_ENTRY_KEYS) &&
    isNullableString(value.actorUserId) &&
    isTollBoothCatalogTariff(value.catalog) &&
    isBoolean(value.catalogKnown) &&
    isChargeSource(value.chargeCarSource) &&
    isChargeSource(value.chargePerAxleAutomaticSource) &&
    isChargeSource(value.chargePerAxleSource) &&
    isNullableDecimalString(value.effectiveChargeCar) &&
    isNullableDecimalString(value.effectiveChargePerAxle) &&
    isNullableDecimalString(value.effectiveChargePerAxleAutomatic) &&
    isNullableString(value.name) &&
    isString(value.observedOn) &&
    isNullableString(value.operator) &&
    isUnsignedIntegerNumber(value.osmNodeId) &&
    isBoolean(value.seen) &&
    isChargeSource(value.source) &&
    isNullableString(value.updatedAt)
  )
}

function isTollBoothCatalogStatus(value: unknown): value is TollBoothCatalogStatus {
  return isOneOf(value, TOLL_BOOTH_CATALOG_STATUSES)
}

function isTollBoothCatalogSummary(value: unknown): value is TollBoothCatalogSummary {
  return (
    hasExactKeys(value, CATALOG_SUMMARY_KEYS) &&
    isUnsignedIntegerNumber(value.boothCount) &&
    isUnsignedIntegerNumber(value.boothsWithoutAxleChargeCount) &&
    isNullableString(value.observedOn) &&
    isTollBoothCatalogStatus(value.status)
  )
}

function isTollBoothCatalogPagination(value: unknown): value is TollBoothCatalogPagination {
  return (
    hasExactKeys(value, CATALOG_PAGINATION_KEYS) &&
    isUnsignedIntegerNumber(value.page) &&
    isUnsignedIntegerNumber(value.perPage) &&
    isUnsignedIntegerNumber(value.total)
  )
}

export function isTollBoothCatalogPage(value: unknown): value is TollBoothCatalogPage {
  return (
    hasExactKeys(value, ['data', 'pagination', 'summary']) &&
    Array.isArray(value.data) &&
    value.data.every(isTollBoothCatalogEntry) &&
    isTollBoothCatalogPagination(value.pagination) &&
    isTollBoothCatalogSummary(value.summary)
  )
}
