/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { buildStopAddressKey } from '../../src/trips/domain/stop-address-key.js'

/**
 * ⚠️ **A chave remontada em SQL tem de coalescer o município.**
 *
 * `concat_ws` **pula argumento nulo**: sem `coalesce`, `city_code` nulo produz uma chave de duas
 * partes (`14015000|100`), enquanto `buildStopAddressKey` produz três (`|14015000|100`) — porque a
 * normalização dela transforma nulo em vazio. A comparação nunca casa.
 *
 * O efeito não é um erro: é o **degrau 2 da escada** (adendo 2026-09-01 da ADR-0044) recusando
 * calado. `refineAddress` não acha o endereço, responde `not_improved` sem chamar provedor nenhum, e
 * o conferente que marcou a parada conclui que a marca está quebrada.
 *
 * O comportamento está provado em `test/integration/address-components-source.integration.ts`, que
 * precisa de Postgres. Este contrato roda **sempre**, e é ele que impede o `coalesce` de sair num
 * refactor de quem não vê o defeito — que é exatamente como ele entrou.
 */
describe('the SQL that rebuilds the stop address key', () => {
  test('coalesces a null city code', async () => {
    const source = await readFile(
      new URL(
        '../../src/routing/infrastructure/drizzle-address-components.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const keyExpressions = source
      .split('\n')
      .filter((line) => line.includes('concat_ws') && line.includes('cityCode'))

    expect(keyExpressions.length).toBeGreaterThan(0)
    for (const line of keyExpressions) {
      expect(line).toContain("coalesce(${nfeAddresses.cityCode}, '')")
    }
  })

  /** O outro lado do casamento: é esta forma que o SQL precisa reproduzir. */
  test('is the three-part shape buildStopAddressKey produces without a city code', () => {
    expect(buildStopAddressKey({ cityCode: null, number: '100', postalCode: '14015-000' })).toBe(
      '|14015000|100',
    )
  })
})
