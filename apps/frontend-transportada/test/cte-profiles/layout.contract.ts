/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('cte emission profiles layout contract', () => {
  test('splits the workspace deck only while a profile is open for editing', async () => {
    const [page, styles] = await Promise.all([
      readModule('src/modules/cte-profiles/pages/CteProfiles.page.tsx'),
      readModule('src/modules/cte-profiles/styles/cteProfiles.module.css'),
    ])

    expect(page).toContain('workspaceDeckEditing')
    expect(styles).toContain('.workspaceDeckEditing')
    expect(styles).not.toContain('minmax(0, 3fr) minmax(0, 2fr)')
  })

  test('sizes the field grid by the container and never lets a control overflow it', async () => {
    const styles = await readModule('src/modules/cte-profiles/styles/cteProfiles.module.css')

    expect(styles).toContain('repeat(auto-fit, minmax(')
    expect(styles).not.toContain('@media (min-width: 40rem)')
    expect(styles).toContain('min-width: 0')
    expect(styles).toContain('width: 100%')
    expect(styles).toContain('align-items: end')
  })

  test('matches the control metrics and the copper focus ring of company settings', async () => {
    const [profileStyles, settingsStyles] = await Promise.all([
      readModule('src/modules/cte-profiles/styles/cteProfiles.module.css'),
      readModule('src/modules/company-settings/styles/companySettings.module.css'),
    ])

    for (const declaration of ['min-height: 3rem', 'padding: var(--space-3)', 'border-radius: 0']) {
      expect(settingsStyles).toContain(declaration)
      expect(profileStyles).toContain(declaration)
    }
    expect(profileStyles).toContain(
      'outline: 2px solid color-mix(in srgb, var(--color-copper) 70%, transparent)',
    )
    expect(profileStyles).not.toContain('min-height: 2.75rem')
  })

  test('keeps the checkbox on one line and takes its skin from the design system', async () => {
    const [styles, field] = await Promise.all([
      readModule('src/modules/cte-profiles/styles/cteProfiles.module.css'),
      readModule('src/modules/cte-profiles/components/ProfileField.component.tsx'),
    ])

    expect(styles).toContain('.fieldGroup > .checkboxField')
    expect(styles).not.toContain('accent-color')
    expect(field).toContain("from '@/components/ui/checkbox'")
  })

  test('anchors the table scroller and offers the profile action above the rows', async () => {
    const [page, list, styles] = await Promise.all([
      readModule('src/modules/cte-profiles/pages/CteProfiles.page.tsx'),
      readModule('src/modules/cte-profiles/components/CteProfileList.component.tsx'),
      readModule('src/modules/cte-profiles/styles/cteProfiles.module.css'),
    ])

    expect(styles).toContain('position: relative')
    expect(styles).toContain('.panelHead')
    expect(styles).toContain('.statusInactive')
    expect(page).toContain('panelHead')
    expect(list).toContain('statusInactive')
    expect(list).toContain('rowActions')
  })

  test('states the empty repeatable groups instead of leaving a bare action', async () => {
    const [components, matchers, locale] = await Promise.all([
      readModule('src/modules/cte-profiles/components/CteProfileComponentRows.component.tsx'),
      readModule('src/modules/cte-profiles/components/CteProfileMatcherFields.component.tsx'),
      readModule('src/modules/cte-profiles/locales/cteProfiles.locale.json'),
    ])

    expect(components).toContain('componentsEmpty')
    expect(matchers).toContain('matchersEmpty')
    expect(locale).toContain('"componentsEmpty"')
    expect(locale).toContain('"matchersEmpty"')
  })

  test('draws every value from the design tokens with no literal colour', async () => {
    const styles = await readModule('src/modules/cte-profiles/styles/cteProfiles.module.css')

    expect(styles).toContain('var(--color-')
    expect(styles).toContain('var(--space-')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styles).not.toMatch(/\brgba?\(/)
  })
})
