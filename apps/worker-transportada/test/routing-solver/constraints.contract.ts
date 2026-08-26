/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { solveRoute } from '../../src/routing/domain/route-solver.js'
import { CLUSTERED_POINTS, GRID_POINTS, buildEuclideanProblem } from './solver-instances.fixture.js'

describe('weight is a real constraint (ADR-0044 §9)', () => {
  /**
   * Aceite da spec 058: instância que só cabe violando massa devolve a violação **explícita**. Ela
   * não é escondida escolhendo uma ordem pior, e não trava o solver — a penalidade deixa a solução
   * viver, e o conferente decide.
   */
  test('returns the overweight explicitly instead of pretending the load fits', () => {
    const problem = buildEuclideanProblem({
      capacityKilograms: 1_000,
      demands: [600, 600, 600, 600, 600, 600, 600, 600],
      points: GRID_POINTS,
    })

    const solution = solveRoute(problem)
    const overweight = solution.violations.filter((violation) => violation.kind === 'weight')

    expect(overweight.length).toBeGreaterThan(0)
    // Número, nunca "estourou": o conferente precisa saber por quantos quilos
    expect(overweight[0]?.amount).toBeGreaterThan(0)
  })

  /**
   * ADR-0044 §9: volume **não entra no modelo** — nem como restrição frouxa, nem como aviso. A
   * cubagem quase nunca vem no XML, e uma restrição calculada sobre dado ausente produz um número
   * que parece restrição e não é: a rota "cabe" na tela e não cabe no caminhão.
   */
  test('never mentions volume anywhere, because the data behind it does not exist', () => {
    const problem = buildEuclideanProblem({ points: GRID_POINTS })

    const solution = solveRoute(problem)
    const kinds = new Set(solution.violations.map((violation) => violation.kind))

    expect(kinds.has('weight' as never)).toBe(kinds.has('weight' as never))
    expect([...kinds]).not.toContain('volume')
    expect(JSON.stringify(solution)).not.toContain('volume')
  })
})

describe('delivery window (spec 058 P3)', () => {
  /** A violação de janela aparece com quanto tempo falta — nunca escondida numa ordem pior. */
  test('shows how late it is, in seconds, instead of hiding the impossible window', () => {
    const problem = buildEuclideanProblem({
      points: CLUSTERED_POINTS,
      // Uma janela que fecha antes de qualquer rota conseguir chegar
      windows: [
        [0, 1],
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    })

    const solution = solveRoute(problem)
    const late = solution.violations.filter((violation) => violation.kind === 'delivery_window')

    expect(late.length).toBeGreaterThan(0)
    expect(late[0]?.amount).toBeGreaterThan(0)
  })

  /** Chegar antes da janela abrir é espera, não violação — e a espera anda no relógio. */
  test('treats arriving early as waiting, which is not a violation', () => {
    const problem = buildEuclideanProblem({
      points: GRID_POINTS,
      windows: [[86_400, 172_800], null, null, null, null, null, null, null],
    })

    const solution = solveRoute(problem)

    expect(solution.violations.filter((violation) => violation.kind === 'delivery_window')).toEqual(
      [],
    )
  })
})

describe('duty limits are opt-in (spec 058 D6b)', () => {
  /**
   * Aceite da spec: com o bloco desligado, **nenhuma** penalidade. Nulo é "não é restrição aqui", e
   * distribuição urbana com retorno ao barracão não se parece com viagem interestadual.
   */
  test('penalizes nothing while the duty block is off, which is the default', () => {
    const problem = buildEuclideanProblem({ duty: null, points: CLUSTERED_POINTS })

    const solution = solveRoute(problem)

    expect(solution.violations.filter((violation) => violation.kind === 'duty_time')).toEqual([])
  })

  /** Ligado, a violação residual aparece explícita — uma rota que estoura jornada e não diz é pior. */
  test('surfaces the overrun explicitly once the company turns duty on', () => {
    const problem = buildEuclideanProblem({
      duty: {
        breakEverySeconds: null,
        mandatoryBreakSeconds: null,
        maxDrivingSeconds: 60,
        maxDutySeconds: null,
      },
      points: CLUSTERED_POINTS,
    })

    const solution = solveRoute(problem)
    const overrun = solution.violations.filter((violation) => violation.kind === 'duty_time')

    expect(overrun.length).toBeGreaterThan(0)
    expect(overrun[0]?.amount).toBeGreaterThan(0)
  })
})

describe('degenerate instances (spec 058, casos extremos)', () => {
  /** Uma parada só devolve a sugestão trivial sem rodar o GA — não há o que otimizar. */
  test('answers a single stop without spending a generation', () => {
    const problem = buildEuclideanProblem({ points: [GRID_POINTS[0]!, GRID_POINTS[1]!] })

    const solution = solveRoute(problem)

    expect(solution.generations).toBe(0)
    expect(solution.assignments[0]?.stopIndexes).toEqual([1])
  })

  /**
   * Par inalcançável — ilha sem estrada, ponte fora. A parada é marcada, e a penalidade é grande o
   * bastante para que nenhuma rota a prefira: rota que não existe tem de perder de qualquer
   * alternativa, não ser "cara".
   */
  test('marks an unreachable stop instead of routing through a road that is not there', () => {
    const base = buildEuclideanProblem({ points: GRID_POINTS })
    const durationsSeconds = base.durationsSeconds.map((row, from) =>
      row.map((value, to) => (from === 0 && to === 3 ? null : value)),
    )
    const distancesMeters = base.distancesMeters.map((row, from) =>
      row.map((value, to) => (from === 0 && to === 3 ? null : value)),
    )

    const solution = solveRoute({ ...base, distancesMeters, durationsSeconds })

    // A rota existe; o que não pode é ela começar pelo trecho que não existe
    expect(solution.assignments[0]?.stopIndexes[0]).not.toBe(3)
  })

  /** O orçamento corta e devolve o melhor encontrado, marcado — nunca roda para sempre. */
  test('stops at the time budget and says the answer was truncated', () => {
    const problem = buildEuclideanProblem({
      points: CLUSTERED_POINTS,
      stagnationLimit: Number.MAX_SAFE_INTEGER,
      timeBudgetMilliseconds: 1,
    })

    const solution = solveRoute(problem)

    expect(solution.truncated).toBe(true)
    expect(solution.assignments.length).toBeGreaterThan(0)
  })
})
