/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 T3.2 (RF4): a lista de ícones do seletor do painel é a do catálogo da API. O bundle não
 * carrega código de lá, então a API é lida como texto.
 */
import { describe, expect, it } from 'bun:test'

import { OCCURRENCE_TYPE_ICON_NAMES } from '@/modules/trip/shared/occurrenceTypeIcon.constant'

const API_CATALOG_SOURCE = new URL(
  '../../../api-transportada/src/shared/trip-occurrence.constant.ts',
  import.meta.url,
)

describe('catálogo de ícones do seletor do painel (spec 255 T3.2)', () => {
  it('é igual ao OCCURRENCE_TYPE_ICON_NAMES da API, na mesma ordem', async () => {
    const text = await Bun.file(API_CATALOG_SOURCE).text()
    const block = /export const OCCURRENCE_TYPE_ICON_NAMES = \[([^\]]*)\] as const/u.exec(text)
    expect(block?.[1]).toBeDefined()
    const apiNames = [...(block?.[1] ?? '').matchAll(/'([^']+)'/gu)].map((match) => match[1] ?? '')
    expect([...OCCURRENCE_TYPE_ICON_NAMES] as string[]).toEqual(apiNames)
  })
})
