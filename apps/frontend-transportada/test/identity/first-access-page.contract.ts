/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('first access page contract', () => {
  test('wires the bootstrap client and hook, and covers every administrator field', async () => {
    const page = await readModule('src/modules/identity/pages/FirstAccess.page.tsx')

    expect(page).toContain("useTranslation('identity')")
    expect(page).toContain('useBootstrapFirstAdmin')
    expect(page).toContain('createBootstrapClient')
    expect(page).toContain('getIdentityEnvironment')
    for (const field of ['firstName', 'lastName', 'email', 'username', 'password', 'token']) {
      expect(page).toContain(`'${field}'`)
    }
    expect(page).toContain("type: 'password'")
    expect(page).toContain('role="alert"')
  })

  /**
   * Depois do arranque a página continuava servida, oferecendo um formulário que já não tinha como
   * concluir. Quem fecha a porta é a API — aqui só se obedece à resposta dela.
   */
  test('gates the form behind the availability probe and leaves for the login once it closes', async () => {
    const [page, hook] = await Promise.all([
      readModule('src/modules/identity/pages/FirstAccess.page.tsx'),
      readModule('src/modules/identity/hooks/useBootstrapAvailability.hook.ts'),
    ])

    expect(page).toContain('useBootstrapAvailability')
    expect(page).toContain('Skeleton')
    expect(hook).toContain('checkAvailability')
    expect(hook).toContain("window.location.replace('/')")
  })

  test('never duplicates fiscal profile validation on the first-access screen', async () => {
    const page = await readModule('src/modules/identity/pages/FirstAccess.page.tsx')

    expect(page).not.toContain('CompanyProfileFields')
    expect(page).not.toContain('taxRegime')
    expect(page).not.toContain('cnpj')
  })

  test('never distinguishes bootstrap refusal reasons in the UI', async () => {
    const page = await readModule('src/modules/identity/pages/FirstAccess.page.tsx')

    expect(page).not.toContain('TOKEN_MISMATCH')
    expect(page).not.toContain('ALREADY_PROVISIONED')
    expect(page).not.toContain('TOKEN_NOT_CONFIGURED')
    expect(page).not.toContain('COMPANY_MISSING')
  })

  test('keeps no sensitive value in browser storage', async () => {
    const [page, hook, client] = await Promise.all([
      readModule('src/modules/identity/pages/FirstAccess.page.tsx'),
      readModule('src/modules/identity/hooks/useBootstrapFirstAdmin.hook.ts'),
      readModule('src/modules/identity/shared/bootstrapClient.service.ts'),
    ])
    const sensitiveBoundary = [page, hook, client].join('\n')

    expect(sensitiveBoundary).not.toContain('localStorage')
    expect(sensitiveBoundary).not.toContain('sessionStorage')
    expect(sensitiveBoundary).not.toContain('indexedDB')
    expect(sensitiveBoundary).not.toContain('caches.')
  })

  test('sizes its fields by the shared design tokens', async () => {
    const styles = await readModule('src/modules/identity/styles/identity.module.css')

    expect(styles).toContain('var(--')
    expect(styles).toContain('min-height: var(--field-height)')
    expect(styles).toContain('padding: var(--field-padding)')
    expect(styles).toContain('font-size: var(--field-font-size)')
  })

  test('registers the identity locale in both languages', async () => {
    const [i18nService, locale, englishLocale] = await Promise.all([
      readModule('src/modules/shared/i18n/i18n.service.ts'),
      readModule('src/modules/identity/locales/identity.locale.json'),
      readModule('src/modules/identity/locales/identity.en.locale.json'),
    ])

    expect(i18nService).toContain('identityLocale')
    expect(i18nService).toContain('identityEnglishLocale')
    expect(i18nService).toContain('identity: identityLocale')
    expect(i18nService).toContain('identity: identityEnglishLocale')
    for (const key of [
      'firstName',
      'lastName',
      'email',
      'username',
      'password',
      'token',
      'submit',
      'unavailable',
    ]) {
      expect(locale).toContain(`"${key}"`)
      expect(englishLocale).toContain(`"${key}"`)
    }
  })
})
