/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  SETTINGS_PANEL_PLACEMENT,
  resolveSettingsDataScope,
  settingsPanelsOf,
  settingsTabsOf,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PAGE_PATH = 'src/modules/nfse-invoice/pages/NfseInvoiceWorkspace.page.tsx'
const CREDENTIAL_PANEL_PATH =
  'src/modules/nfse-invoice/components/NfseCredentialPanel.component.tsx'
const PROFILE_PANEL_PATH =
  'src/modules/nfse-invoice/components/NfseEmissionProfilePanel.component.tsx'
const HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseSettings.hook.ts'
const LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'
const COMPANY_SETTINGS_LOCALE_PATH =
  'src/modules/company-settings/locales/companySettings.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('nfse invoice settings tab contract', () => {
  test('a configuração de NFS-e mora na tela de NFS-e, na aba de configuração', () => {
    expect(SETTINGS_PANEL_PLACEMENT.nfseCredential).toEqual({
      module: 'nfse-invoice',
      source: 'nfse',
      tab: 'settings',
    })
    expect(SETTINGS_PANEL_PLACEMENT.nfseProfiles).toEqual({
      module: 'nfse-invoice',
      source: 'nfse',
      tab: 'settings',
    })
    expect(settingsTabsOf('nfse-invoice')).toEqual(['settings'])
    expect(settingsPanelsOf('nfse-invoice', 'settings')).toEqual(['nfseCredential', 'nfseProfiles'])
  })

  /** Quem entra para ver a lista de notas não paga pelas três consultas de configuração. */
  test('as consultas de configuração sobem na aba de configuração e em nenhuma outra', () => {
    expect(resolveSettingsDataScope('nfse-invoice', 'settings').nfse).toBe(true)
    expect(resolveSettingsDataScope('nfse-invoice', 'invoices').nfse).toBe(false)
    expect(resolveSettingsDataScope('nfse-invoice', 'settings').companySettings).toBe(false)
  })

  test('os painéis e o hook moram no módulo de NFS-e', async () => {
    const credentialPanel = await readApplicationFile(CREDENTIAL_PANEL_PATH)
    const profilePanel = await readApplicationFile(PROFILE_PANEL_PATH)
    const hook = await readApplicationFile(HOOK_PATH)

    expect(credentialPanel).toContain('export function NfseCredentialPanel')
    expect(profilePanel).toContain('export function NfseEmissionProfilePanel')
    expect(hook).toContain('export function useNfseSettings')
  })

  /** Aba ausente, não desabilitada: quem não pode configurar não vê que a configuração existe. */
  test('a aba de configuração só entra na lista com settings.manage', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('NFSE_SETTINGS_MANAGE_PERMISSION')
    expect(page).toContain('canManageSettings')
    expect(page).toContain('...(canManageSettings ? [settingsTab] : [])')
  })

  test('o hook recebe permissão e aba aberta no mesmo enabled', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("resolveSettingsDataScope('nfse-invoice', activeTab)")
    expect(page).toContain('enabled: canManageSettings && settingsScope.nfse')
  })

  /**
   * O rascunho da credencial é uma cópia feita na montagem: sem a chave que muda quando a consulta
   * responde, o painel monta vazio e o operador regrava por cima do que já estava selado. Os perfis
   * chegam direto da consulta, sem cópia local que congele a lista vazia.
   */
  test('credencial gravada e perfis existentes chegam aos campos quando a consulta responde', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain(
      "key={`${settings.fiscalEnvironment}:${settings.credentialQuery.data?.id ?? 'none'}`}",
    )
    expect(page).toContain('summary={settings.credentialQuery.data}')
    expect(page).toContain('profiles={settings.profilesQuery.data ?? []}')
  })

  test('os rótulos da aba e dos painéis vivem no pacote de NFS-e', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tabs = locale['tabs'] as Record<string, string> | undefined

      expect(typeof tabs?.['invoices']).toBe('string')
      expect(typeof tabs?.['settings']).toBe('string')
      expect(typeof locale['nfseCredentialTitle']).toBe('string')
      expect(typeof locale['nfseProfileTitle']).toBe('string')
    }

    const portuguese = await readLocale(LOCALE_PATH)
    expect((portuguese['tabs'] as Record<string, string>)['settings']).toBe('Configuração')

    const companySettings = await readLocale(COMPANY_SETTINGS_LOCALE_PATH)
    expect(Object.keys(companySettings).filter((key) => key.startsWith('nfse'))).toEqual([])
  })
})
