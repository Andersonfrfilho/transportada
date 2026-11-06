/* Copyright (c) 2026 Ada Technology. MIT License. */
export type NfeImportMechanism = 'accessKey' | 'manual' | 'remote'

export const DEFAULT_NFE_IMPORT_MECHANISM: NfeImportMechanism = 'remote'

export const NFE_IMPORT_MECHANISM_ORDER: readonly NfeImportMechanism[] = [
  'remote',
  'manual',
  'accessKey',
]

export type NfeImportMechanismView = {
  readonly mechanism: NfeImportMechanism
  readonly showsDistribution: boolean
  readonly showsUpload: boolean
  readonly sourceEq: 'access_key' | 'distribution' | 'upload'
}

export function resolveNfeImportMechanismView(
  input: Readonly<{ mechanism: NfeImportMechanism }>,
): NfeImportMechanismView {
  if (input.mechanism === 'remote') {
    return {
      mechanism: 'remote',
      showsDistribution: true,
      showsUpload: false,
      sourceEq: 'distribution',
    }
  }

  if (input.mechanism === 'accessKey') {
    return {
      mechanism: 'accessKey',
      showsDistribution: false,
      showsUpload: false,
      sourceEq: 'access_key',
    }
  }

  return {
    mechanism: 'manual',
    showsDistribution: false,
    showsUpload: true,
    sourceEq: 'upload',
  }
}
