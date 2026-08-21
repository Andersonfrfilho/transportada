/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { formatDecimalAtScale, MONEY_SCALE } from '../../shared/decimal.service.js'
import {
  FREIGHT_VEHICLE_CLASSES,
  type FreightVehicleClass,
} from '../../shared/freight-class.constant.js'
import type {
  FreightRegionCity,
  FreightRegionDriverRate,
  FreightRegionInput,
} from '../application/freight-region.port.js'
import {
  FreightRegionImportEmptyError,
  FreightRegionImportInvalidError,
} from './freight-region.error.js'
import { normalizeRegionCity, parseRegionCode } from './region-coverage.policy.js'

type ParseFreightRegionCsvInput = {
  readonly rates: string
  readonly regions: string
}

type CsvRow = {
  readonly line: number
  readonly values: ReadonlyMap<string, string>
}

type RegionDraft = {
  readonly cities: Map<string, FreightRegionCity>
  readonly code: string
  name: string
  readonly rates: Map<FreightVehicleClass, string>
}

const REGION_COLUMNS = ['code', 'name', 'zone', 'city', 'state'] as const
const RATE_COLUMNS = ['code', ...FREIGHT_VEHICLE_CLASSES] as const

/** Só ponto decimal: `1.086,12` e `1.086` são o mesmo texto até o fim do campo, e adivinhar erra. */
const CSV_MONEY_PATTERN = /^[0-9]{1,15}(?:\.[0-9]{1,4})?$/
const STATE_PATTERN = /^[A-Z]{2}$/

/**
 * A tabela do cliente vem em duas metades — uma linha por cidade e uma linha de valores por rota —
 * e a chave natural que as costura é o código impresso. Dobrar aqui, no domínio, é o que permite
 * reimportar o mesmo arquivo sem escrever nada: o resultado é a rota canônica, não o texto.
 */
export function parseFreightRegionCsv(
  input: ParseFreightRegionCsvInput,
): readonly FreightRegionInput[] {
  const drafts = readRegionRows(input.regions)
  // Antes dos valores: com a lista de rotas vazia, todo valor é órfão, e "código sem rota" seria
  // uma verdade que esconde a única que importa — o arquivo de rotas veio vazio
  if (drafts.size === 0) throw new FreightRegionImportEmptyError()
  applyRateRows({ drafts, text: input.rates })

  return [...drafts.values()].map((draft) => ({
    cities: sortCities([...draft.cities.values()]),
    code: draft.code,
    name: draft.name,
    rates: sortRates(draft.rates),
  }))
}

function readRegionRows(text: string): Map<string, RegionDraft> {
  const drafts = new Map<string, RegionDraft>()

  for (const row of readCsvRows({ columns: REGION_COLUMNS, field: 'regions', text })) {
    const code = read(row, 'code')
    const { zone } = parseRegionCodeAt({ code, field: 'regions', line: row.line })
    const declaredZone = read(row, 'zone')
    // A zona sai do código; a coluna é conferência, e discordar é transcrição errada da planilha
    if (declaredZone !== String(zone)) {
      throw invalid({
        field: 'regions',
        line: row.line,
        message: `zone ${declaredZone} does not match the zone ${zone} of code ${code}`,
      })
    }

    const name = read(row, 'name')
    if (name.length === 0) {
      throw invalid({ field: 'regions', line: row.line, message: 'name is required' })
    }

    const city = normalizeRegionCity(read(row, 'city'))
    const state = read(row, 'state').toUpperCase()
    if (city.length === 0 || !STATE_PATTERN.test(state)) {
      throw invalid({
        field: 'regions',
        line: row.line,
        message: 'city and two letter UF are required',
      })
    }

    const draft = drafts.get(code)
    if (draft === undefined) {
      drafts.set(code, {
        cities: new Map([[`${city}/${state}`, { city, state }]]),
        code,
        name,
        rates: new Map(),
      })
      continue
    }
    if (draft.name !== name) {
      throw invalid({
        field: 'regions',
        line: row.line,
        message: `code ${code} is already named ${draft.name}`,
      })
    }
    if (draft.cities.has(`${city}/${state}`)) {
      throw invalid({
        field: 'regions',
        line: row.line,
        message: `city ${city}/${state} is repeated in code ${code}`,
      })
    }
    draft.cities.set(`${city}/${state}`, { city, state })
  }

  return drafts
}

function applyRateRows(input: {
  readonly drafts: Map<string, RegionDraft>
  readonly text: string
}): void {
  for (const row of readCsvRows({ columns: RATE_COLUMNS, field: 'rates', text: input.text })) {
    const code = read(row, 'code')
    parseRegionCodeAt({ code, field: 'rates', line: row.line })

    const draft = input.drafts.get(code)
    // Valor sem rota é linha órfã: aceitar em silêncio esconde o código digitado errado
    if (draft === undefined) {
      throw invalid({ field: 'rates', line: row.line, message: `code ${code} has no region` })
    }

    for (const freightClass of FREIGHT_VEHICLE_CLASSES) {
      const value = read(row, freightClass)
      if (!CSV_MONEY_PATTERN.test(value)) {
        throw invalid({
          field: 'rates',
          line: row.line,
          message: `${freightClass} value "${value}" is not a decimal written with a dot`,
        })
      }
      const amount = formatDecimalAtScale(value, MONEY_SCALE)
      // Zero é classe que não roda a rota; guardá-lo diria que a transportadora paga nada por ela
      if (Number(value) === 0) continue
      draft.rates.set(freightClass, amount)
    }
  }
}

function parseRegionCodeAt(input: {
  readonly code: string
  readonly field: string
  readonly line: number
}): { readonly zone: number } {
  try {
    return parseRegionCode(input.code)
  } catch {
    throw invalid({
      field: input.field,
      line: input.line,
      message: `code "${input.code}" is not a route code`,
    })
  }
}

function readCsvRows(input: {
  readonly columns: readonly string[]
  readonly field: string
  readonly text: string
}): readonly CsvRow[] {
  // BOM e CRLF são a assinatura do arquivo salvo pelo Excel, que é como o cliente exporta
  const lines = input.text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const [header] = lines
  const columns = header === undefined ? [] : splitCsvLine(header).map((value) => value.trim())
  const missing = input.columns.filter((column) => !columns.includes(column))
  if (missing.length > 0 || columns.length !== input.columns.length) {
    throw invalid({
      field: input.field,
      line: 1,
      message: `header must be ${input.columns.join(', ')}`,
    })
  }

  const rows: CsvRow[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim().length === 0) continue
    const values = splitCsvLine(line).map((value) => value.trim())
    if (values.length !== columns.length) {
      throw invalid({
        field: input.field,
        line: index + 1,
        message: `expected ${columns.length} columns, found ${values.length}`,
      })
    }
    rows.push({
      line: index + 1,
      values: new Map(columns.map((column, position) => [column, values[position] ?? ''])),
    })
  }
  return rows
}

/** Cidade com vírgula no nome vem entre aspas; partir por vírgula solta quebraria a linha em duas. */
function splitCsvLine(line: string): readonly string[] {
  const characters = [...line]
  const values: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index] ?? ''
    if (quoted) {
      if (character !== '"') {
        current += character
        continue
      }
      if (characters[index + 1] === '"') {
        current += '"'
        index += 1
        continue
      }
      quoted = false
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character === ',') {
      values.push(current)
      current = ''
      continue
    }
    current += character
  }
  values.push(current)
  return values
}

function read(row: CsvRow, column: string): string {
  return row.values.get(column) ?? ''
}

function invalid(input: {
  readonly field: string
  readonly line: number
  readonly message: string
}): FreightRegionImportInvalidError {
  return new FreightRegionImportInvalidError([
    { field: input.field, message: `line ${input.line}: ${input.message}` },
  ])
}

/** A ordem canônica é a mesma da leitura do repositório — senão importar e listar discordam. */
function sortCities(cities: readonly FreightRegionCity[]): readonly FreightRegionCity[] {
  return [...cities].sort(
    (first, second) =>
      first.city.localeCompare(second.city) || first.state.localeCompare(second.state),
  )
}

function sortRates(
  rates: ReadonlyMap<FreightVehicleClass, string>,
): readonly FreightRegionDriverRate[] {
  return [...rates.entries()]
    .map(([freightClass, driverAmount]) => ({ driverAmount, freightClass }))
    .sort((first, second) => first.freightClass.localeCompare(second.freightClass))
}
