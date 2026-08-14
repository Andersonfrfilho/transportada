/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ROOT_STYLESHEET_PATH = 'src/styles/index.css'
const CONTROL_TOKENS = [
  '--control-height: var(--field-height)',
  '--control-height-compact: var(--field-height-compact)',
] as const
const SQUARE_SIZE = /^(?:min-)?(width|height):\s*([\d.]+rem)$/

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

/** Regra de quadrado: mesma medida literal em largura e altura é botão de ícone, não caixa de texto. */
function findSquareLiteral(body: string): null | string {
  const sizes = new Map<string, string>()
  for (const declaration of body.split(';')) {
    const match = SQUARE_SIZE.exec(declaration.trim())
    if (match !== null) sizes.set(match[1] ?? '', match[2] ?? '')
  }
  const width = sizes.get('width')
  const height = sizes.get('height')
  if (width === undefined || height === undefined || width !== height) return null
  return width
}

async function listModuleStylesheets(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src/modules', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.css')).map((entry) => `src/modules/${entry}`)
}

describe('control height contract', () => {
  test('declares the control metrics as tokens derived from the field metrics', async () => {
    const stylesheet = await readApplicationFile(ROOT_STYLESHEET_PATH)

    for (const token of CONTROL_TOKENS) expect(stylesheet).toContain(token)
  })

  // Botão e campo que dividem a mesma fileira têm de sair da mesma medida: o `sm` de 2,5rem ficava
  // um degrau acima do botão de ícone de 2,25rem e da barra de filtro de 2,4rem ao lado dele.
  test('sizes both button metrics by the control tokens', async () => {
    const rules = listRules(await readApplicationFile(ROOT_STYLESHEET_PATH))
    const sizeDefault = rules.find((rule) => rule.selector === '.ui-button-size-default')
    const sizeCompact = rules.find((rule) => rule.selector === '.ui-button-size-sm')

    expect(sizeDefault?.body).toContain('min-height: var(--control-height)')
    expect(sizeCompact?.body).toContain('min-height: var(--control-height-compact)')
  })

  test('forbids a module from inventing the size of an icon-only control', async () => {
    const stylesheets = await listModuleStylesheets()
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      for (const { selector, body } of listRules(await readApplicationFile(filePath))) {
        const literal = findSquareLiteral(body)
        if (literal !== null) offenders.push(`${filePath} ${selector}: ${literal}`)
      }
    }

    expect(offenders).toEqual([])
    expect(stylesheets.length).toBeGreaterThan(8)
  })

  test('lines the fleet column trigger up with the button beside it', async () => {
    const rules = listRules(await readApplicationFile('src/modules/fleet/styles/fleet.module.css'))

    for (const selector of ['.iconAction', '.iconActionActive']) {
      const rule = rules.find((candidate) => candidate.selector === selector)
      expect(rule?.body).toContain('width: var(--control-height-compact)')
      expect(rule?.body).toContain('height: var(--control-height-compact)')
    }
  })
})
