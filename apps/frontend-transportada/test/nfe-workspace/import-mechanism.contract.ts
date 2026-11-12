/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './nfe-workspace.fixture'

type NfeImportMechanism = 'accessKey' | 'manual' | 'remote'

type NfeImportMechanismView = {
  readonly mechanism: NfeImportMechanism
  readonly showsDistribution: boolean
  readonly showsUpload: boolean
  readonly sourceEq: 'access_key' | 'distribution' | 'upload'
}

type NfeImportMechanismModule = {
  readonly DEFAULT_NFE_IMPORT_MECHANISM: NfeImportMechanism
  readonly NFE_IMPORT_MECHANISM_ORDER: readonly NfeImportMechanism[]
  readonly resolveNfeImportMechanismView: (
    input: Readonly<{ mechanism: NfeImportMechanism }>,
  ) => NfeImportMechanismView
}

const MODULE_PATH = '../../src/modules/nfe-workspace/shared/nfeImportMechanism.service'

describe('nfe import mechanism selector contract', () => {
  test('defaults to remote intake and lists remote, manual, then key lookup', async () => {
    const { DEFAULT_NFE_IMPORT_MECHANISM, NFE_IMPORT_MECHANISM_ORDER } =
      await loadFutureModule<NfeImportMechanismModule>(MODULE_PATH)

    expect(DEFAULT_NFE_IMPORT_MECHANISM).toBe('remote')
    expect(NFE_IMPORT_MECHANISM_ORDER).toEqual(['remote', 'manual', 'accessKey'])
  })

  test('manual intake shows the upload panel and pre-filters imports to uploads', async () => {
    const { resolveNfeImportMechanismView } =
      await loadFutureModule<NfeImportMechanismModule>(MODULE_PATH)

    expect(resolveNfeImportMechanismView({ mechanism: 'manual' })).toEqual({
      mechanism: 'manual',
      showsDistribution: false,
      showsUpload: true,
      sourceEq: 'upload',
    })
  })

  test('remote intake shows the DF-e distribution control and pre-filters imports to distribution', async () => {
    const { resolveNfeImportMechanismView } =
      await loadFutureModule<NfeImportMechanismModule>(MODULE_PATH)

    expect(resolveNfeImportMechanismView({ mechanism: 'remote' })).toEqual({
      mechanism: 'remote',
      showsDistribution: true,
      showsUpload: false,
      sourceEq: 'distribution',
    })
  })

  test('key lookup shows no intake panel and pre-filters imports to the access-key origin', async () => {
    const { resolveNfeImportMechanismView } =
      await loadFutureModule<NfeImportMechanismModule>(MODULE_PATH)

    expect(resolveNfeImportMechanismView({ mechanism: 'accessKey' })).toEqual({
      mechanism: 'accessKey',
      showsDistribution: false,
      showsUpload: false,
      sourceEq: 'access_key',
    })
  })
})
