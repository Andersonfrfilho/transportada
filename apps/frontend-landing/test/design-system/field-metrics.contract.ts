/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ROOT_STYLESHEET_PATH = 'src/styles/index.css'
const FORM_STYLESHEET_PATH = 'src/modules/application/components/PreRegistrationForm.module.css'
const FIELD_TOKENS = [
  '--field-height: 3rem',
  '--field-height-compact: 2.4rem',
  '--field-padding: var(--space-3)',
  '--field-padding-compact: var(--space-2) var(--space-3)',
  '--field-font-size: 0.9rem',
  '--field-font-size-compact: 0.82rem',
] as const
/** Um valor de altura fixo aqui é regressão para pixel mágico — a regra de design tokens existe
 * para nenhum stylesheet reinventar a métrica que já existe como token. */
const OFF_STANDARD_HEIGHTS = ['min-height: 2.75rem', 'min-height: 2.5rem', 'min-height: 2.4rem']

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('field metrics contract', () => {
  test('declares the field metrics once, as tokens', async () => {
    const stylesheet = await readApplicationFile(ROOT_STYLESHEET_PATH)

    for (const token of FIELD_TOKENS) {
      expect(stylesheet).toContain(token)
    }
  })

  test('the pre-registration form measures its fields off the token, never a literal height', async () => {
    const stylesheet = await readApplicationFile(FORM_STYLESHEET_PATH)

    expect(stylesheet).toContain('height: var(--field-height)')
    expect(stylesheet).toContain('padding: var(--field-padding)')
    expect(stylesheet).toContain('font-size: var(--field-font-size)')
    for (const offStandard of OFF_STANDARD_HEIGHTS) {
      expect(stylesheet).not.toContain(offStandard)
    }
  })
})
