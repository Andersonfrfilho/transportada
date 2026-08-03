/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ROOT_STYLESHEET_PATH = 'src/styles/index.css'
const SELECT_STYLES_PATH = 'src/components/ui/select.module.css'
const NFE_STYLES_PATH = 'src/modules/nfe-workspace/styles/nfeWorkspace.module.css'
const FIELD_TOKENS = [
  '--field-height: 3rem',
  '--field-height-compact: 2.4rem',
  '--field-padding: var(--space-3)',
  '--field-padding-compact: var(--space-2) var(--space-3)',
  '--field-font-size: 0.9rem',
  '--field-font-size-compact: 0.82rem',
] as const
const FULL_HEIGHT_FIELDS = [
  { filePath: SELECT_STYLES_PATH, selector: '.trigger' },
  { filePath: 'src/modules/company-settings/styles/companySettings.module.css', selector: null },
  { filePath: 'src/modules/cte-batch/styles/cteBatch.module.css', selector: null },
  { filePath: 'src/modules/cte-profiles/styles/cteProfiles.module.css', selector: null },
  { filePath: 'src/modules/fleet/styles/fleet.module.css', selector: null },
  { filePath: 'src/modules/mdfe-manifest/styles/mdfeManifest.module.css', selector: null },
  { filePath: NFE_STYLES_PATH, selector: null },
  { filePath: ROOT_STYLESHEET_PATH, selector: null },
] as const
const COMPACT_HEIGHT_FIELDS = [
  { filePath: SELECT_STYLES_PATH, selector: '.triggerCompact' },
  { filePath: 'src/modules/cte-batch/styles/cteBatch.module.css', selector: null },
  { filePath: 'src/modules/mdfe-manifest/styles/mdfeManifest.module.css', selector: null },
  { filePath: NFE_STYLES_PATH, selector: null },
  { filePath: 'src/modules/operations/styles/operationsWorkspace.module.css', selector: null },
] as const
const OFF_STANDARD_HEIGHTS = ['min-height: 2.75rem', 'min-height: 2.5rem', 'min-height: 2.4rem']
const FIELD_STYLESHEETS_WITHOUT_OFF_STANDARD_FIELDS = [
  'src/modules/cte-batch/styles/cteBatch.module.css',
  'src/modules/fleet/styles/fleet.module.css',
  'src/modules/mdfe-manifest/styles/mdfeManifest.module.css',
]

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function listRules(stylesheet: string): readonly { selector: string; body: string }[] {
  const withoutComments = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const rules: { selector: string; body: string }[] = []
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ body: match[2] ?? '', selector: (match[1] ?? '').trim() })
  }
  return rules
}

function isFieldSelector(selector: string): boolean {
  return /(^|[\s,>])(input|textarea)([[:,\s]|$)/.test(selector)
}

describe('field metrics contract', () => {
  test('declares the field metrics once, as tokens', async () => {
    const stylesheet = await readApplicationFile(ROOT_STYLESHEET_PATH)

    for (const token of FIELD_TOKENS) expect(stylesheet).toContain(token)
  })

  test('sizes every text field and every select trigger by the same token', async () => {
    const offenders: string[] = []

    for (const { filePath } of FULL_HEIGHT_FIELDS) {
      const stylesheet = await readApplicationFile(filePath)
      if (!stylesheet.includes('min-height: var(--field-height)')) offenders.push(filePath)
    }
    for (const { filePath } of COMPACT_HEIGHT_FIELDS) {
      const stylesheet = await readApplicationFile(filePath)
      if (!stylesheet.includes('min-height: var(--field-height-compact)')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
  })

  test('forbids a module from inventing its own field height', async () => {
    const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
    const stylesheets = entries.filter((entry) => entry.endsWith('.css')).map((e) => `src/${e}`)
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const stylesheet = await readApplicationFile(filePath)
      for (const { selector, body } of listRules(stylesheet)) {
        if (!isFieldSelector(selector) || !body.includes('min-height:')) continue
        const declaration = /min-height:\s*([^;]+);/.exec(body)?.[1] ?? ''
        const isAllowed =
          declaration.startsWith('var(--field-height') ||
          declaration === '0' ||
          declaration === '5rem'
        if (!isAllowed) offenders.push(`${filePath} ${selector}: ${declaration}`)
      }
    }

    expect(offenders).toEqual([])
    expect(stylesheets.length).toBeGreaterThan(8)
  })

  test('leaves no off-standard height in the stylesheets that only size fields', async () => {
    const offenders: string[] = []

    for (const filePath of FIELD_STYLESHEETS_WITHOUT_OFF_STANDARD_FIELDS) {
      const stylesheet = await readApplicationFile(filePath)
      for (const height of OFF_STANDARD_HEIGHTS) {
        if (stylesheet.includes(height)) offenders.push(`${filePath}: ${height}`)
      }
    }

    expect(offenders).toEqual([])
  })

  test('gives the emission dialog a full height field beside its selects', async () => {
    const [component, stylesheet] = await Promise.all([
      readApplicationFile('src/modules/nfe-workspace/components/CteEmissionDialog.component.tsx'),
      readApplicationFile(NFE_STYLES_PATH),
    ])
    const dialogField = listRules(stylesheet).find((rule) =>
      rule.selector.includes('.cteEmissionField input'),
    )

    expect(component).not.toContain('filterInput')
    expect(dialogField?.body).toContain('min-height: var(--field-height)')
    expect(dialogField?.body).toContain('padding: var(--field-padding)')
    expect(dialogField?.body).toContain('font-size: var(--field-font-size)')
  })

  test('keeps the filter bar fields on the compact metrics of the compact select', async () => {
    const stylesheet = await readApplicationFile(NFE_STYLES_PATH)
    const filterInput = listRules(stylesheet).find((rule) => rule.selector === '.filterInput')

    expect(filterInput?.body).toContain('min-height: var(--field-height-compact)')
    expect(filterInput?.body).toContain('padding: var(--field-padding-compact)')
    expect(filterInput?.body).toContain('font-size: var(--field-font-size-compact)')
  })

  test('keeps the three metrics of a size together in every field rule', async () => {
    const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
    const stylesheets = entries.filter((entry) => entry.endsWith('.css')).map((e) => `src/${e}`)
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const stylesheet = await readApplicationFile(filePath)
      for (const { selector, body } of listRules(stylesheet)) {
        if (!isFieldSelector(selector)) continue
        const suffix = body.includes('min-height: var(--field-height-compact)')
          ? '-compact'
          : body.includes('min-height: var(--field-height)')
            ? ''
            : null
        if (suffix === null) continue
        const expected = [
          `padding: var(--field-padding${suffix})`,
          `font-size: var(--field-font-size${suffix})`,
        ]
        for (const declaration of expected) {
          if (!body.includes(declaration)) offenders.push(`${filePath} ${selector}: ${declaration}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('anchors a grid field label at the top so the field keeps the token height', async () => {
    const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
    const stylesheets = entries.filter((entry) => entry.endsWith('.css')).map((e) => `src/${e}`)
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const stylesheet = await readApplicationFile(filePath)
      for (const { selector, body } of listRules(stylesheet)) {
        if (!selector.includes('label') || !body.includes('display: grid')) continue
        if (!body.includes('align-content: start')) offenders.push(`${filePath} ${selector}`)
      }
    }

    expect(offenders).toEqual([])
  })

  test('sizes the table search shell by the compact token', async () => {
    const stylesheet = await readApplicationFile(NFE_STYLES_PATH)
    const tableSearch = listRules(stylesheet).find((rule) => rule.selector === '.tableSearch')

    expect(tableSearch?.body).toContain('min-height: var(--field-height-compact)')
    expect(tableSearch?.body).not.toContain('height: 2.25rem')
  })

  test('states the field metrics rule for every future form', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/fields.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('--field-height')
    expect(projectContext).toContain('docs/frontend/fields.md')
  })
})
