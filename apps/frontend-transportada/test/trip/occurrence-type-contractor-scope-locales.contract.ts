/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 270 T3.5: as telas novas e os códigos de erro do escopo existem nos dois idiomas, com as mesmas chaves.
 */
import { describe, expect, it } from 'bun:test'

import settingsEn from '@/modules/company-settings/locales/companySettings.en.locale.json'
import settingsPt from '@/modules/company-settings/locales/companySettings.locale.json'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import tripPt from '@/modules/trip/locales/trip.locale.json'
import { TRIP_FEEDBACK_KEY_BY_ERROR } from '@/modules/trip/shared/trip.constant'

function leafKeys(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

const ERROR_CODES = [
  'CONTRACTOR_NOT_FOUND',
  'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_EMPTY',
  'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_INVALID',
  'OCCURRENCE_TYPE_CONTRACTOR_SCOPE_NEEDS_DOCUMENT',
  'OCCURRENCE_TYPE_NOT_AVAILABLE_FOR_CONTRACTOR',
] as const

describe('locales do escopo de contratantes (spec 270 T3.5)', () => {
  it('o bloco "Vale para" tem as mesmas chaves em pt-BR e em inglês', () => {
    expect(leafKeys(settingsEn.occurrenceTypeCatalog.contractorScope).toSorted()).toEqual(
      leafKeys(settingsPt.occurrenceTypeCatalog.contractorScope).toSorted(),
    )
  })

  it('o chip, o aviso da exceção e o estado vazio do galpão existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      expect(locale.occurrenceTypeCatalog.summary.contractorScope).toBeString()
      expect(locale.occurrenceTypeCatalog.summary.contractorScopeMore).toBeString()
      expect(locale.occurrenceTypeCatalog.summary.contractorScopeTitle).toBeString()
      expect(locale.occurrenceTypeCatalog.exceptions.noEffect).toBeString()
    }
    expect(tripPt.occurrence.noTypesForDocument).toBeString()
    expect(tripEn.occurrence.noTypesForDocument).toBeString()
  })

  it('cada código de erro do escopo tem frase própria nos dois idiomas', () => {
    for (const code of ERROR_CODES) {
      const key = TRIP_FEEDBACK_KEY_BY_ERROR[code]
      expect(key).toBeString()
      expect((tripPt.feedback as Record<string, string>)[key ?? '']).toBeString()
      expect((tripEn.feedback as Record<string, string>)[key ?? '']).toBeString()
    }
  })
})
