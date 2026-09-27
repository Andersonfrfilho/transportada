/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** Alvo de toque de 44px (`web.md` §10) — o mínimo para quem opera de pé, com uma mão. */
const TOUCH_TARGET_PX = 44

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listStylesheets(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.css')).map((entry) => `src/${entry}`)
}

function listRules(stylesheet: string): readonly { body: string; selector: string }[] {
  const withoutComments = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const rules: { body: string; selector: string }[] = []
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ body: match[2] ?? '', selector: (match[1] ?? '').trim() })
  }
  return rules
}

/**
 * `--control-height-compact`/`--field-height-compact` também têm "height" no nome — a busca exige
 * que a propriedade não venha colada a uma letra ou a um hífen, senão casaria a variável também.
 */
function listHeightDeclarations(body: string): readonly { property: string; value: string }[] {
  return [...body.matchAll(/(?<![\w-])(min-height|height)\s*:\s*([^;]+);?/g)].map((match) => ({
    property: match[1] ?? '',
    value: (match[2] ?? '').trim(),
  }))
}

/** `undefined` para valor não-literal (`var(...)`, `%`, `vh`, `dvh`, `auto`…) — nada a medir ali. */
function toPixels(value: string): number | undefined {
  const rem = /^([0-9.]+)rem$/.exec(value)
  if (rem?.[1] !== undefined) return Number(rem[1]) * 16
  const px = /^([0-9.]+)px$/.exec(value)
  if (px?.[1] !== undefined) return Number(px[1])
  return undefined
}

/** O truque padrão de esconder o `<input>` nativo e manter só o rótulo visível (ver `file-field.module.css`). */
function isVisuallyHiddenRule(body: string): boolean {
  return body.includes('clip-path') && body.includes('position: absolute')
}

describe('alvo de toque: nenhum controle abaixo de 44px (spec 189 T3.6)', () => {
  test('nada de --control-height-compact na app', async () => {
    const stylesheets = await listStylesheets()
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const stylesheet = await readApplicationFile(filePath)
      if (stylesheet.includes('--control-height-compact')) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(stylesheets.length).toBeGreaterThan(5)
  })

  test('nenhum min-height/height literal de controle fica abaixo de 44px', async () => {
    const stylesheets = await listStylesheets()
    const offenders: string[] = []

    for (const filePath of stylesheets) {
      const stylesheet = await readApplicationFile(filePath)
      for (const { body, selector } of listRules(stylesheet)) {
        if (isVisuallyHiddenRule(body)) continue
        for (const { property, value } of listHeightDeclarations(body)) {
          const pixels = toPixels(value)
          if (pixels !== undefined && pixels < TOUCH_TARGET_PX) {
            offenders.push(`${filePath} ${selector} { ${property}: ${value} }`)
          }
        }
      }
    }

    expect(offenders).toEqual([])
  })

  test('o botão da fila no cabeçalho tem o alvo do sino (spec 193 D13)', async () => {
    const stylesheet = await readApplicationFile(
      'src/modules/driver-trip/styles/driverTrip.module.css',
    )
    const rule = listRules(stylesheet).find(({ selector }) => selector === '.queueButton')

    expect(rule?.body).toContain('min-height: var(--touch-target)')
    expect(rule?.body).toContain('min-width: var(--touch-target)')
  })

  test('o botão do design system não tem variante abaixo de 44px', async () => {
    const buttonSource = await readApplicationFile('src/components/ui/button.tsx')

    expect(buttonSource).not.toContain("'sm'")
    expect(buttonSource).not.toContain('ui-button-size-sm')
  })
})
