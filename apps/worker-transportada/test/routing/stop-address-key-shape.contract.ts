/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { buildStopAddressKey } from '../../src/routing/domain/pool-address-key.js'
import { parseStopAddressKey } from '../../src/routing/domain/stop-address-key.js'

/**
 * ⚠️ **A forma da chave é contrato, não detalhe.**
 *
 * `geocoded_addresses` é chaveada por ela, e a tabela é **permanente** por decisão da ADR-0044 §3.
 * Mudar a normalização — um `trim` a mais, o "S/N" virando vazio, o CEP ganhando máscara — faz
 * **toda** chave em base virar `miss` de uma vez. E o efeito não é um erro: é a base inteira sendo
 * regeocodificada em silêncio, com fatura, enquanto tudo parece funcionar.
 *
 * O risco não é hipotético: `buildStopAddressKey` é uma função de normalização de endereço, o tipo
 * de coisa que se ajusta quando aparece um CEP com formato estranho. Este contrato torna esse ajuste
 * uma **decisão** em vez de um `replace` bem-intencionado.
 *
 * Hoje o formato tem três consumidores: quem o monta (`pool-address-key.ts` aqui e
 * `stop-address-key.ts` na API), quem o lê (`parseStopAddressKey`) e quem o remonta em SQL
 * (`drizzle-pending-address.repository.ts`, na rotina de população).
 */
describe('a forma da chave de parada é contrato (spec 069, T016)', () => {
  /**
   * ⚠️ `concat_ws` **pula argumento nulo**: com `city_code` nulo a chave montada em SQL sai com duas
   * partes, enquanto `buildStopAddressKey` produz três — a normalização dela transforma nulo em
   * vazio. A rotina de população adiantaria uma chave que ninguém consulta, calada.
   *
   * Medido no Postgres: `concat_ws('|', NULL, '14015000', '100')` → `14015000|100`.
   */
  test('the SQL that rebuilds the key coalesces a null city code', async () => {
    const source = await readFile(
      new URL(
        '../../src/geocoding-backfill/infrastructure/drizzle-pending-address.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )
    /** Só as expressões que **montam** a chave; o `select` do valor cru não precisa coalescer. */
    const keyExpressions = source
      .split('\n')
      .filter((line) => line.includes('concat_ws') && line.includes('city_code'))

    expect(keyExpressions.length).toBeGreaterThan(0)
    for (const line of keyExpressions) {
      expect(line).toContain(`coalesce(a."city_code", '')`)
    }
  })

  test('is city code, postal code and number, joined by a pipe', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: '100', postalCode: '14015000' }),
    ).toBe('3543402|14015000|100')
  })

  test('keeps the postal code as eight digits with no mask', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: '100', postalCode: '14015-000' }),
    ).toBe('3543402|14015000|100')
  })

  /** "S/N" é um lugar tão válido quanto qualquer outro, e o vazio não pode virar uma chave própria. */
  test('writes a missing number as S/N', () => {
    expect(buildStopAddressKey({ cityCode: '3543402', number: '', postalCode: '14015000' })).toBe(
      '3543402|14015000|S/N',
    )
    expect(buildStopAddressKey({ cityCode: '3543402', number: null, postalCode: '14015000' })).toBe(
      '3543402|14015000|S/N',
    )
  })

  test('uppercases the number and collapses its spacing', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: 'nº  45 a', postalCode: '14015000' }),
    ).toBe('3543402|14015000|45 A')
  })

  test('refuses a postal code that is not eight digits', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: '100', postalCode: '1401' }),
    ).toBeNull()
  })

  /** O que se monta se lê de volta — é o que liga a rotina de população à sugestão. */
  test('round-trips through the parser the cascade uses', () => {
    const key = buildStopAddressKey({
      cityCode: '3543402',
      number: 'nº 45',
      postalCode: '14015-000',
    })

    expect(parseStopAddressKey(key ?? '')).toEqual({
      cityCode: '3543402',
      number: '45',
      postalCode: '14015000',
    })
  })
})
