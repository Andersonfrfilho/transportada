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
 *
 * Era uma varredura de duas cópias — a segunda vivia no cron, e morreu com a fatia de
 * `nfse.status.pull` que se mudou para cá: agora a consulta e a emissão usam o mesmo cliente.
 */
import { describe, expect, test } from 'bun:test'

const CLIENT_SOURCE = new URL(
  '../../src/nfse-issuance/infrastructure/nota-rp-v2.client.ts',
  import.meta.url,
)

describe('Nota RP v2 client — nenhum Bearer', () => {
  test('não monta cabeçalho Authorization', async () => {
    const code = await Bun.file(CLIENT_SOURCE).text()

    expect(code).not.toContain('Bearer')
    expect(code.toLowerCase()).not.toContain('authorization:')
  })

  test('monta os dois cabeçalhos que o provedor exige', async () => {
    const code = await Bun.file(CLIENT_SOURCE).text()

    expect(code).toContain('X-AUTH-USER-TOKEN')
    expect(code).toContain('X-AUTH-IM')
  })
})
