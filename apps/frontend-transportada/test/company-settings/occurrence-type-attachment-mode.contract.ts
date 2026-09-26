/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T401 (CA01, RF10): o editor de tipos oferece a exigência de foto — obrigatória, opcional
 * ou fora do registro —, em pt-BR e en. A API aceitava `attachmentMode` desde a T101, e o painel
 * nunca o mostrou: marcar um tipo como "exige foto" só era possível pelo banco.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'

const PANEL = new URL(
  '../../src/modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx',
  import.meta.url,
)

describe('exigência de foto no editor de tipos (spec 179 T401)', () => {
  it('a linha e o cadastro têm o Select da exigência, do design system', () => {
    const panel = readFileSync(PANEL, 'utf8')

    const selects = panel.match(
      /<Select[^>]*ariaLabel=\{t\('occurrenceTypeCatalog\.attachmentMode'\)\}/gu,
    )
    expect(selects).toHaveLength(2)
    expect(panel).toContain('value={type.attachmentMode}')
    expect(panel).toContain('value={attachmentMode}')
    expect(panel).toMatch(/onSave\(\s*occurrenceTypeEdit\(type, \{\s*attachmentMode: /u)
  })

  it('o cadastro novo manda a exigência escolhida, que nasce desligada', () => {
    const panel = readFileSync(PANEL, 'utf8')
    const create = panel.slice(panel.indexOf('onSave({'))

    expect(create.slice(0, create.indexOf('})'))).toContain('attachmentMode')
    expect(panel).toMatch(
      /useState<OccurrenceAttachmentMode>\(\s*OCCURRENCE_ATTACHMENT_MODE\.off,?\s*\)/u,
    )
  })

  it('os três estados e o rótulo estão nos dois idiomas', () => {
    for (const locale of [companySettingsPt, companySettingsEn]) {
      expect(locale.occurrenceTypeCatalog.attachmentMode).toBeString()
      expect(locale.occurrenceTypeCatalog.attachmentModeOff).toBeString()
      expect(locale.occurrenceTypeCatalog.attachmentModeOptional).toBeString()
      expect(locale.occurrenceTypeCatalog.attachmentModeRequired).toBeString()
    }
    expect(companySettingsPt.occurrenceTypeCatalog.attachmentModeRequired).toInclude('obrigatória')
  })
})
