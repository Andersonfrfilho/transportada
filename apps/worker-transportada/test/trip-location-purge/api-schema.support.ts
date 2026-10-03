/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir, readFile } from 'node:fs/promises'

export const API_DATABASE_DIRECTORY = new URL(
  '../../../api-transportada/src/database/',
  import.meta.url,
)

export type ApiTable = {
  readonly block: string
  readonly hasPosition: boolean
  readonly name: string
}

export const TABLE_DECLARATION = /pgTable\(\s*'([a-z0-9_]+)'/g
/**
 * Qualquer coluna cujo nome contenha `latitude` — `latitude`, `home_latitude`, `previous_latitude`,
 * um `pickup_latitude` que alguém crie amanhã — ou o conjunto das cinco colunas de posição do evento
 * (spread). O recorte literal de `latitude` era o que o D8 dizia, e deixava passar a coordenada da
 * casa do motorista: coordenada é coordenada independentemente do nome que a coluna recebeu, e um
 * guarda que só reconhece um nome não é guarda.
 */
const POSITION_COLUMN = /\b[a-zA-Z]*[Ll]atitude\s*:\s*numeric\(|\.\.\.buildEventLocationColumns\(\)/

export function parseApiTables(source: string): ApiTable[] {
  const declarations = [...source.matchAll(TABLE_DECLARATION)]

  return declarations.map((declaration, index) => {
    const block = source.slice(
      declaration.index ?? 0,
      declarations[index + 1]?.index ?? source.length,
    )
    return { block, hasPosition: POSITION_COLUMN.test(block), name: declaration[1] ?? '' }
  })
}

export async function readApiTables(): Promise<ApiTable[]> {
  const fileNames = (await readdir(API_DATABASE_DIRECTORY)).filter((fileName) =>
    fileName.endsWith('.schema.ts'),
  )
  const sources = await Promise.all(
    fileNames.map((fileName) => readFile(new URL(fileName, API_DATABASE_DIRECTORY), 'utf8')),
  )
  return sources.flatMap(parseApiTables)
}
