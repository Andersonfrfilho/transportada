/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097 D1/D2/D3: a viagem começa no barracão.
 *
 * Duas metades, e as duas são o ponto da feature: a perna do barracão entra no traçado **pela
 * mesma configuração que o solver já lê** (nunca por uma segunda regra escrita aqui), e barracão
 * sem coordenada **não vira ponto inventado** — a rota volta a ser a de sempre e a ausência é
 * declarada, para a tela poder dizê-la.
 */
import { describe, expect, it } from 'bun:test'

import {
  planRouteFromDepot,
  resolveRouteEndAddressKey,
} from '../../src/trips/domain/route-depot.policy.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'

const BARRACAO: RouteGeometryPoint = { latitude: -21.1767, longitude: -47.8208 }
const ORLANDIA: RouteGeometryPoint = { latitude: -20.7202, longitude: -47.8866 }
const IPUA: RouteGeometryPoint = { latitude: -20.4436, longitude: -48.0139 }

const PARADAS: readonly RouteGeometryPoint[] = [ORLANDIA, IPUA]

describe('a política do barracão no traçado (spec 097)', () => {
  it('põe o barracão na origem e o retorno no fim quando a rota volta para ele', () => {
    const plano = planRouteFromDepot({
      depot: { end: BARRACAO, origin: BARRACAO, status: 'resolved' },
      stops: PARADAS,
    })

    expect(plano.stops).toEqual([BARRACAO, ORLANDIA, IPUA, BARRACAO])
    expect(plano.leadingLegs).toBe(1)
    expect(plano.trailingLegs).toBe(1)
    expect(plano.absence).toBeNull()
  })

  /** `last_stop` é o motorista que fecha o dia perto de casa: sai do barracão e não volta. */
  it('sai do barracão sem voltar quando a política de fim não manda voltar', () => {
    const plano = planRouteFromDepot({
      depot: { end: null, origin: BARRACAO, status: 'resolved' },
      stops: PARADAS,
    })

    expect(plano.stops).toEqual([BARRACAO, ORLANDIA, IPUA])
    expect(plano.leadingLegs).toBe(1)
    expect(plano.trailingLegs).toBe(0)
  })

  /**
   * ⚠️ O coração da D2: sem coordenada a perna **não é inventada**. A rota volta a ser a de hoje, e
   * a razão sobe junto — queda silenciosa é o defeito que esta spec existe para acabar.
   */
  it('sem coordenada de barracão a rota é a de hoje, e a ausência é declarada', () => {
    for (const reason of ['not_configured', 'not_geocoded'] as const) {
      const plano = planRouteFromDepot({ depot: { reason, status: 'absent' }, stops: PARADAS })

      expect(plano.stops).toEqual(PARADAS)
      expect(plano.leadingLegs).toBe(0)
      expect(plano.trailingLegs).toBe(0)
      expect(plano.absence).toBe(reason)
    }
  })

  /** Chamada que não pediu barracão nenhum não ganha aviso: ausência de pedido não é ausência. */
  it('quem não pediu barracão não recebe ausência', () => {
    const plano = planRouteFromDepot({ depot: null, stops: PARADAS })

    expect(plano.stops).toEqual(PARADAS)
    expect(plano.absence).toBeNull()
  })

  /**
   * ⚠️ Sem parada nenhuma não há viagem, e uma rota barracão→barracão seria quilometragem
   * anunciada para uma viagem que não existe.
   */
  it('não desenha rota de barracão para barracão quando não há parada', () => {
    const plano = planRouteFromDepot({
      depot: { end: BARRACAO, origin: BARRACAO, status: 'resolved' },
      stops: [],
    })

    expect(plano.stops).toEqual([])
    expect(plano.leadingLegs).toBe(0)
    expect(plano.trailingLegs).toBe(0)
  })
})

/**
 * A mesma leitura que o solver faz (`drizzle-route-optimization.repository.ts`): quem decide onde a
 * rota termina é o `end_policy` da linha, e as três políticas são honradas. É este contrato que
 * impede a montagem de assumir `depot` por constante.
 */
describe('o fim da rota sai da configuração, nunca de constante (spec 097 D1)', () => {
  it('termina no próprio barracão quando a política manda voltar', () => {
    expect(
      resolveRouteEndAddressKey({
        endAddressKey: '',
        endPolicy: 'depot',
        originAddressKey: 'barracao',
      }),
    ).toBe('barracao')
  })

  it('não termina em lugar nenhum quando a política é a última parada', () => {
    expect(
      resolveRouteEndAddressKey({
        endAddressKey: '',
        endPolicy: 'last_stop',
        originAddressKey: 'barracao',
      }),
    ).toBeNull()
  })

  it('termina no endereço declarado quando a política é um endereço', () => {
    expect(
      resolveRouteEndAddressKey({
        endAddressKey: 'outro',
        endPolicy: 'address',
        originAddressKey: 'barracao',
      }),
    ).toBe('outro')
  })

  /** Chave vazia é o "não cadastrado" desta tabela — `origin_address_key` nasce `''`. */
  it('chave vazia é ausência, nunca um endereço de nome vazio', () => {
    expect(
      resolveRouteEndAddressKey({ endAddressKey: '', endPolicy: 'depot', originAddressKey: '' }),
    ).toBeNull()
  })
})

describe('a coordenada do barracão chega a quem desenha (spec 097 D4)', () => {
  /**
   * ⚠️ O plano publicava só a **contagem** de pernas, e com ela não se desenha marcador nenhum. A
   * tela precisa saber **onde** o barracão está para diferenciá-lo do pino de parada — e a mesma
   * coordenada que entrou no traçado é a que tem de sair, nunca uma segunda leitura.
   */
  it('publica a origem usada, para o mapa marcar o ponto de partida', () => {
    const plano = planRouteFromDepot({
      depot: {
        end: { latitude: -21.1767, longitude: -47.8208 },
        origin: { latitude: -21.1767, longitude: -47.8208 },
        status: 'resolved',
      },
      stops: [
        { latitude: -20.7194, longitude: -47.8869 },
        { latitude: -20.4386, longitude: -48.0186 },
      ],
    })

    expect(plano.origin).toEqual({ latitude: -21.1767, longitude: -47.8208 })
    expect(plano.leadingLegs).toBe(1)
  })

  /** Sem barracão resolvido não há origem a publicar — e `null` é o que a tela lê como ausência. */
  it('não inventa origem quando o barracão não foi resolvido', () => {
    const plano = planRouteFromDepot({
      depot: { reason: 'not_configured', status: 'absent' },
      stops: [
        { latitude: -20.7194, longitude: -47.8869 },
        { latitude: -20.4386, longitude: -48.0186 },
      ],
    })

    expect(plano.origin).toBeNull()
  })
})
