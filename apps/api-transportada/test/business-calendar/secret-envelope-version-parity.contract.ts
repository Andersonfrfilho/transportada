/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final): a API sela a chave da FeriadosAPI e o worker a abre, e as duas apps não importam
 * código uma da outra: a única coisa que garante que o envelope de uma abre na outra é a MESMA versão do pacote
 * `@adatechnology/secret-envelope`. Uma delas subir sozinha deixaria o formato mudar de um lado só, e o worker passaria a
 * responder `credential_unreadable` sem erro algum nos testes de nenhuma das duas.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

const SECRET_ENVELOPE_PACKAGE = '@adatechnology/secret-envelope'
const EXACT_VERSION = /^\d+\.\d+\.\d+$/u

const API_MANIFEST = new URL('../../package.json', import.meta.url)
const WORKER_MANIFEST = new URL('../../../worker-transportada/package.json', import.meta.url)

type Manifest = { readonly dependencies?: Readonly<Record<string, string>> }

async function readDeclaredVersion(manifestUrl: URL): Promise<string | undefined> {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')) as Manifest
  return manifest.dependencies?.[SECRET_ENVELOPE_PACKAGE]
}

describe('paridade da versão do cofre de segredos entre a API e o worker (spec 262)', () => {
  test('a API e o worker declaram a mesma versão de @adatechnology/secret-envelope', async () => {
    const apiVersion = await readDeclaredVersion(API_MANIFEST)
    const workerVersion = await readDeclaredVersion(WORKER_MANIFEST)

    expect(apiVersion).toBeDefined()
    expect(workerVersion).toBe(apiVersion)
  })

  test('a versão é exata nas duas pontas: ^ e ~ deixariam o formato subir de um lado só', async () => {
    expect(await readDeclaredVersion(API_MANIFEST)).toMatch(EXACT_VERSION)
    expect(await readDeclaredVersion(WORKER_MANIFEST)).toMatch(EXACT_VERSION)
  })
})
