import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const form = readFileSync(
  new URL(
    '../../src/modules/driver-trip/components/DriverOccurrenceRegistrationForm.component.tsx',
    import.meta.url,
  ),
  'utf8',
)

/**
 * Spec 247 T7.1 (revisão de design): a observação saía como `<textarea>` nativo (borda do navegador,
 * rótulo sem peso) ao lado dos campos de valores já desenhados. Ela usa o mesmo campo, rótulo e alvo.
 */
describe('a observação do registro tem o desenho dos campos de valores (spec 247 T7.1)', () => {
  test('rótulo e textarea levam as classes do campo de valores', () => {
    expect(form).toContain("from '../styles/occurrenceValues.module.css'")
    expect(form).toContain('className={valueStyles.fieldLabel}')
    expect(form).toContain('className={valueStyles.input}')
    expect(form).toContain('className={valueStyles.field}')
  })
})
