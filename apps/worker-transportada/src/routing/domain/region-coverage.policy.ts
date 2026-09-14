/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/freight-regions/domain/region-coverage.policy.ts`.
 * As duas apps não importam código uma da outra, e esta é a regra que decide **onde o motorista
 * pode entregar** — se divergir, o roteiro proposto pelo worker mandaria o agregado para uma zona
 * que a tabela de frete não reconhece, e o custo dele sairia errado no mesmo dia.
 * `test/driver-coverage/policy-parity.contract.ts` compara os dois arquivos.
 *
 * A única diferença deliberada: código fora da forma impressa devolve `null` em vez de lançar. Aqui
 * é leitura de dado já gravado, e derrubar a roteirização inteira por uma linha velha de importação
 * seria trocar um roteiro imperfeito por roteiro nenhum.
 */

/** A forma impressa na coluna NUM ROTA: família, ponto, três dígitos. */
export const REGION_CODE_PATTERN = /^([0-9])\.(00[0-3])$/
const WHITESPACE_PATTERN = /\s+/g
const DIACRITIC_PATTERN = /\p{Diacritic}/gu

/** Família `0` é a matriz — saída, não zona. Por isso ela não entra na contagem acumulativa. */
const HEAD_OFFICE_FAMILY = '0'
const HEAD_OFFICE_ZONE = 0

export type RegionCode = {
  readonly family: string
  readonly zone: number
}

export function parseRegionCode(code: string): RegionCode | null {
  const match = REGION_CODE_PATTERN.exec(code)
  if (match === null) return null

  const [, family, sequence] = match as unknown as readonly [string, string, string]

  return {
    family,
    zone: family === HEAD_OFFICE_FAMILY ? HEAD_OFFICE_ZONE : Number(sequence) + 1,
  }
}

/**
 * A coluna OBSERVAÇÃO do PDF diz "Todas da Zona 1, 2, mais Zona 3": quem cobre a zona 3 cobre as
 * abaixo. A redundância não é guardada — cada cidade nasce na zona própria e a cobertura é resolvida
 * aqui.
 */
export function coversRegion(input: {
  readonly candidate: string
  readonly coverage: string
}): boolean {
  const candidate = parseRegionCode(input.candidate)
  const coverage = parseRegionCode(input.coverage)
  if (candidate === null || coverage === null) return false

  if (candidate.family !== coverage.family) return false

  return candidate.zone <= coverage.zone
}

/** Dobra única de nome de cidade: "Matão", "MATÃO" e "  matão " são a mesma cidade. */
export function normalizeRegionCity(value: string): string {
  return value.trim().toUpperCase().replace(WHITESPACE_PATTERN, ' ')
}

/**
 * A chave de **casamento** da cidade — `normalizeRegionCity` mais a dobra do acento. A NF-e escreve
 * o município sem acento e a planilha do cliente escreve com; medido na base em 2026-09-05, a dobra
 * levou o casamento de 39 para 65 das 76 cidades de destino.
 */
export function foldRegionCity(value: string): string {
  return normalizeRegionCity(value).normalize('NFD').replace(DIACRITIC_PATTERN, '')
}

/** A chave de cidade usada no casamento: cidade dobrada e UF em caixa alta. */
export function buildRegionCityKey(input: {
  readonly city: string
  readonly state: string
}): string {
  return `${foldRegionCity(input.city)}|${input.state.trim().toUpperCase()}`
}
