/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision, GeocodingSource } from '../../database/geocoding.schema.js'

/**
 * Os degraus da escada, do mais barato ao mais caro. A ordem **é** a economia da spec 084: cada um
 * só é consultado se o de cima não respondeu, e o pago é o penúltimo.
 */
export const COORDINATE_STEPS = [
  'correction',
  'client_address',
  'postal_code',
  'paid_provider',
  'centroid',
] as const
export type CoordinateStep = (typeof COORDINATE_STEPS)[number]

export type ResolvedCoordinate = Readonly<{
  latitude: string
  longitude: string
  precision: GeocodingPrecision
  source: GeocodingSource
}>

export type DeliveryCoordinate = ResolvedCoordinate & Readonly<{ step: CoordinateStep }>

/**
 * Cada degrau é **preguiçoso**, e isso não é detalhe de implementação — é o contrato. Um degrau que
 * recebesse o resultado pronto já teria custado a consulta.
 */
export type DeliveryCoordinateSteps = Readonly<{
  /** A correção humana aceita: contratante, motorista ou operador. Mais recente e mais autorizada. */
  correction: () => Promise<null | ResolvedCoordinate>
  /** A agenda: o mesmo cliente no mesmo lugar, já confirmado antes. */
  clientAddress: () => Promise<null | ResolvedCoordinate>
  /** Degrau 1, grátis e nosso. Resolve a maioria e não manda nada para fora. */
  postalCode: () => Promise<null | ResolvedCoordinate>
  /** Degrau 2, pago. Só chega aqui o que nenhum degrau grátis soube responder. */
  paidProvider: () => Promise<null | ResolvedCoordinate>
  /** Último recurso: o centroide do município, que é palpite e vai marcado como tal. */
  centroid: () => Promise<null | ResolvedCoordinate>
}>

/**
 * Onde a entrega acontece, resolvido pela escada da spec 084 (P5).
 *
 * ⚠️ **O curto-circuito é o ponto inteiro desta função.** Consultar o provedor pago depois de um
 * degrau grátis ter respondido é dinheiro queimado por endereço, para sempre — e o teste de aceite
 * da T03 falha se isso acontecer. Cada degrau só roda se o anterior devolveu `null`.
 *
 * ⚠️ **A ordem não é preferência, é autoridade decrescente com custo crescente.** A correção humana
 * vence porque alguém que esteve lá disse; a agenda vence o CEP porque já foi confirmada; o CEP
 * vence o pago porque é nosso e grátis; e o centroide é o único que **não** é resposta — é a
 * admissão de que ninguém sabe, e por isso sai marcado (`precision: 'city'`), o que faz o solver
 * excluir a parada da otimização.
 *
 * Nulo quando nem o centroide responde: município sem centroide existe, e a nota fica sem
 * coordenada em vez de ganhar uma inventada.
 */
/**
 * ⚠️ **O degrau não escolhe o rótulo que quiser.** `source` e `precision` vêm inteiros do closure, e
 * um `centroid` mal-fiado devolvendo `rooftop` passaria por tipo e por CHECK — o solver deixaria de
 * excluir da otimização um palpite de ~8 km, que é exatamente o que a ADR-0044 §5 quer impedir ao
 * fazer a precisão viajar visível. Onde o degrau **determina** a precisão, ela é conferida.
 *
 * A correção e a agenda ficam de fora: ali a precisão é do que foi confirmado, e vai de `city`
 * (alguém disse "é nesta cidade") a `rooftop` (o motorista estava na porta).
 */
const EXPECTED_PRECISION: Partial<Record<CoordinateStep, GeocodingPrecision>> = {
  centroid: 'city',
  postal_code: 'postal_code',
}

export class CoordinateStepPrecisionMismatchError extends Error {
  constructor(readonly context: Readonly<{ expected: string; got: string; step: CoordinateStep }>) {
    super(`COORDINATE_STEP_PRECISION_MISMATCH:${context.step}`)
    this.name = 'CoordinateStepPrecisionMismatchError'
  }
}

/**
 * ⚠️ **A escada é declarada uma vez só.** Antes o catálogo e a execução eram dois literais
 * independentes: acrescentar degrau no tipo e esquecer do laço compilava, e o degrau novo nunca
 * rodava — calado, e caro, porque um degrau grátis esquecido é consulta paga desnecessária. O
 * `satisfies` amarra as duas metades, e chave nova no tipo passa a não compilar sem entrada aqui.
 */
const LADDER = [
  ['correction', 'correction'],
  ['clientAddress', 'client_address'],
  ['postalCode', 'postal_code'],
  ['paidProvider', 'paid_provider'],
  ['centroid', 'centroid'],
] as const satisfies readonly (readonly [keyof DeliveryCoordinateSteps, CoordinateStep])[]

export async function resolveDeliveryCoordinate(
  steps: DeliveryCoordinateSteps,
): Promise<DeliveryCoordinate | null> {
  const ladder = LADDER.map(
    ([key, step]) =>
      [step, steps[key]] as const satisfies readonly [
        CoordinateStep,
        () => Promise<null | ResolvedCoordinate>,
      ],
  )

  for (const [step, resolve] of ladder) {
    const resolved = await resolve()
    if (resolved === null) continue

    const expected = EXPECTED_PRECISION[step]
    if (expected !== undefined && resolved.precision !== expected) {
      throw new CoordinateStepPrecisionMismatchError({
        expected,
        got: resolved.precision,
        step,
      })
    }

    return { ...resolved, step }
  }

  return null
}

/**
 * Se o degrau pago foi alcançado. É o que o relatório conta para dizer quanto a operação ainda
 * depende de provedor externo — e o que deve cair conforme contratante e motorista corrigem.
 */
export function isPaidStep(coordinate: DeliveryCoordinate | null): boolean {
  return coordinate?.step === 'paid_provider'
}
