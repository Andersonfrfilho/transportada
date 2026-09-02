/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
  settingsPanelsOf,
  settingsTabsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PAGE_PATH = 'src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx'
const SCHEDULED_PANEL_PATH =
  'src/modules/nfe-workspace/components/ScheduledDistributionPanel.component.tsx'
const CURSOR_PANEL_PATH =
  'src/modules/nfe-workspace/components/DistributionCursorPanel.component.tsx'
const SCHEDULED_HOOK_PATH = 'src/modules/nfe-workspace/hooks/useScheduledDistribution.hook.ts'
const CURSOR_HOOK_PATH = 'src/modules/nfe-workspace/hooks/useDistributionCursor.hook.ts'
const READ_ONLY_PANEL_PATH =
  'src/modules/nfe-workspace/components/NfeScheduledDistribution.component.tsx'
const LOCALE_PATH = 'src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('nfe workspace distribution settings contract', () => {
  test('o opt-in e o cursor moram na aba Importações da tela de notas', () => {
    expect(SETTINGS_PANEL_PLACEMENT.scheduledDistribution).toEqual({
      module: 'nfe-workspace',
      source: 'scheduledDistribution',
      tab: 'imports',
    })
    expect(SETTINGS_PANEL_PLACEMENT.distributionCursor).toEqual({
      module: 'nfe-workspace',
      source: 'distributionCursor',
      tab: 'imports',
    })
    expect(settingsTabsOf('nfe-workspace')).toEqual(['imports'])
    expect(settingsPanelsOf('nfe-workspace', 'imports')).toEqual([
      'cargoVolume',
      'cargoWeight',
      'scheduledDistribution',
      'distributionCursor',
    ])
  })

  test('as consultas de configuração sobem na aba de importações e em nenhuma outra', () => {
    const imports = resolveSettingsDataScope('nfe-workspace', 'imports')
    const documents = resolveSettingsDataScope('nfe-workspace', 'documents')

    expect(imports.scheduledDistribution).toBe(true)
    expect(imports.distributionCursor).toBe(true)
    expect(documents.scheduledDistribution).toBe(false)
    expect(documents.distributionCursor).toBe(false)
    expect(imports.companySettings).toBe(false)
    /**
     * Spec 067: o peso padrão mora aqui porque o efeito dele aparece na tabela de Notas — é ela
     * que imprime "Sem peso da carga" na linha que ele destrava.
     */
    expect(SETTINGS_PANEL_PLACEMENT.cargoWeight).toEqual({
      module: 'nfe-workspace',
      source: 'cargoSettings',
      tab: 'imports',
    })
    expect(imports.cargoSettings).toBe(true)
    expect(documents.cargoSettings).toBe(false)
  })

  test('os painéis e os hooks moram na tela de notas', async () => {
    const [scheduledPanel, cursorPanel, scheduledHook, cursorHook] = await Promise.all([
      readApplicationFile(SCHEDULED_PANEL_PATH),
      readApplicationFile(CURSOR_PANEL_PATH),
      readApplicationFile(SCHEDULED_HOOK_PATH),
      readApplicationFile(CURSOR_HOOK_PATH),
    ])

    expect(scheduledPanel).toContain('export function ScheduledDistributionPanel')
    expect(cursorPanel).toContain('export function DistributionCursorPanel')
    expect(scheduledHook).toContain('export function useScheduledDistribution')
    expect(cursorHook).toContain('export function useDistributionCursor')
  })

  /**
   * A aba Remota é informação de operação, não de configuração: quem só lê notas continua vendo se a
   * busca automática está ligada e quando ela roda. O que a permissão guarda é o bloco que altera.
   */
  test('a aba Remota segue visível com nfe.read sozinho, e só o bloco de configuração é guardado', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('SETTINGS_MANAGE_PERMISSION')
    expect(page).toContain('canManageSettings')
    expect(page).toContain('mechanismView.showsDistribution')
    expect(page).toContain('<NfeScheduledDistribution')
    expect(page).toContain('<ScheduledDistributionPanel')
    expect(page).toContain('<DistributionCursorPanel')
  })

  test('sem a permissão nenhuma consulta de configuração sobe', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("resolveSettingsDataScope('nfe-workspace', activeTab)")
    expect(page).toContain('enabled: canManageSettings && settingsScope.scheduledDistribution')
    expect(page).toContain('enabled: canManageSettings && settingsScope.distributionCursor')
  })

  /** Atalho para uma tela que não hospeda mais o controle é caminho para lugar nenhum. */
  test('o painel somente-leitura não manda mais o operador para as configurações de empresa', async () => {
    const readOnlyPanel = await readApplicationFile(READ_ONLY_PANEL_PATH)

    expect(readOnlyPanel).not.toContain('navigateToCompanySettings')
    expect(readOnlyPanel).not.toContain('canReachSettings')
  })

  test('os rótulos dos painéis vivem no pacote de tradução das notas', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)

      expect(typeof locale['scheduledDistributionTitle']).toBe('string')
      expect(typeof locale['distributionCursorTitle']).toBe('string')
    }
  })
})
