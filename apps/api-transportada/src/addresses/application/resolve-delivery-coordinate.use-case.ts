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
export async function resolveDeliveryCoordinate(
  steps: DeliveryCoordinateSteps,
): Promise<DeliveryCoordinate | null> {
  const ladder: readonly (readonly [CoordinateStep, () => Promise<null | ResolvedCoordinate>])[] = [
    ['correction', steps.correction],
    ['client_address', steps.clientAddress],
    ['postal_code', steps.postalCode],
    ['paid_provider', steps.paidProvider],
    ['centroid', steps.centroid],
  ]

  for (const [step, resolve] of ladder) {
    const resolved = await resolve()
    if (resolved !== null) return { ...resolved, step }
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
