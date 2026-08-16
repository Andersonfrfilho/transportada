/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A Nota RP ignora `Authorization` em silêncio — não devolve 401, não reclama. Foi assim que o
 * cabeçalho errado sobreviveu meses: a rota que o trilho exercitava respondia 200 para token
 * válido, token inventado e requisição sem cabeçalho nenhum.
 *
 * Varredura de fonte, e não de comportamento, de propósito: o dublê de `fetch` só vê o que o
 * cliente monta hoje. Se alguém acrescentar o `Bearer` "por garantia" ao lado dos cabeçalhos
 * certos, todo teste de comportamento continua verde.
 */
import { describe, expect, test } from 'bun:test'

const CLIENT_SOURCES = [
  new URL('../../src/nfse-issuance/infrastructure/nota-rp-v2.client.ts', import.meta.url),
  new URL(
    '../../../cron-transportada/src/nfse-status-pull/infrastructure/nota-rp-v2.client.ts',
    import.meta.url,
  ),
] as const

describe('Nota RP v2 clients — nenhum Bearer nas duas cópias', () => {
  for (const source of CLIENT_SOURCES) {
    const name = source.pathname.split('/').slice(-4).join('/')

    test(`${name} não monta cabeçalho Authorization`, async () => {
      const code = await Bun.file(source).text()

      expect(code).not.toContain('Bearer')
      expect(code.toLowerCase()).not.toContain('authorization:')
    })

    test(`${name} monta os dois cabeçalhos que o provedor exige`, async () => {
      const code = await Bun.file(source).text()

      expect(code).toContain('X-AUTH-USER-TOKEN')
      expect(code).toContain('X-AUTH-IM')
    })
  }
})
