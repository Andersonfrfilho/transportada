/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  PROFILE_DETAIL,
  serializeProfileDetail,
} from '../fixtures/cte-profiles-http-payload.fixture.js'

/**
 * ⚠️ **O serializador da rota devolve `object`, e `object` aceita qualquer coisa.** Campo novo no
 * `CteEmissionProfileDetail` que ninguém acrescente ali some do corpo HTTP **sem o typecheck
 * reclamar** — foi o que aconteceu com `municipalServicePolicy`: banco, mapper e schema tinham o
 * campo, a listagem da tela recusava a resposta inteira, e nenhum teste acusava, porque a fixture
 * do teste reimplementa o mesmo serializador e as duas cópias erravam junto.
 *
 * Este contrato não reimplementa nada: compara as chaves servidas com as chaves do detalhe.
 */
describe('o corpo servido do perfil de emissão', () => {
  /** `companyId` fica de fora de propósito: o tenant vem do token, e não se ecoa para o cliente. */
  const NOT_SERVED = new Set(['companyId'])

  test('serve toda chave do detalhe, menos as declaradas', () => {
    const served = new Set(Object.keys(serializeProfileDetail(PROFILE_DETAIL)))
    const missing = Object.keys(PROFILE_DETAIL).filter(
      (key) => !NOT_SERVED.has(key) && !served.has(key),
    )

    expect(missing).toEqual([])
  })

  test('não serve o identificador do tenant', () => {
    expect(Object.keys(serializeProfileDetail(PROFILE_DETAIL))).not.toContain('companyId')
  })
})
