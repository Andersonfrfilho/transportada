/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 058 — **o OSRM de verdade**, não o dublê. O E2E do pool prova o encanamento com uma matriz de
 * haversine calculada no teste; o que só o serviço prova é o que o dublê nunca teve como provar: que
 * o `/table` responde no formato que o gateway lê, que a distância é **de rua** (maior que a linha
 * reta, porque a rua faz esquina) e o que o serviço faz com ponto fora da área — que **não** é o que
 * o runbook afirmava. Ver o ⚠️ do terceiro caso.
 *
 * O dataset é a grade sintética de `deploy/osrm/fixtures`, processada por `make routing-fixture`: o
 * extract real do Sudeste tem centenas de MB e não cabe no repositório nem numa máquina nova, e foi
 * por isso que o serviço nunca era exercitado. Uma grade não prova qualidade de rota — prova
 * contrato de transporte.
 */
import { describe, expect, test } from 'bun:test'

import { createOsrmRoutingMatrixGateway } from '../src/routing/infrastructure/osrm-routing-matrix.gateway.js'
import { RoutingMatrixUnavailableError } from '../src/routing/domain/routing-matrix.error.js'

const baseUrl = process.env.ROUTING_MATRIX_URL
const describeOsrm = baseUrl === undefined || baseUrl === '' ? describe.skip : describe

/** Dois cantos opostos da grade: entre eles a rua obriga a virar uma esquina. */
const SOUTHWEST = { latitude: '-21.1900000', longitude: '-47.8300000' }
const NORTHEAST = { latitude: '-21.1700000', longitude: '-47.8100000' }
/** Meio do Atlântico: dentro do planeta, fora de qualquer extract. */
const OFF_MAP = { latitude: '-21.1700000', longitude: '-30.0000000' }

const EARTH_RADIUS_METRES = 6_371_000

describeOsrm('a matriz do OSRM contra o serviço de verdade (spec 058)', () => {
  test('devolve a matriz completa, com a diagonal zerada', async () => {
    const gateway = createOsrmRoutingMatrixGateway({ baseUrl: baseUrl ?? '' })

    const matrix = await gateway.table([SOUTHWEST, NORTHEAST])

    expect(matrix.distancesMeters).toHaveLength(2)
    expect(matrix.durationsSeconds).toHaveLength(2)
    expect(matrix.distancesMeters[0]?.[0]).toBe(0)
    expect(matrix.durationsSeconds[1]?.[1]).toBe(0)
  })

  /**
   * A distância é **de rua**: numa grade, ir de um canto ao outro obriga a percorrer os dois lados do
   * retângulo, e isso é mais longo que a diagonal. É exatamente a diferença que a ADR-0044 §1 se
   * recusa a inventar quando o serviço cai.
   */
  test('a distância é de rua, não de linha reta', async () => {
    const gateway = createOsrmRoutingMatrixGateway({ baseUrl: baseUrl ?? '' })

    const matrix = await gateway.table([SOUTHWEST, NORTHEAST])
    const roadMetres = matrix.distancesMeters[0]?.[1]
    const straightMetres = haversineMetres(SOUTHWEST, NORTHEAST)

    expect(roadMetres).not.toBeNull()
    expect(roadMetres ?? 0).toBeGreaterThan(straightMetres)
    /** E não é um número qualquer: a volta pela grade é a soma dos catetos, não o dobro da diagonal. */
    expect(roadMetres ?? 0).toBeLessThan(straightMetres * 2)
  })

  /**
   * ⚠️ **O achado deste teste, e ele contradiz o que o runbook dizia.** Ponto fora do extract **não**
   * vira par inalcançável: o OSRM o *encaixa* na rua mais próxima que conhece e devolve a distância
   * entre os pontos encaixados — um número plausível para uma parada a mil quilômetros dali. A
   * distância entre o canto da grade e um ponto no meio do Atlântico volta **igual** à distância
   * entre os dois cantos da grade.
   *
   * Este teste grava o comportamento **real** em vez de afirmar o desejado: quem for tratar isso
   * precisa saber que o serviço mente por desenho, não que ele já avisa. `radiuses=` faria o OSRM
   * recusar — mas com `400` para a **matriz inteira**, derrubando a sugestão por causa de um único
   * endereço. As duas saídas são decisão de produto, e ficam registradas como risco aberto na spec.
   */
  test('ponto fora da área é encaixado na rua mais próxima, e isso não é ausência', async () => {
    const gateway = createOsrmRoutingMatrixGateway({ baseUrl: baseUrl ?? '' })

    const [insideOnly, withOffMap] = await Promise.all([
      gateway.table([SOUTHWEST, NORTHEAST]),
      gateway.table([SOUTHWEST, OFF_MAP]),
    ])

    const snapped = withOffMap.distancesMeters[0]?.[1]
    expect(snapped).not.toBeNull()
    /** Encaixado no mesmo canto: a distância é a da grade, não a do oceano. */
    expect(snapped).toBe(insideOnly.distancesMeters[0]?.[1] ?? -1)
  })

  /** Serviço no ar mas endereço errado é indisponibilidade — nunca rota estimada (ADR-0044 §1). */
  test('endereço errado vira indisponibilidade declarada', async () => {
    const gateway = createOsrmRoutingMatrixGateway({
      baseUrl: `${baseUrl ?? ''}/rota-que-nao-existe`,
      timeoutMilliseconds: 2_000,
    })

    await expect(gateway.table([SOUTHWEST, NORTHEAST])).rejects.toBeInstanceOf(
      RoutingMatrixUnavailableError,
    )
  })
})

function haversineMetres(
  origin: Readonly<{ latitude: string; longitude: string }>,
  destination: Readonly<{ latitude: string; longitude: string }>,
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180
  const originLatitude = Number(origin.latitude)
  const destinationLatitude = Number(destination.latitude)
  const deltaLatitude = toRadians(destinationLatitude - originLatitude)
  const deltaLongitude = toRadians(Number(destination.longitude) - Number(origin.longitude))
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(originLatitude)) *
      Math.cos(toRadians(destinationLatitude)) *
      Math.sin(deltaLongitude / 2) ** 2

  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)))
}
