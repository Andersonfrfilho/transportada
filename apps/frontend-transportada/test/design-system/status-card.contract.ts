/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

/** O cartão de estado do cabeçalho: `<div className="workspace-status-card">…</div>`. */
const STATUS_CARD = /className="workspace-status-card"[\s\S]*?<\/div>/g

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('workspace status card contract', () => {
  /** `{viewModel.status}` cru imprimia "issued" na tela — o vocabulário é interno, não é rótulo. */
  test('renders no raw view-model status', async () => {
    const offenders: string[] = []
    let cards = 0

    for (const componentPath of await listSourceComponents()) {
      const source = await readApplicationFile(componentPath)
      for (const match of source.matchAll(STATUS_CARD)) {
        cards += 1
        if (/>\{\s*\w*[Vv]iewModel\.status\s*\}</.test(match[0])) offenders.push(componentPath)
      }
    }

    expect(offenders).toEqual([])
    expect(cards).toBeGreaterThan(0)
  })
})
