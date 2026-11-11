/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 RF8: a caixa de conversas é módulo separado da ocorrência. Nenhum arquivo de `whatsapp-inbox/` nem o schema
 * das tabelas novas importa ou cita a conversa da ocorrência; e toda consulta do repositório, menos a varredura do
 * job de vencimento, filtra pela empresa.
 */
import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'

const SOURCE_ROOT = new URL('../../src/', import.meta.url).pathname
const FORBIDDEN = [
  /occurrence[_-]conversation/iu,
  /occurrenceConversation/u,
  /trip_document_occurrences/u,
]

async function moduleFiles(): Promise<readonly string[]> {
  const files: string[] = []
  for await (const file of new Glob('whatsapp-inbox/**/*.ts').scan(SOURCE_ROOT)) files.push(file)
  files.push('database/whatsapp-chat.schema.ts')
  return files
}

describe('a caixa de conversas não toca a ocorrência (spec 319 RF8)', () => {
  test('nenhum arquivo do módulo cita a conversa da ocorrência', async () => {
    const files = await moduleFiles()
    expect(files.length).toBeGreaterThanOrEqual(7)
    for (const file of files) {
      const text = await Bun.file(`${SOURCE_ROOT}${file}`).text()
      for (const pattern of FORBIDDEN)
        expect({ file, hit: pattern.test(text) }).toEqual({ file, hit: false })
    }
  })

  test('cada consulta do repositório filtra pela empresa, exceto a varredura do vencimento', async () => {
    const text = await Bun.file(
      `${SOURCE_ROOT}whatsapp-inbox/infrastructure/drizzle-whatsapp-chat.repository.ts`,
    ).text()
    const methods = text.split(/\n {4}async /u).slice(1)
    expect(methods.length).toBeGreaterThanOrEqual(10)
    for (const method of methods) {
      const name = method.slice(0, method.indexOf('('))
      if (name === 'expireDue') continue
      expect({ name, scoped: /companyId/u.test(method) }).toEqual({ name, scoped: true })
    }
  })
})
