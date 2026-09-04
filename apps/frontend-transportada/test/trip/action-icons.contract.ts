/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const MODULES = ['trip', 'trip-financials'] as const

/**
 * `web.md` §9: ação com convenção estabelecida leva ícone ao lado do rótulo — numa fileira de seis
 * botões o olho acha o símbolo antes de ler a palavra. Na tela da viagem metade levava e metade
 * não, o que é pior que nenhum: a inconsistência tira do ícone a função de atalho.
 *
 * O contrato varre por glob, então botão novo entra na conferência sozinho.
 */
async function listComponents(): Promise<readonly string[]> {
  const paths: string[] = []
  for (const module of MODULES) {
    const directory = `src/modules/${module}/components`
    const entries = await readdir(new URL(directory, APPLICATION_ROOT)).catch(() => [])
    for (const entry of entries) {
      if (entry.endsWith('.component.tsx')) paths.push(`${directory}/${entry}`)
    }
  }
  return paths
}

function readFile(path: string): Promise<string> {
  return Bun.file(new URL(path, APPLICATION_ROOT)).text()
}

/** Um bloco por `<Button>`, do abre ao fecha — é dentro dele que o ícone precisa estar. */
function buttonsWithoutIcon(source: string): readonly string[] {
  return [...source.matchAll(/<Button\b[\s\S]*?<\/Button>/g)]
    .map((match) => match[0])
    .filter((block) => !block.includes('<Icon'))
    .map((block) => /t\('([^']+)'/.exec(block)?.[1] ?? block.slice(0, 60))
}

describe('ícone em toda ação da viagem', () => {
  test('nenhum botão da viagem fica sem ícone', async () => {
    const offenders: string[] = []
    for (const path of await listComponents()) {
      for (const label of buttonsWithoutIcon(await readFile(path))) {
        offenders.push(`${path}: ${label}`)
      }
    }

    expect(offenders).toEqual([])
  })

  /** A mesma ação leva o mesmo ícone em toda a tela — dois ícones para "devolver" é inconsistência. */
  test('separar, carregar e devolver usam um ícone só, na lista e no lote', async () => {
    const [stopList, stateActions] = await Promise.all([
      readFile('src/modules/trip/components/TripStopList.component.tsx'),
      readFile('src/modules/trip/components/TripStateActions.component.tsx'),
    ])

    for (const [action, icon] of [
      ['separate', 'check'],
      ['load', 'truck'],
      ['return', 'arrow-up'],
    ] as const) {
      const inList = new RegExp(`actions\\.${action}[\\s\\S]{0,200}?name="${icon}"`).test(stopList)
      const listBefore = new RegExp(`name="${icon}"[\\s\\S]{0,200}?actions\\.${action}`).test(
        stopList,
      )
      const inBatch = new RegExp(
        `name="${icon}"[\\s\\S]{0,200}?stateActions\\.batch${action[0]?.toUpperCase()}${action.slice(1)}`,
      ).test(stateActions)

      expect(inList || listBefore).toBe(true)
      expect(inBatch).toBe(true)
    }
  })
})
