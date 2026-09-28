/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/**
 * Spec 217 (RF7, T502): a viagem `awaiting_crew` mostra "a definir" onde hoje mostraria o vazio
 * cru (o `vehicleId` bruto, ou a lista de motoristas simplesmente ausente) — nas telas que o
 * `plan.md` da 216 já apontava e o `tasks.md` da 217 copiou.
 */
describe('trip crew-pending fallback contract', () => {
  test('a tabela de viagens mostra "a definir" para o veículo ausente, nunca o vazio cru', async () => {
    const table = await readApplicationFile('src/modules/trip/components/TripTable.component.tsx')

    expect(table).toContain("trip.vehicleId === null ? t('toDefine') : trip.vehicleId")
    expect(table).toContain("if (trip.vehicleId === null) return t('toDefine')")
  })

  test('o detalhe da viagem mostra "a definir" para veículo e motorista ausentes', async () => {
    const detail = await readApplicationFile('src/modules/trip/components/TripDetail.component.tsx')

    expect(detail).toContain('if (vehicleId === null) return toDefineLabel')
    expect(detail).toContain(
      "trip.drivers.length === 0 ? <p className={styles.hint}>{t('toDefine')}</p> : null",
    )
  })

  test('a chave de locale "a definir" existe em pt-BR e em inglês', async () => {
    const locale = await readApplicationFile('src/modules/trip/locales/trip.locale.json')
    const localeEn = await readApplicationFile('src/modules/trip/locales/trip.en.locale.json')
    const parsed = JSON.parse(locale) as Readonly<{ toDefine: string }>
    const parsedEn = JSON.parse(localeEn) as Readonly<{ toDefine: string }>

    expect(parsed.toDefine).toBe('A definir')
    expect(parsedEn.toDefine).toBe('To be defined')
  })
})
