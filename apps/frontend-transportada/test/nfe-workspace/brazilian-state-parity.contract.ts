/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { BRAZILIAN_STATE_IBGE_PREFIX } from '../../src/modules/nfe-workspace/shared/addressCorrection.validation.js'

const API = new URL(
  '../../../api-transportada/src/address-correction/domain/brazilian-state.constant.ts',
  import.meta.url,
)

/**
 * ⚠️ **Cópia por valor, no mesmo padrão de `physical-destination-parity.contract.ts`.** A tabela de
 * UF → prefixo IBGE de `addressCorrection.validation.ts` é dado de domínio duplicado de propósito
 * (`api-transportada/src/address-correction/domain/brazilian-state.constant.ts`, RF3) — as apps não
 * importam código uma da outra. Divergir é calado: o front validaria um `cityCode` como coerente com
 * a UF enquanto o servidor recusaria, ou o contrário.
 */
describe('brazilian state IBGE prefix parity (spec 150, revisão final)', () => {
  test('the frontend copy has exactly the same 27 entries as the API copy', async () => {
    const apiSource = await readFile(API, 'utf8')

    const apiEntries: (readonly [string, string])[] = [
      ...apiSource.matchAll(/^\s{2}([A-Z]{2}): '(\d{2})',?$/gmu),
    ].map(([, state, prefix]) => [state ?? '', prefix ?? ''] as const)
    expect(apiEntries).toHaveLength(27)

    const apiTable: Readonly<Record<string, string>> = Object.fromEntries(apiEntries)
    expect(BRAZILIAN_STATE_IBGE_PREFIX).toEqual(apiTable)
  })
})
