/* Copyright (c) 2026 Ada Technology. MIT License. */

import { DEFAULT_FUEL_PRODUCT, type FuelProduct } from '@/modules/shared/fuel.constant'

import {
  BRAZIL_STATE,
  VEHICLE_COLOR,
  type FleetVehicleFormState,
  type MdfeBodyType,
  type VehicleColor,
} from '../../fleet/shared/fleet.types'
import { isValidCnpj, isValidCpf, isValidPlate, isValidRenavam } from './checkDigit.service'
import { normalizeLabel, readValueBelowLabel } from './labelGeometry.service'
import type { PdfPageText } from './pdfTextLayer.service'

/**
 * Spec 048: o CRLV preenche o que ele diz, e **só** o que ele diz. Cada campo que fica em branco
 * fica com o motivo à vista: campo vazio sem explicação vira digitação de novo, e valor inventado
 * vira frete errado.
 */
export type CrlvRemarkReason =
  | 'ambiguousDiesel'
  | 'checkDigitFailed'
  | 'notInCatalog'
  | 'notInformed'
  | 'notPrinted'

export type CrlvRemark = Readonly<{
  field: string
  reason: CrlvRemarkReason
}>

export type CrlvReading = Readonly<{
  remarks: readonly CrlvRemark[]
  values: Partial<FleetVehicleFormState>
}>

const LABEL = {
  axleCount: 'EIXOS',
  bodyType: 'CARROCERIA',
  color: 'COR PREDOMINANTE',
  fuelType: 'COMBUSTIVEL',
  modelYear: 'ANO MODELO',
  municipalityState: 'MUNICIPIO / UF',
  ownerName: 'NOME',
  ownerTaxId: 'CPF / CNPJ',
  plate: 'PLACA',
  renavam: 'CODIGO RENAVAM',
  vehicleModel: 'MARCA / MODELO / VERSAO',
} as const

/** O Detran imprime `*` onde não informou. Asterisco é campo vazio, nunca `0`. */
const NOT_INFORMED_MARK = '*'

const BODY_TYPE_BY_PRINTED: Readonly<Record<string, MdfeBodyType>> = {
  'CARGA ABERTA': '01',
  ABERTA: '01',
  BAU: '02',
  'CARGA FECHADA': '02',
  FECHADA: '02',
  FURGAO: '02',
  GRANELEIRA: '03',
  'PORTA CONTAINER': '04',
  SIDER: '05',
  'NAO APLICAVEL': '00',
}

/**
 * O CRLV imprime `ALCOOL/GASOLINA` para o flex, e o nosso catálogo não tem "flex": tem produto
 * principal e produto secundário. Álcool primeiro porque é a ordem que o documento imprime.
 */
const FUEL_BY_PRINTED: Readonly<
  Record<string, Readonly<{ primary: FuelProduct; secondary?: FuelProduct }>>
> = {
  'ALCOOL / GASOLINA': { primary: 'etanol-hidratado', secondary: 'gasolina-comum' },
  'ALCOOL/GASOLINA': { primary: 'etanol-hidratado', secondary: 'gasolina-comum' },
  ALCOOL: { primary: 'etanol-hidratado' },
  ELETRICO: { primary: 'eletrico' },
  'GASOLINA / ALCOOL': { primary: 'gasolina-comum', secondary: 'etanol-hidratado' },
  'GASOLINA/ALCOOL': { primary: 'gasolina-comum', secondary: 'etanol-hidratado' },
  GASOLINA: { primary: 'gasolina-comum' },
  'GAS NATURAL': { primary: 'gnv' },
  GNV: { primary: 'gnv' },
}

const DIESEL_PRINTED = 'DIESEL'
const MODEL_YEAR_LENGTH = 4

function readLabel(page: PdfPageText, label: string): string | undefined {
  const value = readValueBelowLabel(page.fragments, label)
  if (value === undefined) return undefined

  const trimmed = value.trim()

  return trimmed.length === 0 || trimmed === NOT_INFORMED_MARK ? undefined : trimmed
}

/** `MARCA / MODELO / VERSÃO` parte no **primeiro** `/`: a versão faz parte do modelo, a marca não. */
function splitBrandAndModel(printed: string): Readonly<{ brand: string; model: string }> {
  const separator = printed.indexOf('/')
  if (separator < 0) return { brand: printed.trim(), model: '' }

  return {
    brand: printed.slice(0, separator).trim(),
    model: printed.slice(separator + 1).trim(),
  }
}

function toVehicleColor(printed: string): VehicleColor | undefined {
  const normalized = normalizeLabel(printed).toLowerCase().replace(/\s+/gu, '_')

  return VEHICLE_COLOR.find((color) => color === normalized)
}

function toBodyType(printed: string): MdfeBodyType | undefined {
  return BODY_TYPE_BY_PRINTED[normalizeLabel(printed)]
}

/** `SÃO PAULO / SP` — a UF é o que vem depois da última barra, e é fechada em 27. */
function toState(printed: string): string | undefined {
  const candidate = normalizeLabel(printed.split('/').at(-1) ?? '')

  return BRAZIL_STATE.find((state) => state === candidate)
}

type Collector = Readonly<{
  remark: (field: string, reason: CrlvRemarkReason) => void
  values: { -readonly [Field in keyof FleetVehicleFormState]?: FleetVehicleFormState[Field] }
}>

function collectIdentity(page: PdfPageText, collector: Collector): void {
  const plate = readLabel(page, LABEL.plate)
  if (plate !== undefined) {
    const normalized = plate.toUpperCase().replace(/[^A-Z0-9]/gu, '')
    if (isValidPlate(normalized)) collector.values.plate = normalized
    else collector.remark('plate', 'checkDigitFailed')
  }

  const renavam = readLabel(page, LABEL.renavam)
  if (renavam !== undefined) {
    const digits = renavam.replace(/\D/gu, '')
    if (isValidRenavam(digits)) collector.values.renavam = digits
    else collector.remark('renavam', 'checkDigitFailed')
  }

  const municipality = readLabel(page, LABEL.municipalityState)
  if (municipality !== undefined) {
    const state = toState(municipality)
    if (state === undefined) collector.remark('state', 'notInCatalog')
    else collector.values.state = state
  }
}

function collectModel(page: PdfPageText, collector: Collector): void {
  const printedModel = readLabel(page, LABEL.vehicleModel)
  if (printedModel !== undefined) {
    const { brand, model } = splitBrandAndModel(printedModel)
    if (brand.length > 0) collector.values.brand = brand
    if (model.length > 0) collector.values.model = model
  }

  const modelYear = readLabel(page, LABEL.modelYear)?.replace(/\D/gu, '')
  if (modelYear !== undefined && modelYear.length === MODEL_YEAR_LENGTH) {
    collector.values.modelYear = modelYear
  }

  const color = readLabel(page, LABEL.color)
  if (color !== undefined) {
    const known = toVehicleColor(color)
    if (known === undefined) collector.remark('color', 'notInCatalog')
    else collector.values.color = known
  }
}

function collectOperation(page: PdfPageText, collector: Collector): void {
  const axleCount = readLabel(page, LABEL.axleCount)?.replace(/\D/gu, '')
  if (axleCount === undefined || axleCount.length === 0)
    collector.remark('axleCount', 'notInformed')
  else collector.values.axleCount = axleCount

  const bodyType = readLabel(page, LABEL.bodyType)
  if (bodyType !== undefined) {
    const known = toBodyType(bodyType)
    if (known === undefined) collector.remark('bodyType', 'notInCatalog')
    else collector.values.bodyType = known
  }

  const fuel = readLabel(page, LABEL.fuelType)
  if (fuel !== undefined) collectFuel(fuel, collector)

  // O CRLV imprime peso bruto total (tara + carga) e não imprime a tara. Capacidade é a subtração.
  collector.remark('capacityKilograms', 'notPrinted')
}

/**
 * O documento diz `DIESEL` e para por aí — S10 e S500 são o mesmo carimbo para ele. Preencher o
 * padrão da frota é o certo (S10 é o obrigatório desde 2012), mas em silêncio seria escolher o
 * preço do litro pelo operador: o motivo vai junto.
 */
function collectFuel(printed: string, collector: Collector): void {
  const normalized = normalizeLabel(printed)
  if (normalized.startsWith(DIESEL_PRINTED)) {
    collector.values.fuelType = DEFAULT_FUEL_PRODUCT
    collector.remark('fuelType', 'ambiguousDiesel')
    return
  }

  const known = FUEL_BY_PRINTED[normalized]
  if (known === undefined) {
    collector.remark('fuelType', 'notInCatalog')
    return
  }

  collector.values.fuelType = known.primary
  if (known.secondary !== undefined) collector.values.secondaryFuelType = known.secondary
}

function collectOwner(page: PdfPageText, collector: Collector): void {
  const name = readLabel(page, LABEL.ownerName)
  if (name !== undefined) collector.values.ownerName = name

  const taxId = readLabel(page, LABEL.ownerTaxId)
  if (taxId === undefined) return

  const cleaned = taxId.replace(/[^0-9A-Za-z]/gu, '').toUpperCase()
  if (isValidCpf(cleaned) || isValidCnpj(cleaned)) collector.values.ownerTaxId = cleaned
  else collector.remark('ownerTaxId', 'checkDigitFailed')
}

export function readCrlvVehicle(page: PdfPageText): CrlvReading {
  const remarks: CrlvRemark[] = []
  const collector: Collector = {
    remark: (field, reason) => remarks.push({ field, reason }),
    values: {},
  }

  collectIdentity(page, collector)
  collectModel(page, collector)
  collectOperation(page, collector)
  collectOwner(page, collector)

  return { remarks, values: collector.values }
}
