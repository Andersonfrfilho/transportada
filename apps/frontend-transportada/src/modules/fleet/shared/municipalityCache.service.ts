/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A lista de municípios de uma UF, guardada no navegador.
 *
 * A lista muda de década em década — a última alteração no país foi em 2013 —, e pedi-la ao IBGE a
 * cada troca de UF é uma ida à rede por um dado que não muda. Um ano é prazo longo porque o dado é
 * estável, e finito porque nada guardado no navegador é para sempre.
 *
 * ⚠️ **Toda leitura e escrita vive em `try`.** `localStorage` lança em janela anônima, com dados de
 * site bloqueados e em contexto de captura de miniatura; sem a guarda, o formulário de motorista
 * cairia por causa de um cache. Falha é ausência: pergunta-se ao provedor de novo.
 *
 * ⚠️ **O depósito é injetado**, como o `fetch` dos clientes deste módulo: o teste desta app não tem
 * DOM, e uma função que fala com `globalThis.localStorage` direto só se prova abrindo um navegador.
 * O padrão da casa é a dependência entrar pela porta.
 */

/** O pedaço de `Storage` que este cache usa — e só ele. */
export type MunicipalityCacheStorage = Readonly<{
  getItem: (key: string) => null | string
  setItem: (key: string, value: string) => void
}>

function defaultStorage(): MunicipalityCacheStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
const KEY_PREFIX = 'fleet.municipalities.'

export const MUNICIPALITY_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000

type CacheEntry = Readonly<{ at: number; names: readonly string[] }>

export function readCachedMunicipalities(input: {
  readonly at: number
  readonly state: string
  readonly storage?: MunicipalityCacheStorage | null
}): readonly string[] | null {
  try {
    const storage = input.storage === undefined ? defaultStorage() : input.storage
    const raw = storage?.getItem(`${KEY_PREFIX}${input.state}`)
    if (raw === null || raw === undefined) return null

    const entry = JSON.parse(raw) as unknown
    if (!isCacheEntry(entry)) return null
    if (input.at - entry.at > MUNICIPALITY_CACHE_TTL_MS) return null

    return entry.names
  } catch {
    /** Entrada ilegível é ausência: manda perguntar de novo, nunca derruba a tela. */
    return null
  }
}

/**
 * ⚠️ **Lista vazia não é gravada.** Ela vem de provedor fora do ar, e cachear isso por um ano seria
 * travar o campo de cidade pelo resto do ano — o pior resultado possível de uma indisponibilidade
 * momentânea.
 */
export function writeCachedMunicipalities(input: {
  readonly at: number
  readonly names: readonly string[]
  readonly state: string
  readonly storage?: MunicipalityCacheStorage | null
}): void {
  if (input.names.length === 0) return
  try {
    const storage = input.storage === undefined ? defaultStorage() : input.storage
    const entry: CacheEntry = { at: input.at, names: input.names }
    storage?.setItem(`${KEY_PREFIX}${input.state}`, JSON.stringify(entry))
  } catch {
    /* sem espaço ou sem permissão: o cache é conveniência, não requisito */
  }
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>

  return (
    typeof record.at === 'number' &&
    Array.isArray(record.names) &&
    record.names.every((name) => typeof name === 'string')
  )
}
