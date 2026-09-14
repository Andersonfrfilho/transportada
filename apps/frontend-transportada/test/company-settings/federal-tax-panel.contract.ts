/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { isFederalTaxResponse } from '../../src/modules/company-settings/shared/federalTax.validation'
import {
  FEDERAL_REGIMES,
  buildFederalTaxSubmission,
  chooseFederalRegime,
  regimesForTaxRegime,
  startFederalTaxDraft,
  suggestFederalRates,
  typeFederalRate,
} from '../../src/modules/company-settings/shared/federalTaxSuggestion.service'
import { percentageToFraction } from '../../src/modules/shared/fractionPercentage.service'

import en from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import pt from '../../src/modules/company-settings/locales/companySettings.locale.json'

/**
 * Spec 126 — **o regime federal se declara em Configurações, com a sugestão pelo CRT e o contador
 * confirmando.** A tela mostra percentual e grava fração: guardar `0.65` onde se espera `0.0065`
 * multiplicaria o imposto da conta por cem.
 */
const API_SCHEMA = '../../../api-transportada/src/database/trip-financial.schema.ts'
const PANEL = '../../src/modules/company-settings/components/FederalTaxPanel.component.tsx'
const PAGE = '../../src/modules/company-settings/pages/CompanySettings.page.tsx'

function apiRegimes(): readonly string[] {
  const source = readFileSync(new URL(API_SCHEMA, import.meta.url), 'utf8')
  const line = source.slice(source.indexOf('COMPANY_FEDERAL_REGIMES ='))
  const list = line.slice(line.indexOf('['), line.indexOf(']'))

  return [...list.matchAll(/'(\w+)'/g)].map((match) => match[1] ?? '')
}

describe('federal tax panel (spec 126)', () => {
  test('the regimes are a copy by value of the API ones', () => {
    expect(FEDERAL_REGIMES.map(String).sort()).toEqual([...apiRegimes()].sort())
  })

  /** CRT 1/2 é Simples; CRT 3 escolhe entre Presumido e Real. */
  test('the CRT narrows the regimes offered', () => {
    expect(regimesForTaxRegime('1')).toEqual(['simple'])
    expect(regimesForTaxRegime('2')).toEqual(['simple'])
    expect(regimesForTaxRegime('3')).toEqual(['presumed', 'real'])
    expect(regimesForTaxRegime(null)).toEqual([...FEDERAL_REGIMES])
  })

  test('the suggestion is the rate of the law for each regime', () => {
    expect(suggestFederalRates('simple')).toEqual({ cofins: '0,00', pis: '0,00' })
    expect(suggestFederalRates('presumed')).toEqual({ cofins: '3,00', pis: '0,65' })
    expect(suggestFederalRates('real')).toEqual({ cofins: '7,60', pis: '1,65' })
  })

  test('a Simples company starts with the suggestion filled and marked', () => {
    expect(startFederalTaxDraft({ stored: null, taxRegime: '1' })).toEqual({
      cofins: '0,00',
      cofinsOrigin: 'suggested',
      pis: '0,00',
      pisOrigin: 'suggested',
      regime: 'simple',
    })
  })

  test('choosing a regime suggests, and typing erases the mark', () => {
    const chosen = chooseFederalRegime('presumed')
    expect(chosen).toMatchObject({ pis: '0,65', pisOrigin: 'suggested' })

    const typed = typeFederalRate({ draft: chosen, field: 'pis', text: '0,7' })
    expect(typed).toMatchObject({ cofinsOrigin: 'suggested', pis: '0,7', pisOrigin: 'typed' })
  })

  test('what is stored opens as stored, in percentage', () => {
    expect(
      startFederalTaxDraft({
        stored: {
          cofinsRate: '0.076000',
          federalRegime: 'real',
          pisRate: '0.016500',
          updatedAt: '2026-09-10T12:00:00.000Z',
        },
        taxRegime: '3',
      }),
    ).toEqual({
      cofins: '7,60',
      cofinsOrigin: 'stored',
      pis: '1,65',
      pisOrigin: 'stored',
      regime: 'real',
    })
  })

  /** O contrato que impede a conversão errada: 0,65% sai `0.006500`, nunca `0.65`. */
  test('the submission converts percentage to fraction', () => {
    expect(percentageToFraction('0,65')).toBe('0.006500')
    expect(buildFederalTaxSubmission({ ...chooseFederalRegime('presumed') })).toEqual({
      cofinsRate: '0.030000',
      federalRegime: 'presumed',
      pisRate: '0.006500',
    })
    expect(buildFederalTaxSubmission({ ...chooseFederalRegime('presumed'), pis: 'abc' })).toBeNull()
    expect(
      buildFederalTaxSubmission({
        cofins: '0',
        cofinsOrigin: null,
        pis: '0',
        pisOrigin: null,
        regime: '',
      }),
    ).toBeNull()
  })

  test('the response guard accepts a declaration or its absence', () => {
    expect(isFederalTaxResponse({ data: null })).toBe(true)
    expect(
      isFederalTaxResponse({
        data: {
          cofinsRate: '0.03',
          federalRegime: 'presumed',
          pisRate: '0.0065',
          updatedAt: '2026-09-10T12:00:00.000Z',
        },
      }),
    ).toBe(true)
    expect(isFederalTaxResponse({ data: { federalRegime: 'presumed' } })).toBe(false)
    expect(isFederalTaxResponse({})).toBe(false)
  })

  test('the panel is built from the design system', () => {
    const panel = readFileSync(new URL(PANEL, import.meta.url), 'utf8')

    expect(panel).toContain("from '@/components/ui/select'")
    expect(panel).toContain("from '@/components/ui/skeleton'")
    expect(panel).not.toContain('<select')
    expect(panel).not.toContain(' title=')
  })

  test('the page hosts the panel on the taxes tab, and only there loads it', () => {
    const page = readFileSync(new URL(PAGE, import.meta.url), 'utf8')

    expect(page).toContain('<FederalTaxPanel')
    expect(page).toContain("activeTab === 'taxes'")
  })

  test('both languages name the panel', () => {
    for (const locale of [pt, en]) {
      expect(typeof locale.tabs.taxes).toBe('string')
      expect(typeof locale.federalTaxes.title).toBe('string')
      expect(typeof locale.federalTaxes.simpleNote).toBe('string')
      expect(typeof locale.federalTaxes.realNote).toBe('string')
      expect(typeof locale.federalTaxes.origin.suggested).toBe('string')
    }
  })
})
