/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  compositeOver,
  contrastRatio,
  readApplicationFile,
  readThemes,
} from '../design-system/contrast.helper'

const MIN_TEXT_CONTRAST = 4.5
const FEEDBACK_RULE = /\n\.feedback \{([^}]*)\}/u

function readDeclaration(block: string, property: string): string {
  const match = new RegExp(`(?:^|[\\s;])${property}:\\s*([^;]+);`, 'u').exec(block)
  if (match?.[1] === undefined) throw new Error(`declaração ausente: ${property}`)

  return match[1].trim()
}

function resolveColor(value: string, tokens: ReadonlyMap<string, string>): string {
  const token = /^var\((--[\w-]+)\)$/u.exec(value)
  if (token?.[1] !== undefined) return resolveToken(token[1], tokens)

  const mix = /^color-mix\(in srgb, var\((--[\w-]+)\) (\d+)%, var\((--[\w-]+)\) \d+%\)$/u.exec(
    value,
  )
  if (mix?.[1] === undefined || mix[2] === undefined || mix[3] === undefined) {
    throw new Error(`cor que o contrato não sabe resolver: ${value}`)
  }

  return compositeOver({
    color: resolveToken(mix[1], tokens),
    percent: Number(mix[2]) / 100,
    surface: resolveToken(mix[3], tokens),
  })
}

function resolveToken(name: string, tokens: ReadonlyMap<string, string>): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`token ausente: ${name}`)

  return value
}

describe('o alerta da barra de papéis em lote tem contraste de texto (spec 239 N1)', () => {
  test('texto 13,6 px sobre o fundo do `.feedback`: 4,5:1 ou mais nos dois temas', async () => {
    const styles = await readApplicationFile(
      'src/modules/identity/styles/userAdministration.module.css',
    )
    const block = FEEDBACK_RULE.exec(styles)?.[1]
    expect(block).toBeDefined()

    for (const [theme, tokens] of await readThemes()) {
      const text = resolveColor(readDeclaration(block ?? '', 'color'), tokens)
      const background = resolveColor(readDeclaration(block ?? '', 'background'), tokens)

      expect(`${theme} ${contrastRatio(text, background) >= MIN_TEXT_CONTRAST}`).toBe(
        `${theme} true`,
      )
    }
  })
})
