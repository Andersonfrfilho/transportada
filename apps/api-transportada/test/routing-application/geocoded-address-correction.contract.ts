/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createGeocodedAddressCorrectionUseCase } from '../../src/routing/application/geocoded-address-correction.use-case.js'
import type { GeocodedAddressCorrectionRepository } from '../../src/routing/application/geocoding.port.js'

const REPOSITORIO = readFileSync(
  new URL(
    '../../src/routing/infrastructure/drizzle-geocoded-address-correction.repository.ts',
    import.meta.url,
  ),
  'utf8',
)

type Chamada = Parameters<GeocodedAddressCorrectionRepository['applyCorrection']>[0]

function repositorio(applied = true) {
  const chamadas: Chamada[] = []
  return {
    chamadas,
    repository: {
      applyCorrection: async (input: Chamada) => {
        chamadas.push(input)
        return { applied, previous: null }
      },
    } satisfies GeocodedAddressCorrectionRepository,
  }
}

describe('correção de coordenada com trilha (spec 084, G1)', () => {
  /**
   * ⚠️ **O buraco que esta task fecha.** O `PATCH /geocoded-addresses/:key` já estava em produção
   * gravando coordenada e **não deixando registro de quem gravou** — o produto tinha correção sem
   * histórico e histórico sem correção. O relatório da 084 depende desse registro para responder se
   * comprar precisão fina vale a pena.
   */
  test('leva empresa e ator da correção até o repositório', async () => {
    const { chamadas, repository } = repositorio()
    const useCase = createGeocodedAddressCorrectionUseCase({ repository })

    await useCase.correct({
      addressKey: '3543402|14078369|289',
      context: { companyId: 'empresa-1', userId: 'usuario-1' },
      latitude: '-21.1775000',
      longitude: '-47.8102800',
    })

    expect(chamadas[0]?.companyId).toBe('empresa-1')
    expect(chamadas[0]?.actorUserId).toBe('usuario-1')
    expect(chamadas[0]?.addressKey).toBe('3543402|14078369|289')
  })

  /**
   * ⚠️ **Coordenada e trilha numa transação só.** Em duas escritas, uma falha no meio deixaria o
   * endereço corrigido sem registro de quem o corrigiu — e o relatório mede exatamente isso.
   */
  test('grava as duas na mesma transação', () => {
    expect(REPOSITORIO).toContain('database.transaction')
    const corpo = REPOSITORIO.slice(REPOSITORIO.indexOf('database.transaction'))
    expect(corpo).toContain('geocodedAddresses')
    expect(corpo).toContain('geocodedAddressCorrections')
  })

  /**
   * ⚠️ **O defeito encontrado ao escrever esta task.** O guarda do upsert era
   * `source <> 'manual'`, e a intenção documentada é impedir que **geocodificação automática**
   * desfaça o pino. Do jeito que estava, ele descartava também a correção de um **segundo humano**:
   * a rota respondia `200` com a coordenada nova e o banco ficava com a antiga, calado.
   */
  test('correção humana sobrescreve correção humana anterior', () => {
    expect(REPOSITORIO).toContain("excluded.source = 'manual'")
  })

  /** E o guarda original continua de pé: fonte automática não desfaz o que uma pessoa apontou. */
  test('mas geocodificação automática continua não desfazendo o pino', () => {
    expect(REPOSITORIO).toContain("source} <> 'manual'")
  })

  /**
   * ⚠️ Trilha só do que aconteceu. Registrar correção descartada faria o relatório contar duas onde
   * houve uma — e o número que ele publica é justamente quantas correções foram feitas.
   */
  test('não registra trilha quando o banco recusa a escrita', () => {
    const corpo = REPOSITORIO.slice(REPOSITORIO.indexOf('const applied'))
    expect(corpo).toMatch(/if \(!applied\) return/u)
    expect(corpo.indexOf('if (!applied) return')).toBeLessThan(
      corpo.indexOf('insert(geocodedAddressCorrections)'),
    )
  })

  /** A origem é `operator`: quem chega por esta rota tem `trip.manage`, não é motorista nem cliente. */
  test('a origem registrada é o operador', () => {
    expect(REPOSITORIO).toContain("origin: 'operator'")
  })
})
