/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const THEME_STYLESHEET_PATH = 'src/modules/notification/styles/notification.module.css'
const PACKAGE_STYLESHEET_PATH = 'node_modules/@adatechnology/notification-ui/dist/styles.css'
const HEX_COLOR_PATTERN = /#[0-9a-f]{3,8}\b/i
const PIXEL_PATTERN = /\b\d+(?:\.\d+)?px\b/

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * A costura do pacote são as variáveis que ele lê **com valor de fábrica** (`var(--adn-x, #fff)`):
 * é ali que o hospedeiro escreve. As outras (`--adn-color-*`) ele redeclara nas classes dele, abaixo
 * do nosso tema na cascata — escrever nelas não pegaria.
 */
function listPackageVariables(stylesheet: string): readonly string[] {
  const inputs = [...stylesheet.matchAll(/var\((--adn-[a-z0-9-]+),\s*[^)]+\)/g)].map(
    ([, variable]) => variable as string,
  )
  return [...new Set(inputs)].sort()
}

describe('tema do módulo de notificações', () => {
  // O pacote desenha com as variáveis dele. Quem não preencher todas fica com o valor de fábrica no
  // meio do nosso tema escuro — e o buraco aparece só na tela, nunca no build.
  test('preenche toda variável que o pacote consome', async () => {
    const [theme, packageStylesheet] = await Promise.all([
      readApplicationFile(THEME_STYLESHEET_PATH),
      readApplicationFile(PACKAGE_STYLESHEET_PATH),
    ])

    for (const variable of listPackageVariables(packageStylesheet)) {
      expect(`${variable} declarada: ${theme.includes(`${variable}:`)}`).toBe(
        `${variable} declarada: true`,
      )
    }
  })

  // O valor de cada uma vem do nosso token, nunca de literal: é isto que faz o módulo de terceiro
  // acompanhar uma mudança de cor ou de escala sem ninguém lembrar dele.
  test('não declara cor nem medida literal', async () => {
    const theme = await readApplicationFile(THEME_STYLESHEET_PATH)

    expect(HEX_COLOR_PATTERN.test(theme)).toBe(false)
    expect(PIXEL_PATTERN.test(theme)).toBe(false)
  })

  test('todo valor de `--adn-` referencia um token nosso', async () => {
    const theme = await readApplicationFile(THEME_STYLESHEET_PATH)
    const declarations = [...theme.matchAll(/(--adn-[a-z0-9-]+):\s*([^;]+);/g)]

    expect(declarations.length).toBeGreaterThan(0)
    for (const [, variable, value] of declarations) {
      expect(`${variable} usa token: ${(value ?? '').includes('var(--')}`).toBe(
        `${variable} usa token: true`,
      )
    }
  })
})
