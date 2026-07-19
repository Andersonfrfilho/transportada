import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('frontend foundation contract', () => {
  test('declares the independent Vite, PWA, i18n and Query foundation', async () => {
    const packageManifest = await readApplicationFile('package.json')
    const viteConfiguration = await readApplicationFile('vite.config.ts')

    expect(packageManifest).toContain('"vite"')
    expect(packageManifest).toContain('"@tanstack/react-query"')
    expect(packageManifest).toContain('"i18next"')
    expect(packageManifest).toContain('"vite-plugin-pwa"')
    expect(packageManifest).toContain('"workbox-window"')
    expect(viteConfiguration).toContain('VitePWA')
    expect(viteConfiguration).toContain("navigateFallback: '/index.html'")
  })

  test('keeps the foundation status clear without operational fiscal data', async () => {
    const page = await readApplicationFile('src/modules/foundation/pages/FoundationStatus.page.tsx')

    expect(page).toContain('foundation.operationDisabled')
    expect(page).not.toContain('NF-e')
    expect(page).not.toContain('CT-e')
  })

  test('defines responsive coverage for mobile, tablet and desktop', async () => {
    const styles = await readApplicationFile('src/styles/index.css')
    const englishLocale = await readApplicationFile(
      'src/modules/foundation/locales/foundation.en.locale.json',
    )

    expect(styles).toContain('@media (min-width: 48rem)')
    expect(styles).toContain('@media (min-width: 40rem)')
    expect(styles).toContain('@media (min-width: 64rem)')
    expect(styles).toContain('@media (min-width: 80rem)')
    expect(styles).toContain('prefers-reduced-motion')
    expect(englishLocale).toContain('"operationDisabled"')
  })
})
