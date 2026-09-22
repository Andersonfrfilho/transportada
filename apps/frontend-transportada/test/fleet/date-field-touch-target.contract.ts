/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T507, item 2: o botão "Abrir calendário" do `FleetDateField` tinha o tamanho do ícone
 * (18px) — alvo que o dedo erra no celular (`web.md` §10 pede 44px). A caixa do botão sobe ao
 * `--touch-target` sem inflar o ícone, e a margem negativa devolve o espaço ganho: o campo não muda
 * de altura nem desalinha dos vizinhos (medido nas três telas que usam o campo; ver evidence.md).
 * Molde de `test/trip/mobile-first.contract.ts`: regra lida do CSS com o `@media` que a envolve.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FLEET_STYLESHEET_PATH = 'src/modules/fleet/styles/fleet.module.css'
const FLEET_FIELD_PATH = 'src/modules/fleet/components/FleetField.component.tsx'
const DATE_FIELD_ACTION_SELECTOR = '.dateField button'

type Rule = Readonly<{ body: string; media: string; selector: string }>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function listRules(stylesheet: string): readonly Rule[] {
  const source = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const rules: Rule[] = []
  const preludes: string[] = []
  let buffer = ''

  for (const character of source) {
    if (character === '{') {
      preludes.push(buffer.replaceAll(/\s+/g, ' ').trim())
      buffer = ''
      continue
    }
    if (character === '}') {
      const prelude = preludes.pop() ?? ''
      const media = preludes.find((candidate) => candidate.startsWith('@media')) ?? ''
      if (!prelude.startsWith('@')) rules.push({ body: buffer.trim(), media, selector: prelude })
      buffer = ''
      continue
    }
    buffer += character
  }

  return rules
}

function declarations(body: string): readonly string[] {
  return body
    .split(';')
    .map((declaration) => declaration.replaceAll(/\s+/g, ' ').trim())
    .filter(Boolean)
}

describe('alvo de toque do calendário no campo de data da Frota (spec 154 T507, item 2)', () => {
  test('o FleetDateField marca o próprio rótulo com a classe que carrega o alvo', async () => {
    const source = await readApplicationFile(FLEET_FIELD_PATH)
    const dateField = source.slice(source.indexOf('export function FleetDateField'))

    expect(dateField).toContain('<label className={styles.dateField}>')
  })

  test('o botão sobe ao alvo de toque na base (celular), sem tamanho literal', async () => {
    const rules = listRules(await readApplicationFile(FLEET_STYLESHEET_PATH))
    const rule = rules.find(
      (candidate) => candidate.selector === DATE_FIELD_ACTION_SELECTOR && candidate.media === '',
    )
    const body = declarations(rule?.body ?? '')

    expect(body).toContain('min-width: var(--touch-target)')
    expect(body).toContain('min-height: var(--touch-target)')
  })

  test('a margem negativa devolve o que a caixa cresceu — o campo não muda de altura', async () => {
    const rules = listRules(await readApplicationFile(FLEET_STYLESHEET_PATH))
    const rule = rules.find(
      (candidate) => candidate.selector === DATE_FIELD_ACTION_SELECTOR && candidate.media === '',
    )
    const body = declarations(rule?.body ?? '')

    expect(body).toContain('margin-block: calc((var(--icon-size-md) - var(--touch-target)) / 2)')
    expect(body).toContain(
      'margin-inline: calc(var(--icon-size-md) - var(--touch-target) + var(--field-padding)) calc(-1 * var(--field-padding))',
    )
  })

  test('nenhuma regra de breakpoint tira o alvo de toque do botão', async () => {
    const rules = listRules(await readApplicationFile(FLEET_STYLESHEET_PATH))
    const overrides = rules.filter(
      (candidate) => candidate.selector === DATE_FIELD_ACTION_SELECTOR && candidate.media !== '',
    )

    expect(overrides).toEqual([])
  })
})
