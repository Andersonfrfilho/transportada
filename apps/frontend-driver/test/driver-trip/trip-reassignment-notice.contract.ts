/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const COMPONENT = new URL(
  '../../src/modules/driver-trip/components/DriverTripReassignedNotice.component.tsx',
  import.meta.url,
)
const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)
const WORKSPACE_PAGE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)
const LOCALE = new URL(
  '../../src/modules/driver-trip/locales/driverTrip.locale.json',
  import.meta.url,
)
const LOCALE_EN = new URL(
  '../../src/modules/driver-trip/locales/driverTrip.en.locale.json',
  import.meta.url,
)

type ReassignedTripLocale = Readonly<{
  reassignedTrip: Readonly<{ dismiss: string; notice: string }>
}>

describe('o aviso de reatribuição (spec 217 RF8/D6)', () => {
  it('o componente traduz as duas chaves e devolve o dispensar ao chamador', () => {
    const source = readFileSync(COMPONENT, 'utf8')

    expect(source).toContain("t('reassignedTrip.notice')")
    expect(source).toContain("t('reassignedTrip.dismiss')")
    expect(source).toContain('onDismiss: () => void')
    expect(source).toContain('onClick={onDismiss}')
  })

  it('o hook detecta a reatribuição comparando a leitura nova com a anterior, sem useEffect', () => {
    const hook = readFileSync(HOOK, 'utf8')

    expect(hook).toContain('hasReassignedTrip({')
    expect(hook).toContain('hasReassignedTripNotice: isTripReassignedNoticeVisible')
    expect(hook).toContain('dismissReassignedTripNotice')
  })

  it('a tela da viagem mostra o aviso quando o hook acusa reatribuição', () => {
    const page = readFileSync(WORKSPACE_PAGE, 'utf8')

    expect(page).toContain('driverTrip.hasReassignedTripNotice ? (')
    expect(page).toContain(
      '<DriverTripReassignedNotice onDismiss={driverTrip.dismissReassignedTripNotice} />',
    )
  })

  it('as duas chaves existem em português e em inglês, com texto não vazio', () => {
    const locale = JSON.parse(readFileSync(LOCALE, 'utf8')) as ReassignedTripLocale
    const localeEn = JSON.parse(readFileSync(LOCALE_EN, 'utf8')) as ReassignedTripLocale

    expect(locale.reassignedTrip.notice.length).toBeGreaterThan(0)
    expect(locale.reassignedTrip.dismiss.length).toBeGreaterThan(0)
    expect(localeEn.reassignedTrip.notice.length).toBeGreaterThan(0)
    expect(localeEn.reassignedTrip.dismiss.length).toBeGreaterThan(0)
  })
})
