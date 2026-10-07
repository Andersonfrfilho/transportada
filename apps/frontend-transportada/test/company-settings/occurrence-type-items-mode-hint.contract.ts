/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF7: com Produtos desligado, Corrigir só aparece na ocorrência que já tem itens ou já foi
 * corrigida — a antiga sem itens e nunca corrigida também o perde. A dica não pode prometer mais do que isso.
 */
import { describe, expect, test } from 'bun:test'

import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'

describe('dica de Produtos (RF7)', () => {
  test('em pt-BR, Corrigir só aparece onde já há produtos ou correção', () => {
    const hint = companySettingsPt.occurrenceTypeCatalog.itemsModeHint
    expect(hint).toContain(
      'Corrigir só aparece nas ocorrências que já têm produtos ou já foram corrigidas',
    )
    expect(hint).not.toContain('nas novas ocorrências')
  })

  test('em en, Correct only shows where products or a correction already exist', () => {
    const hint = companySettingsEn.occurrenceTypeCatalog.itemsModeHint
    expect(hint).toContain(
      'Correct only appears on occurrences that already have products or were already corrected',
    )
    expect(hint).not.toContain('on new occurrences')
  })
})
