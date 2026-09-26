/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Item 9 da spec 183 ("tela completa dos tipos"): renomear o tipo. A API sempre aceitou o nome no
 * UPDATE, e a tela só deixava escolher o nome no cadastro — o erro de digitação ficava para sempre,
 * ou virava um tipo novo e um aposentado. O nome passa a ser editável na linha, gravado pela mesma
 * `occurrenceTypeEdit` que carrega o resto do tipo.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import { resolveOccurrenceTypeRename } from '../../src/modules/company-settings/shared/occurrenceTypeEdit.service'

const PANEL = new URL(
  '../../src/modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx',
  import.meta.url,
)

describe('renomear o tipo de ocorrência (item 9)', () => {
  it('grava o nome aparado; vazio ou igual ao atual não grava nada', () => {
    expect(resolveOccurrenceTypeRename({ current: 'Recusa', draft: '  Recusa total  ' })).toBe(
      'Recusa total',
    )
    expect(resolveOccurrenceTypeRename({ current: 'Recusa', draft: '   ' })).toBeNull()
    expect(resolveOccurrenceTypeRename({ current: 'Recusa', draft: ' Recusa ' })).toBeNull()
  })

  /** O mesmo teto do schema da API (`name` 1–60): passar dele seria um 400 sem explicação. */
  it('recusa nome acima de 60 caracteres, o teto da API', () => {
    expect(resolveOccurrenceTypeRename({ current: 'Recusa', draft: 'x'.repeat(61) })).toBeNull()
    expect(resolveOccurrenceTypeRename({ current: 'Recusa', draft: 'x'.repeat(60) })).toBe(
      'x'.repeat(60),
    )
  })

  it('a linha grava o novo nome pela edição do tipo inteiro', () => {
    const panel = readFileSync(PANEL, 'utf8')

    expect(panel).toMatch(/onSave\(\s*occurrenceTypeEdit\(type, \{\s*name\b/u)
    expect(panel).toContain("t('occurrenceTypeCatalog.rename')")
    expect(panel).toContain('maxLength={OCCURRENCE_TYPE_NAME_MAX_LENGTH}')
  })

  it('os rótulos estão nos dois idiomas', () => {
    for (const locale of [companySettingsPt, companySettingsEn]) {
      expect(locale.occurrenceTypeCatalog.rename).toBeString()
      expect(locale.occurrenceTypeCatalog.renameSave).toBeString()
      expect(locale.occurrenceTypeCatalog.renameCancel).toBeString()
    }
  })
})
