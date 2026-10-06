/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.1/T5.3: TripOccurrencesWorkspace ganha Tabs com Feed e Tipos, e a aba Tipos monta o
 * painel do catálogo (só com `companies.settings`) no lugar do placeholder.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { TripOccurrencesWorkspacePage } from '@/modules/trip/pages/TripOccurrencesWorkspace.page'

const PAGE_SOURCE = readFileSync(
  new URL('../src/modules/trip/pages/TripOccurrencesWorkspace.page.tsx', import.meta.url),
  'utf8',
)

describe('TripOccurrencesWorkspacePage tabs (T5.1)', () => {
  it('exporta a página', () => {
    expect(TripOccurrencesWorkspacePage).toBeDefined()
  })

  it('declara as abas Feed e Tipos', () => {
    expect(PAGE_SOURCE).toContain("'feed', 'types'")
  })

  it('monta o painel de tipos na aba Tipos, só com companies.settings, sem o placeholder', () => {
    expect(PAGE_SOURCE).toContain('<TripOccurrenceTypesTab canManage={canManageSettings} />')
    expect(PAGE_SOURCE).toContain('canManageSettings ?')
    expect(PAGE_SOURCE).not.toContain('em construção')
  })
})
