/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './fleetGuards.validation'
import { BRAZIL_STATE, FLEET_FIELD_ENTRY_MODE, type FleetFieldEntryMode } from './fleet.types'

/**
 * O IBGE publica o município pela BrasilAPI, o mesmo provedor que já atende o CEP deste formulário:
 * cidade é lista fechada, e digitá-la à mão é como "Sao Paulo", "S. Paulo" e "SÃO PAULO" entram na
 * mesma base — três cidades para o relatório, uma para quem digitou.
 */
const IBGE_MUNICIPALITY_URL = 'https://brasilapi.com.br/api/ibge/municipios/v1'

/** Lista de município muda por lei, não por semana: buscar de novo na mesma sessão é desperdício. */
export const MUNICIPALITY_STALE_TIME_MS = 86_400_000

export const MUNICIPALITY_QUERY_KEY = 'fleet-municipalities'

export type MunicipalityChoice = Readonly<{ label: string; value: string }>

export type MunicipalityLookupInput = Readonly<{
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  state: string
}>

/** Conectivo fica minúsculo no meio do nome: "Rio de Janeiro", nunca "Rio De Janeiro". */
const MUNICIPALITY_CONNECTORS = ['da', 'das', 'de', 'do', 'dos', 'e'] as const

const WHITESPACE_PATTERN = /\s+/g
const DIACRITIC_PATTERN = /\p{M}/gu

function capitalize(value: string): string {
  const [head = '', ...rest] = value
  return `${head.toUpperCase()}${rest.join('')}`
}

/** "SANTA BÁRBARA D'OESTE" tem o apóstrofo minúsculo e a palavra seguinte maiúscula. */
function toApostropheCase(word: string, isFirstWord: boolean): string {
  const pieces = word.split("'")
  const [head = '', tail = ''] = pieces
  if (pieces.length === 2 && head === 'd' && !isFirstWord) return `d'${capitalize(tail)}`
  return pieces.map((piece) => capitalize(piece)).join("'")
}

function toWord(word: string, isFirstWord: boolean): string {
  if (!isFirstWord && MUNICIPALITY_CONNECTORS.some((connector) => connector === word)) return word
  return word
    .split('-')
    .map((piece) => toApostropheCase(piece, isFirstWord))
    .join('-')
}

/**
 * O IBGE devolve o nome em caixa alta e o provedor de CEP devolve em caixa mista. Sem uma grafia só,
 * o município escolhido na lista e o mesmo município vindo do CEP são duas linhas diferentes.
 */
export function toMunicipalityLabel(value: string): string {
  const words = value.trim().replace(WHITESPACE_PATTERN, ' ').toLowerCase().split(' ')
  return words.map((word, index) => toWord(word, index === 0)).join(' ')
}

/** Dobra única: acento, caixa e espaço a mais não fazem dois municípios. */
export function normalizeMunicipalityName(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(DIACRITIC_PATTERN, '')
    .toUpperCase()
    .replace(WHITESPACE_PATTERN, ' ')
}

async function readMunicipalityNames(response: Response): Promise<readonly string[]> {
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) return []

  return payload
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => (isString(entry['nome']) ? entry['nome'].trim() : ''))
    .filter((name) => name !== '')
    .map((name) => toMunicipalityLabel(name))
    .sort((left, right) => left.localeCompare(right, 'pt-BR'))
}

/**
 * UF fora da lista não vira requisição: o provedor responderia 404 e a tela mostraria um campo
 * carregando para sempre. Provedor fora do ar propaga o erro — quem decide o que fazer é a consulta,
 * e sem lista o campo volta a ser digitável.
 */
export async function listMunicipalities(
  input: MunicipalityLookupInput,
): Promise<readonly string[]> {
  const state = input.state.trim().toUpperCase()
  if (!BRAZIL_STATE.some((candidate) => candidate === state)) return []

  const response = await input.fetch(`${IBGE_MUNICIPALITY_URL}/${state}`, { signal: input.signal })
  if (!response.ok) throw new Error('FLEET_MUNICIPALITY_REQUEST_FAILED')
  return await readMunicipalityNames(response)
}

/**
 * O que já está gravado manda na grafia, ao contrário do catálogo de veículo: o gatilho do select
 * casa a opção pelo valor, e trocar "São Paulo" pela grafia do IBGE deixaria o campo mostrando o
 * placeholder com cidade preenchida. Cidade que o IBGE não lista continua na lista — a ficha antiga
 * não pode perder o que tem por causa da lista de hoje.
 */
export function buildMunicipalityChoices(
  input: Readonly<{ municipalities: readonly string[]; selected: string }>,
): readonly MunicipalityChoice[] {
  const selected = input.selected.trim()
  const folded = normalizeMunicipalityName(selected)
  const names = new Map<string, string>()

  for (const municipality of input.municipalities) {
    const key = normalizeMunicipalityName(municipality)
    if (key === '' || names.has(key)) continue
    names.set(key, municipality)
  }
  if (folded !== '') names.set(folded, selected)

  return [...names.values()]
    .sort((left, right) => left.localeCompare(right, 'pt-BR'))
    .map((name) => ({ label: name, value: name }))
}

/**
 * Sem UF não há lista: o município só é único dentro do estado, e um select com 5.570 linhas do país
 * inteiro é pior que o teclado. Lista vazia é provedor fora do ar, e cadastro não pode parar por isso.
 */
export function resolveMunicipalityEntryMode(
  input: Readonly<{ choiceCount: number; hasState: boolean; isLoading: boolean }>,
): FleetFieldEntryMode {
  const { LIST, TEXT } = FLEET_FIELD_ENTRY_MODE
  if (input.isLoading) return LIST
  if (!input.hasState) return TEXT
  return input.choiceCount === 0 ? TEXT : LIST
}
