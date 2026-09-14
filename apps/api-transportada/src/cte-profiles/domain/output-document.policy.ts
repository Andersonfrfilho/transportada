/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteMunicipalServicePolicy,
  CteOutputDocument,
} from '../../database/cte-emission-profile.schema.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'

export type OutputDocumentSettings = Readonly<{
  municipalServicePolicy: CteMunicipalServicePolicy
  nfseEmissionProfileId: string | null
  outputDocument: CteOutputDocument
}>

/**
 * As mesmas regras dos CHECKs `cte_emission_profiles_nfse_profile_check` e `..._output_municipal_check`,
 * ditas antes do banco e todas de uma vez: violação que chegasse ao Postgres viraria 500, e uma
 * por vez obrigaria o operador a salvar de novo para descobrir a próxima.
 */
export function findOutputDocumentViolations(
  settings: OutputDocumentSettings,
): readonly ApiErrorDetail[] {
  const isNfse = settings.outputDocument === 'nfse'
  const violations: ApiErrorDetail[] = []
  if (isNfse && settings.nfseEmissionProfileId === null) {
    violations.push({
      field: 'nfseEmissionProfileId',
      message: 'required when outputDocument is nfse',
    })
  }
  if (!isNfse && settings.nfseEmissionProfileId !== null) {
    violations.push({
      field: 'nfseEmissionProfileId',
      message: 'only allowed when outputDocument is nfse',
    })
  }
  if (isNfse && settings.municipalServicePolicy !== 'allow') {
    violations.push({
      field: 'municipalServicePolicy',
      message: 'must be allow when outputDocument is nfse',
    })
  }
  return violations
}
