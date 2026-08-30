/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import ptBr from '../../src/modules/identity/locales/identity.locale.json'
import en from '../../src/modules/identity/locales/identity.en.locale.json'

const usersPage = await Bun.file(
  new URL('../../src/modules/identity/pages/UserAdministration.page.tsx', import.meta.url),
).text()
const profilesPage = await Bun.file(
  new URL('../../src/modules/identity/pages/AccessProfiles.page.tsx', import.meta.url),
).text()
const entrypoint = await Bun.file(new URL('../../src/main.tsx', import.meta.url)).text()

/**
 * A tela de acessos tinha quatro painéis empilhados, cada um com botão de mostrar/esconder: o que
 * se usa todo dia — a listagem — ficava embaixo do que se consulta uma vez por mês. Papéis, grupos e
 * a atribuição saíram para tela própria; a sincronização **ficou**, porque ela é conserto da
 * listagem, e quem vê a divergência é quem estava olhando a lista.
 */
describe('a divisão entre acessos e papéis', () => {
  test('a tela de acessos não hospeda mais a matriz nem os grupos', () => {
    expect(usersPage).not.toContain('RolePermissionMatrixPanel')
    expect(usersPage).not.toContain('CompanyGroupPanel')
  })

  test('a sincronização continua na tela de acessos', () => {
    expect(usersPage).toContain('CompanyUserReconciliationPanel')
  })

  test('a tela de papéis hospeda matriz, grupos e a atribuição', () => {
    expect(profilesPage).toContain('RolePermissionMatrixPanel')
    expect(profilesPage).toContain('CompanyGroupPanel')
    expect(profilesPage).toContain('CompanyGroupAssignmentPanel')
  })

  /** Painel de tela dedicada não recebe `onToggle`: sem ele nasce aberto e não desenha o botão. */
  test('os painéis da tela dedicada não recebem alternância', () => {
    expect(profilesPage).not.toContain('onToggle')
  })
})

describe('a categoria do menu', () => {
  test('as duas telas moram na categoria de usuários', () => {
    expect(entrypoint).toContain("key: 'identity'")
    expect(entrypoint).toContain("label: 'Usuários'")
    expect(entrypoint).toContain("['users', 'access-profiles'].includes(key)")
  })

  /**
   * Sem a rota, o item do menu leva a lugar nenhum: não há router nesta app, e o caminho só existe
   * se `resolveCurrentWorkspace` souber lê-lo.
   */
  test('o caminho da tela nova é reconhecido', () => {
    expect(entrypoint).toContain("window.location.pathname === '/papeis'")
    expect(entrypoint).toContain("href: '/papeis'")
    expect(entrypoint).toContain('<AccessProfilesPage />')
  })

  /** Restauração de sessão que não conhece o workspace devolve a pessoa para a tela de NF-e. */
  test('a tela nova sobrevive ao recarregamento', () => {
    expect(entrypoint).toContain("storedWorkspace === 'access-profiles'")
  })
})

describe('os rótulos da tela nova', () => {
  test('existem nos dois idiomas, com a atribuição por extenso', () => {
    for (const locale of [ptBr, en]) {
      const profiles = (locale as { profiles?: Record<string, unknown> }).profiles
      expect(profiles).toBeDefined()
      expect(typeof profiles?.title).toBe('string')
      const assign = profiles?.assign as Record<string, unknown> | undefined
      expect(typeof assign?.submit).toBe('string')
      expect(typeof assign?.truncated).toBe('string')
    }
  })
})
