import { describe, expect, test } from 'bun:test'

import { resolveThemedLogoUrl } from '../../src/modules/shared/colorTheme.service'

describe('o logo troca com o tema no app do motorista', () => {
  test('fundo escuro pede a silhueta branca; fundo claro, o original', () => {
    const logoUrl = 'https://api.test/public/landing-logo'

    expect(resolveThemedLogoUrl({ logoUrl, theme: 'dark' })).toBe(`${logoUrl}?variant=white`)
    expect(resolveThemedLogoUrl({ logoUrl, theme: 'light' })).toBe(logoUrl)
  })

  test('endereço que já tem consulta recebe a variação com &', () => {
    expect(resolveThemedLogoUrl({ logoUrl: 'https://a.b/logo?v=2', theme: 'dark' })).toBe(
      'https://a.b/logo?v=2&variant=white',
    )
  })
})
