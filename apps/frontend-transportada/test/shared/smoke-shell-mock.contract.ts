/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

const TEST_ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHELL_PATH = fileURLToPath(new URL('../../src/main.tsx', import.meta.url))

/** A rota que o cabeçalho chama em toda página, e o padrão que a mocka no smoke. */
const PICTURE_ROUTE_SUFFIX = '/picture'
const PICTURE_MOCK_PATTERN = '**/company-users/*/picture'

function smokeHelpers(): readonly string[] {
  return readdirSync(TEST_ROOT).filter((name) => name.endsWith('-smoke.helper.ts'))
}

function read(name: string): string {
  return readFileSync(`${TEST_ROOT}${name}`, 'utf8')
}

/**
 * Irmão do contrato de cobertura do sino, e pela mesma razão: requisição que o **shell** faz em toda
 * página não tem dono nenhum entre os helpers de workspace, e sem mock ela escapa para a API real —
 * que não sobe no smoke. O sintoma é opaco e coletivo: trinta e três cenários caem de uma vez com
 * `net::ERR_FAILED` numa URL que nada no cenário pediu.
 *
 * Foi assim que a foto do cabeçalho derrubou o gate inteiro no primeiro commit dela.
 */
describe('todo helper de smoke mocka o que o shell pede sozinho', () => {
  test('o cabeçalho de fato busca a foto pela rota autenticada', () => {
    const shell = readFileSync(SHELL_PATH, 'utf8')

    expect(shell).toContain('useCompanyUserPicture')
  })

  test('quem mocka a identidade também mocka a foto', () => {
    const uncovered = smokeHelpers().filter((name) => {
      const source = read(name)
      if (!source.includes("'**/auth/me'")) return false
      return !source.includes(PICTURE_MOCK_PATTERN)
    })

    expect(uncovered).toEqual([])
  })

  /** Mockar a rota e nunca chamá-la é o mesmo que não mockar: o registro precisa acontecer. */
  test('o mock da foto é registrado, não só declarado', () => {
    const unregistered = smokeHelpers().filter((name) => {
      const source = read(name)
      if (!source.includes(PICTURE_MOCK_PATTERN)) return false
      const calls = source.split('registerUserPictureMock').length - 1
      return calls < 2
    })

    expect(unregistered).toEqual([])
  })

  /** A rota da foto continua sendo a que o cliente chama: renomeá-la sem o mock repete a queda. */
  test('o cliente e o mock falam da mesma rota', () => {
    const client = readFileSync(
      fileURLToPath(
        new URL('../../src/modules/identity/shared/companyUsersClient.service.ts', import.meta.url),
      ),
      'utf8',
    )

    expect(client).toContain(`${PICTURE_ROUTE_SUFFIX}`)
  })
})
