/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O `schema-snapshot.contract.ts` olha só para o topo da cadeia: o último snapshot encadeia no
 * penúltimo e casa com o schema TypeScript. Isso deixa passar um `snapshot.json` errado no **meio**
 * da linha — o gate fica verde, e o erro só aparece quando alguém gera a próxima migration a partir
 * dali, longe da causa.
 *
 * Não é hipótese. Duas sessões implementaram a spec 216 em paralelo e cada uma gerou migration
 * própria para a mesma mudança; ao desduplicar, o `snapshot.json` de uma delas descrevia um schema
 * **sem treze migrations** que a outra linha já tinha. Reaproveitá-lo no meio da cadeia produziria
 * exatamente o snapshot mentiroso que nenhum teste pegava.
 *
 * Este contrato cobre a cadeia a partir de `FIRST_DIRECTORY_REQUIRING_SNAPSHOT`, e de duas direções
 * que se complementam:
 *
 * - **alinhamento**: o `prevIds` de cada snapshot é o `id` do snapshot imediatamente anterior na
 *   ordem cronológica dos nomes de pasta;
 * - **travessia**: andar pelos ponteiros a partir da âncora visita toda pasta exatamente uma vez e
 *   chega ao fim — o que reprova bifurcação, ciclo e pasta órfã mesmo que o alinhamento passasse.
 *
 * O recorte não é preguiça: o `support.ts` registra a medição de por que antes do corte a história é
 * genuinamente ramificada. Daqui para a frente ela é uma linha só, e é onde migration nova nasce.
 *
 * O que ficou **de fora**, e por quê: conferir que cada snapshot descreve o schema que resultaria de
 * aplicar as migrations até ele não tem caminho honesto hoje. O `generateMigration` do drizzle-kit
 * lança `resolver(unique) was called without a HintsHandler` num par qualquer do meio da cadeia —
 * ele precisa de um resolvedor interativo para desambiguar renomeação, e responder por ele seria
 * chutar intenção. E o par gerado não é o `migration.sql` publicado nem em teoria: a spec 215 fase A
 * tirou colunas do schema TS de propósito **sem** mexer no banco, então a divergência entre snapshot
 * e SQL é projetada ali. Comparar os dois reprovaria o repositório por estar certo.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  FIRST_DIRECTORY_REQUIRING_SNAPSHOT,
  listMigrationDirectories,
  migrationsDirectory,
  SNAPSHOT_FILE,
} from './support.js'

type ChainLink = {
  readonly directory: string
  readonly id: string
  readonly previousIds: readonly string[]
}

/** A pasta anterior ao corte é a âncora: entra só para dar o `id` que o primeiro do corte cita. */
type VerifiedChain = {
  readonly anchor: ChainLink
  readonly links: readonly ChainLink[]
}

async function readChainLink(directory: string): Promise<ChainLink | undefined> {
  const path = join(migrationsDirectory.pathname, directory, SNAPSHOT_FILE)
  const content = await readFile(path, 'utf8').catch(() => undefined)
  if (content === undefined) return undefined

  const snapshot = JSON.parse(content) as { id?: string; prevIds?: readonly string[] }
  if (snapshot.id === undefined) {
    throw new Error(`${directory}/${SNAPSHOT_FILE}: snapshot sem \`id\``)
  }

  return { directory, id: snapshot.id, previousIds: snapshot.prevIds ?? [] }
}

/**
 * Sequencial de propósito: são mais de duzentos snapshots de ~1,4 MB, e ler todos em paralelo
 * segura a árvore inteira na memória sem ganhar nada — só `id` e `prevIds` sobrevivem à leitura.
 */
async function readAllChainLinks(): Promise<readonly ChainLink[]> {
  const links: ChainLink[] = []
  for (const directory of await listMigrationDirectories()) {
    const link = await readChainLink(directory)
    if (link !== undefined) links.push(link)
  }

  return links
}

async function readVerifiedChain(): Promise<VerifiedChain> {
  const all = await readAllChainLinks()
  const cutoff = all.findIndex((link) => link.directory === FIRST_DIRECTORY_REQUIRING_SNAPSHOT)
  if (cutoff <= 0) {
    throw new Error(
      `${FIRST_DIRECTORY_REQUIRING_SNAPSHOT} não tem ${SNAPSHOT_FILE}, ou não tem pasta anterior ` +
        'para servir de âncora — o corte da cadeia precisa ser revisto',
    )
  }

  const anchor = all[cutoff - 1]
  if (anchor === undefined) throw new Error('âncora da cadeia ausente')

  return { anchor, links: all.slice(cutoff) }
}

function describeExpectation(link: ChainLink, expected: ChainLink): string {
  return (
    `${link.directory}: prevIds é ${JSON.stringify(link.previousIds)}, ` +
    `esperado ["${expected.id}"] — o id de ${expected.directory}`
  )
}

describe('cadeia de snapshots do drizzle', () => {
  test('cada snapshot aponta para o imediatamente anterior na ordem cronológica', async () => {
    const { anchor, links } = await readVerifiedChain()

    const misaligned = links.flatMap((link, index) => {
      const expected = index === 0 ? anchor : links[index - 1]
      if (expected === undefined) return []
      if (link.previousIds.length === 1 && link.previousIds[0] === expected.id) return []

      return [describeExpectation(link, expected)]
    })

    expect(misaligned).toEqual([])
  })

  test('nenhum id se repete entre pastas', async () => {
    const { anchor, links } = await readVerifiedChain()

    const directoriesById = new Map<string, string[]>()
    for (const link of [anchor, ...links]) {
      directoriesById.set(link.id, [...(directoriesById.get(link.id) ?? []), link.directory])
    }

    const repeated = [...directoriesById.entries()]
      .filter(([, directories]) => directories.length > 1)
      .map(([id, directories]) => `id ${id} aparece em ${directories.join(', ')}`)

    expect(repeated).toEqual([])
  })

  /**
   * A bifurcação é varrida sobre a cadeia **inteira**, não só sobre o trecho verificado: a migration
   * duplicada da spec 216 entrou como pasta nova apontando para um pai que já tinha sucessor, e é
   * esse par que precisa ficar vermelho, venha a intrusa de onde vier.
   */
  test('nenhuma bifurcação: dois snapshots nunca partem do mesmo ponto verificado', async () => {
    const { anchor, links } = await readVerifiedChain()
    const verifiedIds = new Set([anchor, ...links].map((link) => link.id))

    const claimantsByPreviousId = new Map<string, string[]>()
    for (const link of await readAllChainLinks()) {
      for (const previousId of link.previousIds) {
        if (!verifiedIds.has(previousId)) continue
        claimantsByPreviousId.set(previousId, [
          ...(claimantsByPreviousId.get(previousId) ?? []),
          link.directory,
        ])
      }
    }

    const forks = [...claimantsByPreviousId.entries()]
      .filter(([, directories]) => directories.length > 1)
      .map(
        ([id, directories]) => `o snapshot ${id} é citado como pai por ${directories.join(', ')}`,
      )

    expect(forks).toEqual([])
  })

  /**
   * Andar pelos ponteiros, e não pela ordem dos nomes: é o que separa pasta órfã de um
   * desalinhamento simples.
   *
   * O ciclo não ganha teste próprio porque, com `id` único e sem bifurcação já exigidos acima, ele
   * é estruturalmente impossível: cada pasta tem um pai só, e o mapa de sucessores é uma função.
   * Fechar a cadeia em laço obriga alguma pasta a repetir `id` ou a disputar um pai, e aí reprova
   * antes de chegar aqui — verificado em 2026-09-27 apontando duas pastas vizinhas uma para a outra,
   * que reprovou na bifurcação e nesta travessia. O laço é limitado ao tamanho da cadeia de
   * qualquer forma, então nem em teoria ele roda para sempre.
   */
  test('a travessia a partir da âncora é uma linha só e visita toda pasta', async () => {
    const { anchor, links } = await readVerifiedChain()
    const successorsByPreviousId = new Map<string, ChainLink>()
    for (const link of links) {
      const [previousId] = link.previousIds
      if (previousId !== undefined) successorsByPreviousId.set(previousId, link)
    }

    const walked: string[] = []
    let pointer = anchor.id

    for (let step = 0; step < links.length; step += 1) {
      const next = successorsByPreviousId.get(pointer)
      if (next === undefined) break

      walked.push(next.directory)
      pointer = next.id
    }

    const walkedDirectories = new Set(walked)
    const unreachable = links
      .map((link) => link.directory)
      .filter((directory) => !walkedDirectories.has(directory))

    expect(unreachable).toEqual([])
    expect(walked).toEqual(links.map((link) => link.directory))
  })
})
