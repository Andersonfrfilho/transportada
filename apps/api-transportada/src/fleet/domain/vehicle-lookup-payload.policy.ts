/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleLookup } from '../application/fleet.port.js'

const BRAND_MODEL_SEPARATOR = '/'
const COMBINED_BRAND_MODEL_KEY = 'marcamodelo'
const MAX_ENVELOPE_DEPTH = 3

const ENVELOPE_KEYS: ReadonlySet<string> = new Set([
  'dados',
  'data',
  'resultado',
  'result',
  'vehicle',
  'veiculo',
])

/** Cada serviço de consulta de placa nomeia os campos do seu jeito; a chave é comparada sem acento, caixa ou separador. */
const FIELD_ALIASES: Readonly<Record<string, keyof FleetVehicleLookup>> = {
  ano: 'modelYear',
  anomodelo: 'modelYear',
  brand: 'brand',
  capacidade: 'capacityKilograms',
  capacidadecarga: 'capacityKilograms',
  capacidadekg: 'capacityKilograms',
  capacitykilograms: 'capacityKilograms',
  cnpjproprietario: 'ownerTaxId',
  cpfcnpj: 'ownerTaxId',
  cpfcnpjproprietario: 'ownerTaxId',
  cpfproprietario: 'ownerTaxId',
  documentoproprietario: 'ownerTaxId',
  estado: 'state',
  lotacao: 'capacityKilograms',
  marca: 'brand',
  model: 'model',
  modelo: 'model',
  modelyear: 'modelYear',
  nomeproprietario: 'ownerName',
  ownername: 'ownerName',
  ownertaxid: 'ownerTaxId',
  pesotara: 'tareWeightKilograms',
  placa: 'plate',
  plate: 'plate',
  proprietario: 'ownerName',
  renavam: 'renavam',
  state: 'state',
  tara: 'tareWeightKilograms',
  tareweightkilograms: 'tareWeightKilograms',
  uf: 'state',
  ufplaca: 'state',
}

const DIGIT_FIELDS: ReadonlySet<keyof FleetVehicleLookup> = new Set([
  'capacityKilograms',
  'modelYear',
  'ownerTaxId',
  'renavam',
  'tareWeightKilograms',
])

const EMPTY_LOOKUP: FleetVehicleLookup = {
  brand: '',
  capacityKilograms: '',
  model: '',
  modelYear: '',
  ownerName: '',
  ownerTaxId: '',
  plate: '',
  renavam: '',
  state: '',
  tareWeightKilograms: '',
}

/** Traduz a resposta do provedor externo para o nosso formato, descartando todo campo que não pedimos. */
export function normalizeVehicleLookupPayload(payload: unknown): FleetVehicleLookup | null {
  const source = unwrapEnvelope(payload, 0)
  if (source === null) return null

  const fields: Record<keyof FleetVehicleLookup, string> = { ...EMPTY_LOOKUP }
  applyCombinedBrandModel(source, fields)
  for (const [key, value] of Object.entries(source)) {
    const field = FIELD_ALIASES[normalizeKey(key)]
    if (field === undefined) continue
    const text = readText(value)
    if (text !== '') fields[field] = formatField(field, text)
  }

  return fields.plate === '' ? null : fields
}

function unwrapEnvelope(payload: unknown, depth: number): Record<string, unknown> | null {
  if (!isPlainObject(payload)) return null
  if (hasPlate(payload)) return payload
  if (depth >= MAX_ENVELOPE_DEPTH) return null

  for (const [key, value] of Object.entries(payload)) {
    if (!ENVELOPE_KEYS.has(normalizeKey(key))) continue
    const inner = unwrapEnvelope(value, depth + 1)
    if (inner !== null) return inner
  }
  return null
}

function hasPlate(payload: Record<string, unknown>): boolean {
  return Object.entries(payload).some(
    ([key, value]) => FIELD_ALIASES[normalizeKey(key)] === 'plate' && readText(value) !== '',
  )
}

// Vários serviços devolvem "MARCA/MODELO" num campo só
function applyCombinedBrandModel(
  source: Record<string, unknown>,
  fields: Record<keyof FleetVehicleLookup, string>,
): void {
  const entry = Object.entries(source).find(
    ([key]) => normalizeKey(key) === COMBINED_BRAND_MODEL_KEY,
  )
  if (entry === undefined) return

  const [brand, ...model] = readText(entry[1]).split(BRAND_MODEL_SEPARATOR)
  fields.brand = (brand ?? '').trim()
  fields.model = model.join(BRAND_MODEL_SEPARATOR).trim()
}

function formatField(field: keyof FleetVehicleLookup, text: string): string {
  if (DIGIT_FIELDS.has(field)) return text.replace(/[^0-9]/g, '')
  if (field === 'plate') return text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (field === 'state') return text.toUpperCase().replace(/[^A-Z]/g, '')
  return text
}

function normalizeKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function readText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
