/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REGISTRY_WORKSPACES = ['fleet', 'cte-profiles'] as const

function readShell(): Promise<string> {
  return Bun.file(new URL('src/main.tsx', APPLICATION_ROOT)).text()
}

function readNavigation(): Promise<string> {
  return Bun.file(
    new URL('src/modules/shared/workspaceNavigation.constant.ts', APPLICATION_ROOT),
  ).text()
}

function readGroupBlock(shell: string, key: string): string {
  const start = shell.indexOf(`key: '${key}',`, shell.indexOf('NAVIGATION_GROUPS'))
  if (start === -1) throw new Error(`missing navigation group ${key}`)
  const end = shell.indexOf('\n  },', start)
  if (end === -1) throw new Error(`unterminated navigation group ${key}`)
  return shell.slice(start, end)
}

describe('workspace navigation groups contract', () => {
  // Frota e perfis são cadastro, não configuração da empresa: misturá-los em "Administração"
  // escondia o cadastro de veículos atrás de um rótulo que ninguém abre para cadastrar
  test('gathers the registries under their own group', async () => {
    const navigation = await readNavigation()
    const registries = readGroupBlock(navigation, 'registries')

    expect(registries).toContain("label: 'Cadastros'")
    for (const workspace of REGISTRY_WORKSPACES) expect(registries).toContain(`'${workspace}'`)
  })

  test('leaves administration with the company configuration only', async () => {
    const navigation = await readNavigation()
    const administration = readGroupBlock(navigation, 'administration')

    expect(administration).toContain("'company-settings'")
    for (const workspace of REGISTRY_WORKSPACES) {
      expect(administration).not.toContain(`'${workspace}'`)
    }
  })

  // O estado de abertura tem fonte única: cópias literais divergiam, e a que abria todos os
  // grupos de uma vez fazia o menu nascer com scroll interno por não caber na barra
  test('derives the open-state from a single source covering every group key', async () => {
    const shell = await readShell()
    const start = shell.indexOf('function resolveOpenGroups')
    const source = shell.slice(start, shell.indexOf('\n}', start))

    expect(start).toBeGreaterThan(-1)
    for (const key of ['administration', 'fiscal', 'identity', 'operations', 'registries']) {
      expect(source).toContain(`${key}:`)
    }
  })

  test('keeps no open-state literal outside that source', async () => {
    const shell = await readShell()

    expect(shell).not.toContain('setOpenGroups({')
  })
})
