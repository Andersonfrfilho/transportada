/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { MILLISECONDS_PER_MINUTE } from '../../shared/time.constant.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from './delivery-proof-settings.policy.js'

export const ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES = 2000
export const ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES = 15_000
export const ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES = 300
/** Só o ponto com a precisão do aparelho até este raio grava direto no cadastro. */
export const ARRIVAL_CORRECTION_MAX_ACCURACY_METRES = 50
/** Spec 294 S3: tardia é a chegada além do prazo da foto atrasada (spec 159/205/234) — a mesma régua, não uma nova. */
export const ARRIVAL_CORRECTION_LATE_AFTER_MILLISECONDS =
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofWindowMinutes * MILLISECONDS_PER_MINUTE
/** A chegada grava `street`, nunca `rooftop`: o ponto do motorista segue refinável por outra chegada precisa. */
export const ARRIVAL_CORRECTION_WRITTEN_PRECISION = 'street'
