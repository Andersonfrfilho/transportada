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

/**
 * Sobrou a busca textual: a geocodificação saiu com o mapa, e o CEP passou a ser servido pela nossa
 * rota — quem guarda a ausência dos dois provedores é `test/shared/postal-code-lookup.contract.ts`.
 */
const REQUIRED_DESTINATION = ['https://photon.komoot.io/api'] as const

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

  test('keeps the destination that survived the ADR', async () => {
    const service = await readModuleFile('shared/driverAddress.service.ts')

    for (const destination of REQUIRED_DESTINATION) {
      expect(`${destination}:${service.includes(destination)}`).toBe(`${destination}:true`)
    }
  })

  /**
   * O que a ADR-0037 tirou foi o mapa **do endereço do motorista** — `iframe` de terceiro sobre dado
   * pessoal. O mapa das rotas é desenho nosso sobre geometria pública, e por isso o verbete dele é
   * permitido: a guarda é por nome de seção, não pela palavra "mapa".
   */
  test('names no address map in either dictionary', async () => {
    const [ptLocale, enLocale] = await Promise.all([
      readModuleFile('locales/fleet.locale.json'),
      readModuleFile('locales/fleet.en.locale.json'),
    ])

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      const sections = Object.keys(dictionary)
      expect(sections.filter((key) => key.includes('addressMap'))).toEqual([])
      expect(sections.filter((key) => key.includes('Map'))).toEqual(['regionMap'])
    }
  })
})
