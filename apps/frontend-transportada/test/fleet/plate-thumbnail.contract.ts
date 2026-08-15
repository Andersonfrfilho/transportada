/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const MERCOSUL_PLATE_LENGTH = 7

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('fleet plate thumbnail contract', () => {
  test('spreads what was typed over the seven Mercosul positions', async () => {
    const { describePlateCharacters } = await loadFutureModule<FleetPlateModule>(
      '../../src/modules/fleet/shared/fleetPlate.service',
    )

    expect(describePlateCharacters('abc1d23')).toEqual(['A', 'B', 'C', '1', 'D', '2', '3'])
    // A placa vazia ainda desenha as sete posições: a miniatura mostra o formato antes do conteúdo
    expect(describePlateCharacters('')).toEqual(['', '', '', '', '', '', ''])
    expect(describePlateCharacters('abc')).toEqual(['A', 'B', 'C', '', '', '', ''])
  })

  test('ignores the separator of the old format and never draws an eighth position', async () => {
    const { describePlateCharacters } = await loadFutureModule<FleetPlateModule>(
      '../../src/modules/fleet/shared/fleetPlate.service',
    )

    // O formato antigo é digitado com hífen; a placa impressa tem sete caracteres nos dois padrões
    expect(describePlateCharacters('abc-1234')).toEqual(['A', 'B', 'C', '1', '2', '3', '4'])
    expect(describePlateCharacters('abc1d234567')).toHaveLength(MERCOSUL_PLATE_LENGTH)
    expect(describePlateCharacters('ab@c1d23')).toEqual(['A', 'B', 'C', '1', 'D', '2', '3'])
  })

  test('uppercases the plate as it is typed, without eating what is still being typed', async () => {
    const { toPlateInput } = await loadFutureModule<FleetPlateModule>(
      '../../src/modules/fleet/shared/fleetPlate.service',
    )

    // A placa é impressa em maiúsculas: o campo não devolve ao operador algo que a placa não tem
    expect(toPlateInput('emp0a14')).toBe('EMP0A14')
    expect(toPlateInput('')).toBe('')
    // O hífen sobrevive à digitação — quem o remove é o `normalizePlate` no envio
    expect(toPlateInput('abc-1234')).toBe('ABC-1234')
    // Só o caixa muda: apagar caractere durante a digitação move o cursor sozinho
    expect(toPlateInput('e')).toBe('E')
  })

  test('routes the plate field through the uppercasing', async () => {
    const identity = await readApplicationFile(
      'src/modules/fleet/components/VehicleIdentityFields.component.tsx',
    )

    expect(identity).toContain('toPlateInput(plate)')
  })

  test('draws the plate next to the field it mirrors', async () => {
    const [identity, thumbnail] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/components/PlateThumbnail.component.tsx'),
    ])

    expect(identity).toContain('<PlateThumbnail')
    expect(identity.indexOf('<PlateThumbnail')).toBeGreaterThan(identity.indexOf("t('plate')"))
    expect(thumbnail).toContain('describePlateCharacters')
    // A miniatura repete o que o campo já anuncia: dois anúncios do mesmo dado é ruído no leitor
    expect(thumbnail).toContain('aria-hidden="true"')
    // Desenho é CSS: SVG cru fora do design system é proibido
    expect(thumbnail).not.toContain('<svg')
    expect(thumbnail).toContain("t('plateBloc')")
    expect(thumbnail).toContain("t('plateCountry')")
    expect(thumbnail).toContain("t('plateCountryCode')")
    // A bandeira é desenho puro: fica no CSS, sem texto e sem emoji
    expect(thumbnail).toContain('plateFlag')
  })

  test('takes the plate colours and size from tokens, not from literals in the module', async () => {
    const [rootStyles, fleetStyles] = await Promise.all([
      readApplicationFile('src/styles/index.css'),
      readApplicationFile('src/modules/fleet/styles/fleet.module.css'),
    ])

    for (const token of [
      '--color-plate-band',
      '--color-plate-flag-green',
      '--color-plate-flag-yellow',
      '--color-plate-ink',
      '--color-plate-surface',
      '--font-plate',
      '--plate-height',
      '--plate-width',
    ]) {
      expect(rootStyles).toContain(`${token}:`)
      expect(fleetStyles).toContain(`var(${token})`)
    }

    // As cores da placa são do documento oficial, não do tema: ficam no :root e não em cada módulo
    expect(fleetStyles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  test('prints the plate wording in both dictionaries without translating it', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    const pt = JSON.parse(ptLocale) as Record<string, string>
    const en = JSON.parse(enLocale) as Record<string, string>

    // O que está impresso na placa brasileira não muda com o idioma da tela
    expect(pt['plateBloc']).toBe('Mercosul')
    expect(pt['plateCountry']).toBe('BRASIL')
    expect(pt['plateCountryCode']).toBe('BR')
    for (const key of ['plateBloc', 'plateCountry', 'plateCountryCode']) {
      expect(en[key]).toBe(pt[key])
    }
  })
})

type FleetPlateModule = {
  readonly describePlateCharacters: (value: string) => readonly string[]
  readonly toPlateInput: (value: string) => string
}
