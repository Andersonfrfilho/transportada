/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './nfe-workspace.fixture'

type NfeImportMomentModule = {
  readonly formatNfeImportMoment: (value: string) => string
}

const MODULE_PATH = '../../src/modules/nfe-workspace/shared/nfeImportMoment.service'

describe('nfe import execution timestamp contract', () => {
  test('formats a valid ISO timestamp as pt-BR short date and time', async () => {
    const { formatNfeImportMoment } = await loadFutureModule<NfeImportMomentModule>(MODULE_PATH)

    const formatted = formatNfeImportMoment('2026-07-27T10:46:53.000Z')

    expect(formatted).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(formatted).toContain(':')
  })

  test('returns the raw value unchanged when it is not a parseable date', async () => {
    const { formatNfeImportMoment } = await loadFutureModule<NfeImportMomentModule>(MODULE_PATH)

    expect(formatNfeImportMoment('not-a-date')).toBe('not-a-date')
  })
})
