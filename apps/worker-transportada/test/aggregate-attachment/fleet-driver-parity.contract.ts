/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091 T014: o que a API grava e o que o worker lê precisam concordar, e nenhuma app importa
 * código-fonte da outra — então a paridade é lida do texto, dos dois lados. Divergência aqui é
 * silenciosa: o worker escreveria numa coluna que a migration não criou, ou a API enfileiraria um
 * tipo que o envelope recusa.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  fleetDriverAttachmentOutbox,
  fleetDriverAttachments,
} from '../../src/database/aggregate-attachment.schema.js'
import { AGGREGATE_ATTACHMENT_TYPES } from '../../src/messaging/aggregate-attachment-envelope.schema.js'
import { getTableConfig } from 'drizzle-orm/pg-core'

const API_SOURCE = new URL('../../../api-transportada/src/', import.meta.url)

async function readApiFile(path: string): Promise<string> {
  return readFile(new URL(path, API_SOURCE), 'utf8')
}

/** Os nomes SQL das colunas de um `pgTable` da API, na ordem em que foram declaradas. */
function readApiColumns(source: string, exportName: string): readonly string[] {
  const start = source.indexOf(`export const ${exportName} = pgTable(`)
  const body = source.slice(start, source.indexOf('(table) => [', start))
  return [...body.matchAll(/^ {4}(\w+): \w+\((?:'([a-z_]+)')?/gmu)].map(
    (match) => match[2] ?? (match[1] as string),
  )
}

function workerColumns(table: Parameters<typeof getTableConfig>[0]): readonly string[] {
  return getTableConfig(table).columns.map((column) => column.name)
}

describe('paridade da ficha do motorista entre a API e o worker', () => {
  test('o worker só lê e escreve colunas que a migration da API cria', async () => {
    const source = await readApiFile('database/fleet-driver-attachment.schema.ts')
    const apiAttachmentColumns = readApiColumns(source, 'fleetDriverAttachments')
    const apiOutboxColumns = readApiColumns(source, 'fleetDriverAttachmentOutbox')

    expect(apiAttachmentColumns).toContain('extracted_fields')
    for (const column of workerColumns(fleetDriverAttachments)) {
      expect(apiAttachmentColumns).toContain(column)
    }
    expect(workerColumns(fleetDriverAttachmentOutbox)).toEqual(apiOutboxColumns)
  })

  /** Só a CNH é lida (D4): o tipo que a API enfileira tem de existir no envelope do worker. */
  test('todo tipo que a API manda ler existe no envelope do worker', async () => {
    const source = await readApiFile('fleet/domain/fleet-driver-attachment.policy.ts')
    const start = source.indexOf('= [', source.indexOf('FLEET_DRIVER_ATTACHMENT_READABLE_TYPES'))
    const declaration = source.slice(start, source.indexOf(']', start))
    const readable = [...declaration.matchAll(/'([a-z_]+)'/gu)].map((match) => match[1] ?? '')

    expect(readable).toEqual(['cnh'])
    for (const type of readable)
      expect(AGGREGATE_ATTACHMENT_TYPES as readonly string[]).toContain(type)
  })

  test('o leitor de colunas da API enxerga a tabela de verdade, e não uma lista vazia', async () => {
    const source = await readApiFile('database/fleet-driver-attachment.schema.ts')

    expect(readApiColumns(source, 'fleetDriverAttachments').length).toBeGreaterThan(10)
  })
})
