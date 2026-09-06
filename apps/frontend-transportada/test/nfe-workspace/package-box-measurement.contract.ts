/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createPackageBoxClient,
  packageBoxQueueFromApi,
} from '@/modules/nfe-workspace/shared/packageBoxClient.service'

const BOX = {
  cartonGtin: null,
  commercialUnit: 'CX24',
  cumulativeShare: 0.6,
  description: 'ENERG RED BULL 250ML',
  emitterTaxId: '05868574001090',
  grossWeightGrams: 10867,
  heightMm: null,
  id: '11111111-1111-4111-8111-111111111111',
  lengthMm: null,
  measuredAt: null,
  productCode: '18245',
  share: 0.6,
  transportedVolumes: 60,
  unitsPerBox: 1,
  widthMm: null,
  withinCoverage: true,
}

function buildFetch(body: unknown, captured?: { url?: string; init?: RequestInit | undefined }) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (captured !== undefined) {
      captured.url = input instanceof URL ? input.href : (input as string)
      captured.init = init
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )
  }
}

function buildClient(body: unknown, captured?: { url?: string; init?: RequestInit | undefined }) {
  return createPackageBoxClient({
    apiUrl: 'https://api.test',
    fetch: buildFetch(body, captured),
    getAccessToken: () => Promise.resolve('token'),
  })
}

describe('a fila de medição vista pelo conferente (spec 085 G005)', () => {
  it('lê a fila que a API serve', () => {
    const queue = packageBoxQueueFromApi({
      data: { coveredCount: 1, items: [BOX], totalVolumes: 100 },
    })

    expect(queue.coveredCount).toBe(1)
    expect(queue.items[0]?.productCode).toBe('18245')
  })

  /**
   * ⚠️ Corpo que não é a fila **lança**, nunca vira lista vazia: fila vazia é "não há o que medir",
   * e mostrar isso para uma resposta que não entendemos manda o conferente embora sem trabalho.
   */
  it('recusa corpo que não é a fila', () => {
    expect(() => packageBoxQueueFromApi({ data: { items: [{ id: 1 }] } })).toThrow()
    expect(() => packageBoxQueueFromApi(null)).toThrow()
  })

  /** O que o leitor bipa vai como `scanned`: quem reduz DUN-14 a GTIN-13 é a API, não a tela. */
  it('manda a etiqueta lida como scanned, sem reduzi-la aqui', async () => {
    const captured: { url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes({ scanned: '17896004003405' })

    expect(captured.url).toContain('scanned=17896004003405')
    expect(captured.url).not.toContain('7896004003405&')
  })

  /** Gravar é `PUT` na caixa: medir de novo substitui a medida, não acrescenta uma segunda. */
  it('grava a medida por PUT na própria caixa', async () => {
    const captured: { init?: RequestInit; url?: string } = {}
    await buildClient({ data: BOX }, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    expect(captured.url).toBe(`https://api.test/nfe-package-boxes/${BOX.id}`)
    expect(captured.init?.method).toBe('PUT')
  })
})

/**
 * ⚠️ Contrato por texto de fonte: esta app não tem DOM nos testes, e o ciclo bipar → medir → bipar
 * é justamente o que some quando alguém "simplifica" o painel. Sem ele o conferente toca "Ler
 * etiqueta" uma vez por caixa, com a fita na outra mão.
 */
describe('o ciclo do leitor no painel de medição', () => {
  it('reabre a câmera depois de gravar quando a caixa veio de uma leitura', async () => {
    const source = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(source).toContain('if (cameFromScan) setIsScannerOpen(true)')
    expect(source).toContain('setCameFromScan(true)')
    /** Digitar sai do modo varredura: ali a pessoa procura uma caixa, não passa uma pilha. */
    expect(source).toContain('setCameFromScan(false)')
  })
})

/**
 * ⚠️ Os tetos da medida são cópia por valor dos CHECKs da coluna. Divergir deles devolve `400`
 * genérico do servidor, que a tela não sabe ancorar em campo nenhum — o operador lê "não foi
 * possível gravar" numa ficha de três campos e não sabe qual refazer.
 */
describe('os tetos da medida na tela e no banco', () => {
  it('a tela declara os mesmos limites do CHECK da coluna', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('{ heightMm: 300, lengthMm: 600, widthMm: 300 }')
    expect(panel).toContain('aria-invalid=')
  })

  /**
   * ⚠️ **A tela fala centímetro e o banco guarda milímetro**, e é aqui que um erro de ordem de
   * grandeza entraria calado: 38 cm virando 38 mm passa em qualquer CHECK, cabe em qualquer coluna,
   * e só aparece quando a ocupação da viagem der um décimo do que deveria. A conversão mora num
   * lugar só, e é este teste que a prende ali.
   */
  it('converte centímetro em milímetro num lugar só, aceitando vírgula', async () => {
    const panel = await Bun.file(
      new URL(
        '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
        import.meta.url,
      ),
    ).text()

    expect(panel).toContain('const MILLIMETRES_PER_CENTIMETRE = 10')
    expect(panel).toContain('Math.round(centimetres * MILLIMETRES_PER_CENTIMETRE)')
    /** O teclado do celular manda `38,5`, e meio centímetro é medida legítima. */
    expect(panel).toContain("replace(',', '.')")
    /** O teto é conferido **em centímetro**, antes de multiplicar: senão 600 cm passaria. */
    expect(panel).toContain('if (centimetres > MAX_CENTIMETRES[field]) return null')
  })
})

/**
 * ⚠️ O CORS da API só admite `Authorization` em metodo sem corpo (`BODYLESS_METHODS` em
 * `cors.service.ts`). Mandar `content-type` num `GET` faz o navegador pedir
 * `authorization,content-type` no preflight e receber **403** — a fila some da tela inteira, e
 * nenhum teste desta app pega, porque preflight so existe no navegador. Medido em 06/09/2026.
 */
describe('os cabeçalhos que cada método manda', () => {
  it('a leitura da fila manda só Authorization', async () => {
    const captured: { init?: RequestInit | undefined; url?: string } = {}
    await buildClient(
      { data: { coveredCount: 0, items: [], totalVolumes: 0 } },
      captured,
    ).listBoxes()

    const headers = captured.init?.headers as Record<string, string>
    expect(Object.keys(headers)).toEqual(['authorization'])
  })

  /** A gravação tem corpo, e aí o cabeçalho descreve algo — e o método deixa de ser sem corpo. */
  it('a gravação manda Authorization e content-type', async () => {
    const captured: { init?: RequestInit | undefined; url?: string } = {}
    await buildClient(null, captured).measureBox({
      grossWeightGrams: null,
      heightMm: 200,
      id: BOX.id,
      lengthMm: 400,
      unitsPerBox: 1,
      widthMm: 300,
    })

    const headers = captured.init?.headers as Record<string, string>
    expect(Object.keys(headers).sort()).toEqual(['authorization', 'content-type'])
  })
})
