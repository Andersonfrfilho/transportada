/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, it } from 'bun:test'

import companySettingsPt from '../../src/modules/company-settings/locales/companySettings.locale.json'
import companySettingsEn from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import tripLocale from '../../src/modules/trip/locales/trip.locale.json'
import {
  resolveSettingsDataScope,
  SETTINGS_PANEL_PLACEMENT,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const MODULES = new URL('../../src/modules/', import.meta.url)
const PANEL = new URL(
  '../../src/modules/company-settings/components/OccurrenceTypeCatalogPanel.component.tsx',
  import.meta.url,
)
const PAGE = new URL(
  '../../src/modules/company-settings/pages/CompanySettings.page.tsx',
  import.meta.url,
)
const TRIP_WORKSPACE_PAGE = new URL(
  '../../src/modules/trip/pages/TripWorkspace.page.tsx',
  import.meta.url,
)

async function findOccurrences(needle: string): Promise<readonly string[]> {
  const found: string[] = []
  const modules = await readdir(MODULES, { withFileTypes: true })
  for (const moduleEntry of modules.filter((candidate) => candidate.isDirectory())) {
    const root = new URL(`${moduleEntry.name}/`, MODULES)
    const stack = [root]
    while (stack.length > 0) {
      const current = stack.pop()
      if (current === undefined) continue
      const entries = await readdir(current, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        const entryUrl = new URL(entry.name, current)
        if (entry.isDirectory()) {
          stack.push(new URL(`${entry.name}/`, current))
          continue
        }
        if (!/\.(json|tsx?)$/u.test(entry.name)) continue
        const source = await readFile(entryUrl, 'utf8')
        if (source.includes(needle)) found.push(entryUrl.pathname)
      }
    }
  }
  return found
}

/**
 * O catálogo de tipos de ocorrência morava em Viagens → aba "Avisos", nome que descrevia o efeito
 * (o aviso por e-mail) em vez do que a tela é: o cadastro do catálogo (nome, etapa, interruptor de
 * aviso, modelo de e-mail). O usuário foi procurar em Configurações e não achou. Ele muda de casa —
 * Configurações da empresa, aba própria — e o componente que já existia é reaproveitado, não
 * reescrito.
 */
describe('catálogo de tipos de ocorrência em Configurações da empresa', () => {
  it('o painel tem endereço em company-settings, aba própria', () => {
    expect(SETTINGS_PANEL_PLACEMENT.occurrenceTypeCatalog).toEqual({
      module: 'company-settings',
      source: 'occurrenceTypeCatalog',
      tab: 'occurrenceTypes',
    })
  })

  it('a aba liga a consulta só dela, e só com settings.manage e a aba ativa', () => {
    expect(
      resolveSettingsDataScope('company-settings', 'occurrenceTypes').occurrenceTypeCatalog,
    ).toBe(true)
    expect(resolveSettingsDataScope('company-settings', 'company').occurrenceTypeCatalog).toBe(
      false,
    )

    const page = readFileSync(PAGE, 'utf8')
    expect(page).toMatch(/canManageSettings\s*&&\s*activeTab === 'occurrenceTypes'/u)
  })

  it('a página de Configurações hospeda o painel na própria aba', () => {
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toContain('<OccurrenceTypeCatalogPanel')
    expect(page).toContain("tab === 'occurrenceTypes'")
  })

  it('o rótulo da aba fala do catálogo, não de avisos', () => {
    expect(companySettingsPt.tabs.occurrenceTypes).toBeString()
    expect(companySettingsPt.tabs.occurrenceTypes.toLowerCase()).not.toInclude('aviso')
    expect(companySettingsEn.tabs.occurrenceTypes).toBeString()
  })

  it('o componente é reaproveitado, não duplicado: o antigo não existe mais', () => {
    expect(() =>
      readFileSync(
        new URL(
          '../../src/modules/trip/components/TripOccurrenceNotifications.component.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
    ).toThrow()
    const panel = readFileSync(PANEL, 'utf8')
    expect(panel).toContain('canManage')
    expect(panel).toContain('emailTemplateKey')
  })

  it('a aba "Avisos" não existe mais em Viagens', () => {
    const workspace = readFileSync(TRIP_WORKSPACE_PAGE, 'utf8')
    expect(workspace).not.toContain('notifications')
    expect(workspace).not.toContain('TripOccurrenceNotifications')
    expect(tripLocale.tabs).not.toHaveProperty('notifications')
  })

  it('nenhuma referência órfã ao componente ou à aba antiga sobrou no código', async () => {
    expect(await findOccurrences('TripOccurrenceNotifications')).toEqual([])
    expect(await findOccurrences('occurrenceNotifications')).toEqual([])
  })
})
