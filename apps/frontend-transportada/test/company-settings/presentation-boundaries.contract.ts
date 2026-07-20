/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('company settings presentation boundary contract', () => {
  test('uses localized component boundaries and design tokens without secret persistence', async () => {
    const [page, client, upload, form] = await Promise.all([
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
      readModule('src/modules/company-settings/shared/companySettingsClient.service.ts'),
      readModule('src/modules/company-settings/hooks/useCertificateUpload.hook.ts'),
      readModule('src/modules/company-settings/components/CompanyProfileFields.component.tsx'),
    ])
    const locale = await readModule(
      'src/modules/company-settings/locales/companySettings.locale.json',
    )
    const styles = await readModule(
      'src/modules/company-settings/styles/companySettings.module.css',
    )

    expect(page).toContain("useTranslation('companySettings')")
    expect(page).toContain('CompanySettingsForm')
    expect(page).toContain('CertificateUploadForm')
    expect(page).toContain('canManageSettings')
    expect(page).toContain('certificatesQuery')
    expect(form).toContain('cityIbgeCode')
    expect(form).toContain('stateRegistration')
    expect(form).toContain('taxRegime')
    expect(locale).toContain('"production"')
    expect(locale).toContain('{{expiresAt}}')
    expect(locale).toContain('{{validFrom}}')
    expect(styles).toContain('var(--')
    const sensitiveBoundary = [page, client, upload].join('\n')
    expect(sensitiveBoundary).not.toContain('localStorage')
    expect(sensitiveBoundary).not.toContain('sessionStorage')
    expect(sensitiveBoundary).not.toContain('indexedDB')
    expect(sensitiveBoundary).not.toContain('caches.')
  })
})
