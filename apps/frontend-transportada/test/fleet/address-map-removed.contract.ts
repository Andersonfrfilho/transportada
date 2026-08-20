/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FLEET_MODULE_ROOT = new URL('src/modules/fleet/', APPLICATION_ROOT)

/**
 * O que mandava o endereço residencial inteiro para fora do navegador era o mapa, não o
 * preenchimento: `locateAddress` só rodava com o formulário já preenchido, para achar a coordenada
 * que o `iframe` do mapa precisava. O Nominatim saiu com ele — a política dele pede um
 * `User-Agent` identificável que o `fetch` do navegador não deixa mandar. ADR-0037.
 *
 * A palavra "Nominatim" em prosa segue permitida — é assim que o comentário do serviço explica por
 * que o provedor não está lá. O que a lista barra é o host e o símbolo, não a memória da decisão.
 */
const FORBIDDEN_NEEDLE = [
  'addressMap',
  'buildMapEmbedUrl',
  'buildNominatimUrl',
  'driverAddressMapTitle',
  'fromNominatimPlace',
  'GeoPoint',
  'iframe',
  'locateAddress',
  'LOCATE_DEBOUNCE_MS',
  'MAP_SPAN_DEGREES',
  'mapUrl',
  'NOMINATIM',
  'openstreetmap',
  'toCoordinate',
] as const

/** O CEP e a busca textual continuam: o que saiu foi a geocodificação do endereço já resolvido. */
const REQUIRED_DESTINATION = [
  'https://brasilapi.com.br/api/cep/v2',
  'https://photon.komoot.io/api',
  'https://viacep.com.br/ws',
] as const

async function listFleetModuleFiles(): Promise<readonly string[]> {
  const glob = new Bun.Glob('**/*.{css,json,ts,tsx}')
  const files: string[] = []
  for await (const file of glob.scan({ cwd: FLEET_MODULE_ROOT.pathname })) files.push(file)
  return files.sort()
}

function readModuleFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, FLEET_MODULE_ROOT)).text()
}

describe('driver address map removal contract', () => {
  test('leaves no map or geocoding symbol anywhere in the fleet module', async () => {
    const files = await listFleetModuleFiles()
    expect(files.length).toBeGreaterThan(0)

    const contents = await Promise.all(files.map(readModuleFile))

    for (const [index, content] of contents.entries()) {
      for (const needle of FORBIDDEN_NEEDLE) {
        expect(`${files[index] ?? ''}:${content.includes(needle)}`).toBe(
          `${files[index] ?? ''}:false`,
        )
      }
    }
  })

  test('keeps the three destinations that survived the ADR', async () => {
    const service = await readModuleFile('shared/driverAddress.service.ts')

    for (const destination of REQUIRED_DESTINATION) {
      expect(`${destination}:${service.includes(destination)}`).toBe(`${destination}:true`)
    }
  })

  test('names no map in either dictionary', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readModuleFile('locales/fleet.locale.json'),
      readModuleFile('locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      expect(Object.keys(dictionary).filter((key) => key.includes('Map'))).toEqual([])
    }
  })
})
