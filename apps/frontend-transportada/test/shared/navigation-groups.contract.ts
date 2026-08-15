/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REGISTRY_WORKSPACES = ['fleet', 'cte-profiles'] as const

function readShell(): Promise<string> {
  return Bun.file(new URL('src/main.tsx', APPLICATION_ROOT)).text()
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
    const shell = await readShell()
    const registries = readGroupBlock(shell, 'registries')

    expect(registries).toContain("label: 'Cadastros'")
    for (const workspace of REGISTRY_WORKSPACES) expect(registries).toContain(`'${workspace}'`)
  })

  test('leaves administration with the company configuration only', async () => {
    const shell = await readShell()
    const administration = readGroupBlock(shell, 'administration')

    expect(administration).toContain("'company-settings'")
    for (const workspace of REGISTRY_WORKSPACES) {
      expect(administration).not.toContain(`'${workspace}'`)
    }
  })

  // O estado de abertura é indexado pela chave do grupo: esquecer uma cópia deixa o grupo
  // novo permanentemente fechado no botão que abre tudo
  test('keeps every group key in the open-state records', async () => {
    const shell = await readShell()
    const records = shell.match(
      /setOpenGroups\(\{[\s\S]*?\}\)|useState<[^>]*>\(\{[\s\S]*?\n {2}\}\)/g,
    )

    expect(records?.length ?? 0).toBeGreaterThan(0)
    for (const record of records ?? []) {
      for (const key of ['administration', 'fiscal', 'operations', 'registries']) {
        expect(record).toContain(`${key}:`)
      }
    }
  })
})
