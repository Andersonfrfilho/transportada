/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_FREIGHT_REGION_IMPORT_DRAFT,
  FREIGHT_REGION_IMPORT_BLOCK_REASON,
  buildFreightRegionImportSubmission,
} from '../../src/modules/fleet/shared/freightRegionImport.service'

const REGIONS_CSV = 'ROTA;REGIAO;CIDADE;UF\n1.001;Alta Mogiana;BARRETOS;SP\n'
const RATES_CSV = 'ROTA;TRUCK;TOCO\n1.001;1200,00;900,00\n'

function draft(
  overrides: Partial<typeof EMPTY_FREIGHT_REGION_IMPORT_DRAFT>,
): typeof EMPTY_FREIGHT_REGION_IMPORT_DRAFT {
  return { ...EMPTY_FREIGHT_REGION_IMPORT_DRAFT, ...overrides }
}

describe('freight region import contract', () => {
  /** A rota `strict()` recusa qualquer chave a mais: o corpo é o arquivo em duas metades, texto puro. */
  test('os dois arquivos viram {regions, rates} como texto', () => {
    const submission = buildFreightRegionImportSubmission(
      draft({
        rates: RATES_CSV,
        ratesName: 'valores.csv',
        regions: REGIONS_CSV,
        regionsName: 'rotas.csv',
      }),
    )

    expect(submission.status).toBe('ready')
    if (submission.status !== 'ready') return
    expect(submission.body).toEqual({ rates: RATES_CSV, regions: REGIONS_CSV })
    expect(Object.keys(submission.body).sort()).toEqual(['rates', 'regions'])
  })

  /** O conteúdo vai como veio: quem lê a planilha é o parser da API, e recortar aqui muda a leitura. */
  test('o texto do arquivo não é reescrito no caminho', () => {
    const padded = `\n${REGIONS_CSV}   \n`
    const submission = buildFreightRegionImportSubmission(
      draft({ rates: RATES_CSV, ratesName: 'v.csv', regions: padded, regionsName: 'r.csv' }),
    )

    expect(submission.status).toBe('ready')
    if (submission.status !== 'ready') return
    expect(submission.body.regions).toBe(padded)
  })

  /**
   * Arquivo faltando é recusa da tela, não da API: mandar meia importação gastaria uma ida ao
   * servidor para voltar 400, e o 400 genérico não diz qual das duas metades ficou de fora.
   */
  test('arquivo de rotas faltando bloqueia o envio antes do 400', () => {
    const submission = buildFreightRegionImportSubmission(
      draft({ rates: RATES_CSV, ratesName: 'valores.csv' }),
    )

    expect(submission).toEqual({
      reason: FREIGHT_REGION_IMPORT_BLOCK_REASON.REGIONS_REQUIRED,
      status: 'blocked',
    })
  })

  test('arquivo de valores faltando bloqueia o envio antes do 400', () => {
    const submission = buildFreightRegionImportSubmission(
      draft({ regions: REGIONS_CSV, regionsName: 'rotas.csv' }),
    )

    expect(submission).toEqual({
      reason: FREIGHT_REGION_IMPORT_BLOCK_REASON.RATES_REQUIRED,
      status: 'blocked',
    })
  })

  /**
   * Arquivo de rotas em branco inativaria a tabela inteira à qual os motoristas estão ligados — é o
   * mesmo `FREIGHT_REGION_IMPORT_EMPTY` que a API recusa, dito antes de sair da tela.
   */
  test('arquivo escolhido mas em branco conta como faltando', () => {
    const submission = buildFreightRegionImportSubmission(
      draft({
        rates: RATES_CSV,
        ratesName: 'valores.csv',
        regions: '  \n\r\n ',
        regionsName: 'rotas.csv',
      }),
    )

    expect(submission).toEqual({
      reason: FREIGHT_REGION_IMPORT_BLOCK_REASON.REGIONS_REQUIRED,
      status: 'blocked',
    })
  })

  test('o rascunho vazio nasce sem arquivo e sem nome', () => {
    expect(EMPTY_FREIGHT_REGION_IMPORT_DRAFT).toEqual({
      rates: '',
      ratesName: '',
      regions: '',
      regionsName: '',
    })
  })
})

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const IMPORT_KEYS = [
  'busy',
  'created',
  'deactivated',
  'failed',
  'hint',
  'rates',
  'ratesHint',
  'regions',
  'regionsHint',
  'submit',
  'summaryTitle',
  'title',
  'updated',
] as const

const IMPORT_BLOCK_KEYS = ['rates_required', 'regions_required'] as const

describe('freight region import dialog contract', () => {
  /** Diálogo, não página: a importação é um desvio da tabela, e sair dela é fechar. */
  test('a importação abre em diálogo e a lógica mora no hook', async () => {
    const dialog = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionImportDialog.component.tsx',
    )
    const hook = await readApplicationFile('src/modules/fleet/hooks/useFreightRegionImport.hook.ts')

    expect(dialog).toContain('createPortal')
    expect(dialog).toContain('useModalDialog')
    expect(dialog).toContain('role="dialog"')
    expect(dialog).toContain('useFreightRegionImport')
    expect(dialog).not.toContain('importFreightRegions')
    expect(hook).toContain('buildFreightRegionImportSubmission')
    expect(hook).toContain('importFreightRegions')
  })

  /** O resumo é o que a pessoa levou da importação: sem os três números ela não sabe o que mudou. */
  test('o resumo mostra criadas, atualizadas e inativadas', async () => {
    const dialog = await readApplicationFile(
      'src/modules/fleet/components/FreightRegionImportDialog.component.tsx',
    )

    expect(dialog).toContain('regionImport.created')
    expect(dialog).toContain('regionImport.updated')
    expect(dialog).toContain('regionImport.deactivated')
    expect(dialog).toContain('summary.created')
    expect(dialog).toContain('summary.updated')
    expect(dialog).toContain('summary.deactivated')
  })

  test('os verbetes existem nos dois idiomas', async () => {
    type ImportLocale = {
      regionImport: Record<string, unknown> & { blocked: Record<string, unknown> }
    }
    const ptBr = (await Bun.file(
      new URL('src/modules/fleet/locales/fleet.locale.json', APPLICATION_ROOT),
    ).json()) as ImportLocale
    const english = (await Bun.file(
      new URL('src/modules/fleet/locales/fleet.en.locale.json', APPLICATION_ROOT),
    ).json()) as ImportLocale

    for (const key of IMPORT_KEYS) {
      expect(typeof ptBr.regionImport[key]).toBe('string')
      expect(typeof english.regionImport[key]).toBe('string')
    }
    for (const key of IMPORT_BLOCK_KEYS) {
      expect(typeof ptBr.regionImport.blocked[key]).toBe('string')
      expect(typeof english.regionImport.blocked[key]).toBe('string')
    }
  })
})
