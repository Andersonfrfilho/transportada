/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (RF14, RF15; revisão final S3/C3, ADR-0113 §2): a régua do ponto da chegada da tripulação. Nada aqui
 * bloqueia o registro: a chegada grava sempre, a régua só decide o que o ponto faz no cadastro.
 *
 * 1. Chegada tardia → nada (nem sugestão).
 * 2. Preciso = `accuracyMeters` ≤ 50 m; só o ponto preciso grava direto.
 * 3. Sem coordenada atual (ou ponto ilegível) → sugestão.
 * 4. `postal_code`/`city`: dentro da tolerância e preciso → grava; dentro e impreciso → sugestão; fora → sugestão.
 * 5. Ponto de motorista (`source = driver`), 300 m: dentro, preciso e mais longe que a própria precisão → regrava;
 *    dentro sem isso → nada; fora e preciso → sugestão; fora e impreciso → nada.
 * 6. Confiável de outra fonte (`rooftop`/`street`), 300 m: dentro → nada; fora e preciso → sugestão; fora e
 *    impreciso → nada.
 */
import { distanceInMetres, type Coordinate } from '../../addresses/domain/coordinate-distance.js'
import type { GeocodingPrecision, GeocodingSource } from '../../database/geocoding.schema.js'
import {
  ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_LATE_AFTER_MILLISECONDS,
  ARRIVAL_CORRECTION_MAX_ACCURACY_METRES,
  ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
} from './address-arrival-correction.constant.js'

export type AddressArrivalCorrectionDecision = 'apply' | 'ignore' | 'suggest'

export type AddressArrivalCorrectionInput = {
  /** A precisão que o aparelho declarou; `null` quando não veio (o ponto do WhatsApp não traz). */
  readonly accuracyMeters: number | null
  readonly currentCoordinate: Coordinate | null
  readonly currentPrecision: GeocodingPrecision
  readonly currentSource: GeocodingSource
  readonly driverPoint: Coordinate
  readonly isLate: boolean
}

export type AddressArrivalCorrectionResult = {
  readonly decision: AddressArrivalCorrectionDecision
  readonly distanceMeters: number | null
}

const TOLERANCE_BY_PRECISION: Readonly<Record<GeocodingPrecision, number>> = {
  city: ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES,
  postal_code: ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES,
  rooftop: ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
  street: ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
}

const TRUSTED_PRECISIONS: ReadonlySet<GeocodingPrecision> = new Set(['rooftop', 'street'])

export function resolveAddressArrivalCorrection(
  input: AddressArrivalCorrectionInput,
): AddressArrivalCorrectionResult {
  const { accuracyMeters, currentCoordinate, currentPrecision, driverPoint } = input
  if (input.isLate) return { decision: 'ignore', distanceMeters: null }
  if (currentCoordinate === null) return { decision: 'suggest', distanceMeters: null }

  const distanceMeters = distanceInMetres(currentCoordinate, driverPoint)
  if (distanceMeters === null) return { decision: 'suggest', distanceMeters: null }

  const isAccurate =
    accuracyMeters !== null && accuracyMeters <= ARRIVAL_CORRECTION_MAX_ACCURACY_METRES
  const isWithin = distanceMeters <= TOLERANCE_BY_PRECISION[currentPrecision]
  if (!TRUSTED_PRECISIONS.has(currentPrecision)) {
    return { decision: isWithin && isAccurate ? 'apply' : 'suggest', distanceMeters }
  }
  if (!isAccurate) return { decision: 'ignore', distanceMeters }
  if (!isWithin) return { decision: 'suggest', distanceMeters }
  // Só o ponto do próprio motorista se refina, e só quando o novo é distinguível dele.
  const isRefinement = input.currentSource === 'driver' && distanceMeters > accuracyMeters
  return { decision: isRefinement ? 'apply' : 'ignore', distanceMeters }
}

/**
 * Spec 294 S3: a chegada que a fila offline entregou além do prazo da foto atrasada. Sem a hora do toque (cliente
 * antigo, bot), a chegada é a de agora.
 */
export function isArrivalLate(input: {
  readonly clockOffsetMs?: number | undefined
  readonly receivedAt: Date
  readonly tappedAt?: Date | undefined
}): boolean {
  if (input.tappedAt === undefined) return false
  const tappedAt = input.tappedAt.getTime() + (input.clockOffsetMs ?? 0)
  if (!Number.isFinite(tappedAt)) return false
  return input.receivedAt.getTime() - tappedAt > ARRIVAL_CORRECTION_LATE_AFTER_MILLISECONDS
}
