/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF7: com Produtos desligado, Corrigir some só nas ocorrências novas — a antiga que tem
 * itens ou já foi corrigida continua corrigível. A dica não pode prometer mais do que isso.
 */
import { describe, expect, test } from 'bun:test'

import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'

describe('dica de Produtos (RF7)', () => {
  test('em pt-BR, Corrigir some só das novas ocorrências', () => {
    const hint = companySettingsPt.occurrenceTypeCatalog.itemsModeHint
    expect(hint).toContain('Corrigir não aparece nas novas ocorrências')
  })

  test('em en, Correct is hidden only on new occurrences', () => {
    const hint = companySettingsEn.occurrenceTypeCatalog.itemsModeHint
    expect(hint).toContain('Correct does not appear on new occurrences')
  })
})
