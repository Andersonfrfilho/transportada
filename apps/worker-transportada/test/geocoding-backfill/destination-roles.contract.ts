/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

const SOURCE = new URL(
  '../../src/geocoding-backfill/infrastructure/drizzle-pending-address.repository.ts',
  import.meta.url,
)

/**
 * Spec 073 RF7 / CA6: a população adiantada existe para que a coordenada já esteja em base quando o
 * solver pedir. Se ela só adiantar o endereço do **destinatário**, toda nota com `<entrega>` chega
 * ao solver com a parada fria — e a rotina que existe para evitar isso passa a garantir o contrário.
 */
describe('geocoding backfill covers both destination roles (spec 073)', () => {
  /**
   * A rotina adianta os **dois** papéis, não só o escolhido. Escolher em SQL exigiria repetir ali a
   * precedência de `<entrega>` — e o superconjunto **nunca erra por falta**: qualquer endereço que
   * possa virar parada está nele. O excedente é barato por construção, porque o degrau que resolve
   * é o do CEP, gratuito; o provedor pago só entra por marca humana (ADR-0044, adendo 2026-09-01).
   */
  test('selects the delivery role alongside the recipient', async () => {
    const source = await readFile(SOURCE, 'utf8')

    expect(source).not.toInclude(`p."role" = 'recipient'`)
    expect(source).toInclude(`p."role" in ('recipient', 'delivery')`)
  })

  /**
   * E a chave continua sendo a mesma: o papel decide **quais** endereços entram, nunca **como** a
   * chave é montada. Mudar a montagem aqui faria toda chave em base virar `miss` de uma vez.
   */
  test('does not touch the shape of the key', async () => {
    const source = await readFile(SOURCE, 'utf8')

    expect(source).toInclude(`concat_ws('|', coalesce(a."city_code", '')`)
    expect(source).toInclude(`length(regexp_replace(a."postal_code", '\\\\D', '', 'g')) = 8`)
  })
})
