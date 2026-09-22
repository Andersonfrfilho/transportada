/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { formatMeasuredAtDate } from '@/modules/nfe-workspace/shared/packageBoxMeasurementLabel.service'
import { createPackageBoxClient } from '@/modules/nfe-workspace/shared/packageBoxClient.service'
import {
  resolvePackageBoxQueryStatus,
  resolvePackageBoxScanMatch,
  resolvePackageBoxScanSelection,
} from '@/modules/nfe-workspace/shared/packageBoxScanResolution.service'

type TestBox = Readonly<{ id: string; measuredAt: null | string }>

const PENDING_BOX: TestBox = { id: 'pending-box', measuredAt: null }
const MEASURED_BOX: TestBox = { id: 'measured-box', measuredAt: '2026-08-20T10:00:00.000Z' }

function buildFetch(body: unknown, captured?: { url?: string }) {
  return (input: RequestInfo | URL): Promise<Response> => {
    if (captured !== undefined) captured.url = input instanceof URL ? input.href : (input as string)
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }),
    )
  }
}

/**
 * Ler uma etiqueta de caixa já medida não pode abrir a edição em silêncio nem virar "não
 * encontrada" — a fila de medição (spec 085) precisa de um terceiro desfecho para decidir isso
 * antes de a tela reagir. Sem renderer de componente nesta app, a decisão vira função pura testável
 * sem DOM (mesmo molde de `packageBoxScan.ts`).
 */
describe('leitura de caixa já medida (avisa e pede conferência)', () => {
  it('nenhuma caixa casada é notFound', () => {
    expect(resolvePackageBoxScanMatch<TestBox>([])).toEqual({ kind: 'notFound' })
  })

  it('mais de uma caixa casada são candidates, mesmo com alguma já medida', () => {
    const resolution = resolvePackageBoxScanMatch([PENDING_BOX, MEASURED_BOX])
    expect(resolution).toEqual({ kind: 'candidates', candidates: [PENDING_BOX, MEASURED_BOX] })
  })

  it('uma caixa pendente casada abre a edição direto (open)', () => {
    expect(resolvePackageBoxScanMatch([PENDING_BOX])).toEqual({ kind: 'open', box: PENDING_BOX })
  })

  /** ⚠️ O comportamento que este arquivo existe para fechar: nunca `open` direto, sempre o aviso. */
  it('uma caixa já medida casada NÃO abre a edição — resolve alreadyMeasured', () => {
    expect(resolvePackageBoxScanMatch([MEASURED_BOX])).toEqual({
      box: MEASURED_BOX,
      kind: 'alreadyMeasured',
    })
  })

  it('escolher uma candidata pendente na lista abre a edição', () => {
    expect(resolvePackageBoxScanSelection(PENDING_BOX)).toEqual({ box: PENDING_BOX, kind: 'open' })
  })

  it('escolher uma candidata já medida na lista mostra o aviso, não a edição', () => {
    expect(resolvePackageBoxScanSelection(MEASURED_BOX)).toEqual({
      box: MEASURED_BOX,
      kind: 'alreadyMeasured',
    })
  })

  it('formata a data da última gravação em pt-BR (dia/mês/ano)', () => {
    expect(formatMeasuredAtDate('2026-08-20T10:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2026$/)
  })

  it('devolve a data crua se ela não for uma data válida', () => {
    expect(formatMeasuredAtDate('não é uma data')).toBe('não é uma data')
  })

  /**
   * Requisito 1: a busca da etiqueta lida usa `status: 'all'`, sem esconder caixa já medida — mesmo
   * com o filtro da listagem normal em `pending`, e sem mudar o filtro que o operador escolheu.
   */
  it('com etiqueta lida, a consulta vira status=all mesmo com o filtro em pending', () => {
    expect(resolvePackageBoxQueryStatus({ scanned: '17896004003405', status: 'pending' })).toBe(
      'all',
    )
  })

  it('com etiqueta lida, a consulta vira status=all mesmo com o filtro em measured', () => {
    expect(resolvePackageBoxQueryStatus({ scanned: '17896004003405', status: 'measured' })).toBe(
      'all',
    )
  })

  it('sem etiqueta lida, a consulta mantém o filtro escolhido pelo operador', () => {
    expect(resolvePackageBoxQueryStatus({ scanned: null, status: 'pending' })).toBe('pending')
  })

  it('a etiqueta lida chega crua ao client, com status=all', async () => {
    const captured: { url?: string } = {}
    const client = createPackageBoxClient({
      apiUrl: 'https://api.test',
      fetch: buildFetch({ data: { coveredCount: 0, items: [], totalVolumes: 0 } }, captured),
      getAccessToken: () => Promise.resolve('token'),
    })

    await client.listBoxes({ scanned: '17896004003405', status: 'all' })

    expect(captured.url).toContain('status=all')
    expect(captured.url).toContain('scanned=17896004003405')
  })
})
