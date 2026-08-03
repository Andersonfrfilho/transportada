/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ROOT_STYLESHEET_PATH = 'src/styles/index.css'
const SHELL_RULES = [
  { filePath: ROOT_STYLESHEET_PATH, selector: '.application-header' },
  { filePath: ROOT_STYLESHEET_PATH, selector: '.workspace-shell' },
  { filePath: ROOT_STYLESHEET_PATH, selector: '.foundation-shell' },
  { filePath: ROOT_STYLESHEET_PATH, selector: '.page-transition-skeleton' },
  {
    filePath: 'src/modules/company-settings/styles/companySettings.module.css',
    selector: '.companySettingsShell',
  },
  { filePath: 'src/modules/cte-batch/styles/cteBatch.module.css', selector: '.cteBatchShell' },
  {
    filePath: 'src/modules/cte-profiles/styles/cteProfiles.module.css',
    selector: '.cteProfilesShell',
  },
  { filePath: 'src/modules/fleet/styles/fleet.module.css', selector: '.fleetShell' },
  {
    filePath: 'src/modules/mdfe-manifest/styles/mdfeManifest.module.css',
    selector: '.manifestShell',
  },
  {
    filePath: 'src/modules/nfe-workspace/styles/nfeWorkspace.module.css',
    selector: '.workspaceShell',
  },
  { filePath: 'src/modules/operations/styles/operationsWorkspace.module.css', selector: '.shell' },
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listStylesheets(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.css')).map((entry) => `src/${entry}`)
}

function readRuleBody(stylesheet: string, selector: string): string {
  const start = stylesheet.indexOf(`\n${selector} {`)
  if (start < 0) return ''
  const end = stylesheet.indexOf('}', start)
  return stylesheet.slice(start, end)
}

describe('layout width contract', () => {
  test('declares one shared container width in the root theme', async () => {
    const stylesheet = await readApplicationFile(ROOT_STYLESHEET_PATH)

    expect(stylesheet).toContain('--layout-gutter: var(--space-8)')
    expect(stylesheet).toContain('--layout-max-width: 78rem')
    expect(stylesheet).toContain(
      '--layout-width: min(100% - var(--layout-gutter), var(--layout-max-width))',
    )
    expect(stylesheet).toContain('--space-10:')
  })

  test('widens the gutter once for every shell instead of once per module', async () => {
    const stylesheet = await readApplicationFile(ROOT_STYLESHEET_PATH)
    const wideScreenBlock = stylesheet.slice(stylesheet.indexOf('@media (min-width: 40rem)'))

    expect(wideScreenBlock).toContain('--layout-gutter: var(--space-12)')
    expect(stylesheet.split('--layout-gutter:').length - 1).toBe(2)
  })

  test('aligns every workspace shell with the application header', async () => {
    const offenders: string[] = []

    for (const { filePath, selector } of SHELL_RULES) {
      const stylesheet = await readApplicationFile(filePath)
      const body = readRuleBody(stylesheet, selector)
      if (!body.includes('width: var(--layout-width)')) offenders.push(`${filePath} ${selector}`)
    }

    expect(offenders).toEqual([])
  })

  test('forbids a module from sizing its own container', async () => {
    const stylesheets = await listStylesheets()
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const stylesheet = await readApplicationFile(filePath)
      const declarations = stylesheet.match(/min\(100% -[^)]*\)/g) ?? []
      const custom = declarations.filter(
        (declaration) => declaration !== 'min(100% - var(--layout-gutter)',
      )
      if (custom.length > 0) offenders.push(`${filePath}: ${custom.join(' | ')}`)
    }

    expect(offenders).toEqual([])
    expect(stylesheets.length).toBeGreaterThan(8)
  })

  test('keeps the operations shell on the spacing tokens like every other shell', async () => {
    const stylesheet = await readApplicationFile(
      'src/modules/operations/styles/operationsWorkspace.module.css',
    )
    const body = readRuleBody(stylesheet, '.shell')

    expect(body).toContain('var(--space-')
    expect(body).not.toMatch(/\d+rem/)
  })

  test('states the shared container rule for every future workspace', async () => {
    const [rule, projectContext] = await Promise.all([
      readApplicationFile('../../docs/frontend/layout.md'),
      readApplicationFile('../../CLAUDE.md'),
    ])

    expect(rule).toContain('--layout-width')
    expect(projectContext).toContain('docs/frontend/layout.md')
  })
})
