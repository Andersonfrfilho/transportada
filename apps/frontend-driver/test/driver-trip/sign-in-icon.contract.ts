/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { ICON_PATHS } from '@/components/ui/icon'

const SESSION_EXPIRED =
  'src/modules/driver-trip/components/DriverSessionExpiredNotice.component.tsx'
const LOGIN_PAGE = 'src/modules/shared/LoginIdentifier.page.tsx'

/**
 * Pedido do usuário (26/09): "o ícone de entrar de novo está incorreto" — os dois botões de entrar
 * usavam o `check`, que é confirmação, não entrada. `login` é o par oposto de `logout`, e é a
 * oposição que se lê: a seta se afasta da porta para entrar, e vai até ela para sair.
 */
describe('o botão de entrar mostra que se entra, não que se confirma', () => {
  it('login existe e desenha o oposto de logout', () => {
    expect(ICON_PATHS.login.length).toBeGreaterThan(0)
    expect(ICON_PATHS.login).not.toEqual(ICON_PATHS.logout)
  })

  it('a sessão vencida e a tela de entrada usam o mesmo ícone de entrar', () => {
    for (const file of [SESSION_EXPIRED, LOGIN_PAGE]) {
      const source = readFileSync(file, 'utf8')
      expect(source).toInclude('name="login"')
      expect(source).not.toInclude('name="check"')
    }
  })
})
