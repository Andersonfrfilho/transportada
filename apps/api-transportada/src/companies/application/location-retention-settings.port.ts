/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImpactCount } from '../domain/location-retention-impact.policy.js'
import type { LocationRetentionImpactKind } from '../domain/location-retention.constant.js'
import type { LocationRetentionChoice } from '../domain/location-retention.policy.js'

export type LocationRetentionSettings = LocationRetentionChoice & {
  readonly purgeEffectiveAt: Date | null
  readonly updatedAt: Date
}

export type LocationRetentionImpactEntry = ImpactCount & {
  readonly kind: LocationRetentionImpactKind
}

export type LocationRetentionActor = {
  readonly companyId: string
  readonly correlationId: string
  readonly ipAddress: string
  readonly userId: string
}

export type SaveLocationRetentionSettingsInput = LocationRetentionActor & {
  /** Quantos pontos o ciclo apagaria com esta escolha; `null` quando desligar não apaga nada. */
  readonly affectedEstimate: ImpactCount | null
  readonly next: LocationRetentionChoice
  readonly now: Date
}

/**
 * Todo método recebe a empresa do contexto. `save` e `clear` gravam a linha de `audit_logs` na
 * mesma transação da escrita: configuração que apaga dado pessoal não existe sem rastro.
 */
export type LocationRetentionSettingsPort = {
  clear(input: LocationRetentionActor): Promise<void>
  countImpact(input: {
    readonly companyId: string
    readonly now: Date
    readonly retentionDays: number
  }): Promise<readonly LocationRetentionImpactEntry[]>
  find(input: { readonly companyId: string }): Promise<LocationRetentionSettings | null>
  save(input: SaveLocationRetentionSettingsInput): Promise<LocationRetentionSettings>
}
