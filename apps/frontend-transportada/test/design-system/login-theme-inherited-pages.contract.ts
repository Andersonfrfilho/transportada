/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const REPOSITORY_ROOT = new URL('../../../..', import.meta.url)
const THEME = 'deploy/keycloak/theme/login/'
const THEME_PROPERTIES = `${THEME}theme.properties`
const THEME_STYLES = `${THEME}resources/css/login.css`
const BASE_SCRIPT_SHIM = `${THEME}resources/js/passwordVisibility.js`
const MESSAGES = ['messages_en', 'messages_pt_BR'] as const

/**
 * As páginas que continuam vindo do tema `base` escrevem `class="${properties.kcX!}"`. Chave sem
 * mapeamento vira classe vazia, e como `.field-control` empilha os filhos na mesma célula, o olho
 * da senha sem classe cobre o campo inteiro com a caixa cinza do navegador.
 */
const REQUIRED_CLASS_MAPPINGS = {
  kcButtonDefaultClass: 'action-quiet',
  kcFormPasswordVisibilityButtonClass: 'field-reveal',
  kcFormPasswordVisibilityIconShow: 'field-reveal-icon',
  kcFormPasswordVisibilityIconHide: 'field-reveal-icon',
} as const

/**
 * O texto destas páginas é do `base`, e o `base` fala inglês. Chave ausente não falha: a tela
 * aparece em inglês no meio do fluxo em português, que foi como a troca de senha obrigatória
 * chegou ao operador.
 */
const REQUIRED_MESSAGE_KEYS = [
  'updatePasswordTitle',
  'updatePasswordMessage',
  'passwordNew',
  'passwordConfirm',
  'logoutOtherSessions',
  'doSubmit',
  'doCancel',
  'notMatchPasswordMessage',
  'invalidPasswordConfirmMessage',
  'logoutConfirmTitle',
  'logoutConfirmHeader',
  'doLogout',
  'successLogout',
  'backToApplication',
  'proceedWithAction',
  'emailVerifyTitle',
  'clientNotFoundMessage',
] as const

function repositoryFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, REPOSITORY_ROOT)).text()
}

function declaredKeys(source: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator === -1) continue
    entries.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim())
  }
  return entries
}

describe('tema do Keycloak: as páginas herdadas do `base`', () => {
  test('mapeia toda classe que o markup herdado escreve', async () => {
    const properties = declaredKeys(await repositoryFile(THEME_PROPERTIES))

    for (const [key, expected] of Object.entries(REQUIRED_CLASS_MAPPINGS)) {
      expect(properties.get(key)).toBe(expected)
    }
  })

  test('desenha o olho que o markup herdado escreve como `<i>`, não como par de SVG', async () => {
    const styles = await repositoryFile(THEME_STYLES)

    expect(styles).toContain('.field-reveal-icon {')
    expect(styles).toContain(".field-reveal[aria-pressed='true'] .field-reveal-icon")
    expect(styles).toContain('.checkbox label {')
  })

  test('neutraliza o `passwordVisibility.js` do `base`, que alternaria o campo em dobro', async () => {
    const shim = await repositoryFile(BASE_SCRIPT_SHIM)

    expect(shim).not.toContain('addEventListener')
    expect(shim).not.toContain('onclick')
    expect(shim).toContain('password-visibility.js')
  })

  test.each([...MESSAGES])('%s traz o texto das páginas herdadas', async (bundle) => {
    const messages = declaredKeys(await repositoryFile(`${THEME}messages/${bundle}.properties`))

    for (const key of REQUIRED_MESSAGE_KEYS) {
      expect(messages.get(key)).toBeString()
      expect(messages.get(key)).not.toBe('')
    }
  })
})
