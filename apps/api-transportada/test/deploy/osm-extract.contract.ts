/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const RAILWAY = readFileSync(new URL('../../../../.railway/railway.ts', import.meta.url), 'utf8')
const MAKEFILE = readFileSync(new URL('../../../../Makefile', import.meta.url), 'utf8')
const RUNBOOK = readFileSync(
  new URL('../../../../docs/runbooks/osrm-extract.md', import.meta.url),
  'utf8',
)

describe('o extrato do OSM que alimenta mapa e rota (ADR-0044 §2 e §6)', () => {
  /**
   * ⚠️ **`-latest` não quer dizer "se atualiza".** Quer dizer *"seja qual for o arquivo do dia em
   * que alguém reconstruir"* — e reconstruir acontece por motivo alheio: mudar o `PORT`, subir a
   * versão do OSRM, um cache de build que expirou. O mapa trocava por baixo, sem decisão, sem
   * revisão e sem registro de qual mapa está rodando. Rota mudando sem mudança de código é a mesma
   * classe de problema que o adendo da ADR-0044 recusou no provedor pago.
   */
  test('a URL é datada, nunca -latest', () => {
    /**
     * ⚠️ Olha o **valor**, não o arquivo inteiro: o comentário acima da constante cita
     * `sudeste-latest` de propósito, para explicar por que ele saiu. Um `not.toContain` no texto
     * todo proibiria a explicação junto com o defeito.
     */
    const valor = /const OSM_EXTRACT_URL\s*=\s*'([^']+)'/u.exec(RAILWAY)?.[1] ?? ''
    expect(valor).toMatch(/\/sudeste-\d{6}\.osm\.pbf$/u)
    expect(RUNBOOK).not.toMatch(/curl -O \S*sudeste-latest/u)
  })

  /**
   * ⚠️ **A trava que só existia como comentário.** Mapa e rota em datas diferentes é a tela e o
   * roteirizador discordando de onde a rua está — e não dá erro nenhum, só produz um traço que passa
   * por onde o caminhão não vai. Uma constante só, lida pelos dois, é o que impede isso.
   */
  test('os dois serviços leem a mesma constante', () => {
    expect(RAILWAY).toContain('OSRM_PBF_URL: OSM_EXTRACT_URL')
    expect(RAILWAY).toContain('MAP_PBF_URL: OSM_EXTRACT_URL')

    const datas = new Set(
      [...RAILWAY.matchAll(/sudeste-(\d{6})\.osm\.pbf/gu)].map((match) => match[1]),
    )
    expect(datas.size).toBe(1)
  })

  /** Reconstruir um sozinho é o defeito; o alvo existe para não haver caminho curto para ele. */
  test('o alvo reconstrói os dois, e não faz nada sem confirmação', () => {
    const alvo = MAKEFILE.slice(MAKEFILE.indexOf('map-refresh:'))
    expect(alvo).toContain('--service osrm')
    expect(alvo).toContain('--service map-tiles')
    expect(alvo).toContain('CONFIRM')
  })
})
