/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  HOLIDAY_PROVIDER_NATIONAL_CODE,
  HOLIDAY_PROVIDER_SCOPE,
  HOLIDAY_PROVIDER_TYPE,
} from './holiday-provider.constant.js'
import type {
  HolidayProviderRequest,
  ProviderHolidayEntry,
  ProviderHolidayItem,
} from './holiday-provider.types.js'

const STATE_CODE_LENGTH = 2

type StorageKey = Pick<ProviderHolidayEntry, 'ibgeCode' | 'scope'>

type ClassifyParams = {
  readonly items: readonly ProviderHolidayItem[]
  readonly request: HolidayProviderRequest
}

type ResolveParams = {
  readonly item: ProviderHolidayItem
  readonly request: HolidayProviderRequest
}

/**
 * Onde o cache guarda cada data de uma resposta. O estadual que vem na resposta de uma **cidade** é
 * gravado com `scope = 'state'` e a UF (os 2 primeiros dígitos do código), nunca com o código da
 * cidade (ADR-0100 §3). O que a resposta não deveria trazer para o pedido — o municipal numa resposta
 * de estado, o nacional numa de cidade — fica de fora: a paridade do nacional vem da busca própria.
 */
function resolveStorageKey({ item, request }: ResolveParams): StorageKey | undefined {
  const { MUNICIPAL, NATIONAL, STATE } = HOLIDAY_PROVIDER_TYPE
  const { CITY, NATIONAL: NATIONAL_SCOPE, STATE: STATE_SCOPE } = HOLIDAY_PROVIDER_SCOPE

  switch (item.providerType) {
    case MUNICIPAL:
      return request.scope === CITY ? { ibgeCode: request.ibgeCode, scope: CITY } : undefined
    case STATE:
      if (request.scope === CITY) {
        return { ibgeCode: request.ibgeCode.slice(0, STATE_CODE_LENGTH), scope: STATE_SCOPE }
      }
      return request.scope === STATE_SCOPE
        ? { ibgeCode: request.ibgeCode, scope: STATE_SCOPE }
        : undefined
    case NATIONAL:
      return request.scope === NATIONAL_SCOPE
        ? { ibgeCode: HOLIDAY_PROVIDER_NATIONAL_CODE, scope: NATIONAL_SCOPE }
        : undefined
    default:
      return { ibgeCode: request.ibgeCode, scope: request.scope }
  }
}

export function classifyProviderItems({
  items,
  request,
}: ClassifyParams): readonly ProviderHolidayEntry[] {
  const entries = items.flatMap((item) => {
    const key = resolveStorageKey({ item, request })
    return key === undefined ? [] : [{ ...item, ...key }]
  })

  return mergeProviderEntries(entries)
}

/** Duas datas na mesma `(escopo, ibge, data)` viram uma: vence a não facultativa (ADR-0100 §3). */
export function mergeProviderEntries(
  entries: readonly ProviderHolidayEntry[],
): readonly ProviderHolidayEntry[] {
  const byKey = new Map<string, ProviderHolidayEntry>()

  for (const entry of entries) {
    const key = `${entry.scope}\u0000${entry.ibgeCode}\u0000${entry.date}`
    const existing = byKey.get(key)
    const replacesFacultative =
      existing?.providerType === HOLIDAY_PROVIDER_TYPE.FACULTATIVE &&
      entry.providerType !== HOLIDAY_PROVIDER_TYPE.FACULTATIVE

    if (existing === undefined || replacesFacultative) byKey.set(key, entry)
  }

  return [...byKey.values()]
}
