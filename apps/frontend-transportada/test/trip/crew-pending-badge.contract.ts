/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 217 (RF7, T506): a viagem `awaiting_crew` leva selo de tripulação pendente na listagem —
 * a mesma linguagem de atenção (âmbar) que a viagem cancelada já usa, porque nenhuma das duas é
 * verde nem é erro.
 */
describe('trip crew-pending badge contract', () => {
  test('a listagem marca awaiting_crew com o selo de tripulação pendente', async () => {
    const table = await readApplicationFile('src/modules/trip/components/TripTable.component.tsx')

    expect(table).toContain(
      "if (status === 'awaiting_crew') return `${styles.statusBadge} ${styles.statusPending}`",
    )
  })

  test('o rótulo de status e o selo existem em pt-BR e em inglês', async () => {
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const localeEn = await readApplicationFile('src/modules/trip/locales/trip.en.locale.json')
    const cssStyles = await readApplicationFile('src/modules/trip/styles/trip.module.css')
    const parsed = JSON.parse(locale) as Readonly<{ status: Readonly<{ awaiting_crew: string }> }>
    const parsedEn = JSON.parse(localeEn) as Readonly<{
      status: Readonly<{ awaiting_crew: string }>
    }>

    expect(parsed.status.awaiting_crew).toBe('Aguardando tripulação')
    expect(parsedEn.status.awaiting_crew).toBe('Awaiting crew')
    expect(cssStyles).toContain('.statusPending {')
  })
})
