/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const MODULES = new URL('../../src/modules/', import.meta.url)
const HOME = 'shared/objectKeys.service.ts'

async function declarations(): Promise<readonly string[]> {
  const found: string[] = []
  const modules = await readdir(MODULES, { withFileTypes: true })
  for (const entry of modules.filter((candidate) => candidate.isDirectory())) {
    const shared = new URL(`${entry.name}/shared/`, MODULES)
    const files = await readdir(shared, { withFileTypes: true }).catch(() => [])
    for (const file of files.filter((candidate) => candidate.name.endsWith('.ts'))) {
      const source = await readFile(new URL(file.name, shared), 'utf8')
      if (/\bfunction hasExactKeys\b/.test(source)) found.push(`${entry.name}/shared/${file.name}`)
    }
  }
  return found.sort()
}

/**
 * Spec 079: `hasExactKeys` decide se um corpo de resposta tem exatamente as chaves esperadas — e é
 * a última linha antes de a API vazar token, identidade de tenant ou XML fiscal para dentro do
 * cliente. A spec 078 mediu isso ao tentar afrouxá-la: catorze testes reprovaram, entre eles
 * `recusa um resumo de credencial que traga o token de volta`.
 *
 * ⚠️ Uma regra de segurança escrita oito vezes é uma regra que muda em sete lugares e **fica para
 * trás no oitavo** — e o oitavo é o que vaza, calado. A 078 chegou a mexer em quatro delas antes de
 * reverter, e falhou em partes justamente porque as assinaturas divergiam: cinco em forma de objeto
 * devolvendo `boolean`, três posicionais devolvendo *type predicate*.
 */
describe('a guarda de chaves tem um lugar só (spec 079)', () => {
  test('nenhum módulo declara a sua', async () => {
    expect(await declarations()).toEqual([])
  })

  /** E o lugar existe: contrato que só proíbe deixaria o repositório sem a função. */
  test('a guarda compartilhada existe', async () => {
    const source = await readFile(new URL(HOME, MODULES), 'utf8')

    expect(source).toInclude('export function hasExactKeys')
    /** Spec 078: `hasKeys` é a mesma família — separá-las convidaria a próxima cópia. */
    expect(source).toInclude('export function hasKeys')
  })
})
