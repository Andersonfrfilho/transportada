/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Glob } from 'bun'
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const LOCALE_PATTERN = 'src/modules/*/locales/*.locale.json'
const ENGLISH_MARK = '.en.locale.json'
const WORD_PATTERN = /[A-Za-zÀ-ÿ]+/g
const INTERPOLATION_PATTERN = /\{\{[^}]*\}\}/g

/** Palavras que em pt-BR nunca existem sem acento: encontrá-las é erro de digitação, não escolha. */
const UNACCENTED_FORMS: readonly string[] = [
  'acao',
  'acoes',
  'acrescimo',
  'acrescimos',
  'aereo',
  'apos',
  'ate',
  'atencao',
  'automatica',
  'automatico',
  'avancada',
  'avancadas',
  'avancado',
  'avancados',
  'cobranca',
  'cobrancas',
  'codigo',
  'codigos',
  'concluida',
  'concluidas',
  'concluido',
  'concluidos',
  'condicao',
  'condicoes',
  'conferencia',
  'conferencias',
  'confirmacao',
  'contem',
  'credito',
  'debito',
  'descricao',
  'descricoes',
  'disponiveis',
  'disponivel',
  'elegivel',
  'elegiveis',
  'emissao',
  'emissoes',
  'endereco',
  'enderecos',
  'exportacao',
  'geracao',
  'historico',
  'impossiveis',
  'impossivel',
  'importacao',
  'indisponiveis',
  'indisponivel',
  'inicio',
  'integracao',
  'ja',
  'maximo',
  'mes',
  'minimo',
  'modulo',
  'modulos',
  'municipio',
  'municipios',
  'nao',
  'ordenacao',
  'ordenacoes',
  'numero',
  'numeros',
  'observacao',
  'observacoes',
  'obrigatoria',
  'obrigatorio',
  'operacao',
  'operacoes',
  'orgao',
  'padrao',
  'pagina',
  'paginas',
  'pendencia',
  'pendencias',
  'periodo',
  'periodos',
  'permissao',
  'permissoes',
  'possiveis',
  'possivel',
  'proxima',
  'proximas',
  'proximo',
  'proximos',
  'razao',
  'referencia',
  'referencias',
  'relatorio',
  'relatorios',
  'saida',
  'selecao',
  'selecoes',
  'servico',
  'servicos',
  'situacao',
  'situacoes',
  'so',
  'termino',
  'titulo',
  'titulos',
  'tres',
  'ultima',
  'ultimas',
  'ultimo',
  'ultimos',
  'unica',
  'unico',
  'usuario',
  'usuarios',
  'veiculo',
  'veiculos',
  'versao',
  'versoes',
  'virgula',
  'voce',
]

const FORBIDDEN = new Set(UNACCENTED_FORMS)

function listBrazilianLocalePaths(): readonly string[] {
  const glob = new Glob(LOCALE_PATTERN)
  const paths = [...glob.scanSync({ cwd: fileURLToPath(APPLICATION_ROOT) })]
  return paths.filter((path) => !path.endsWith(ENGLISH_MARK)).sort()
}

/**
 * `{{municipio}}` é identificador de interpolação, não prosa: quem o escreve acentuado quebra a
 * substituição. A varredura de acentos olha o texto sem os marcadores.
 */
function withoutInterpolation(text: string): string {
  return text.replace(INTERPOLATION_PATTERN, ' ')
}

function collectUnaccentedWords(node: unknown, keyPath: string, found: string[]): void {
  if (typeof node === 'string') {
    for (const word of withoutInterpolation(node).match(WORD_PATTERN) ?? []) {
      if (FORBIDDEN.has(word.toLowerCase())) found.push(`${keyPath}: ${word}`)
    }
    return
  }
  if (typeof node !== 'object' || node === null) return
  for (const [key, value] of Object.entries(node)) {
    collectUnaccentedWords(value, keyPath === '' ? key : `${keyPath}.${key}`, found)
  }
}

describe('locale accents contract', () => {
  test('covers every pt-BR locale of every module', () => {
    const paths = listBrazilianLocalePaths()

    expect(paths.length).toBeGreaterThanOrEqual(10)
    expect(paths).toContain('src/modules/billing/locales/billingWorkspace.locale.json')
    expect(paths).toContain('src/modules/operations/locales/operationsWorkspace.locale.json')
    expect(paths.every((path) => !path.includes(ENGLISH_MARK))).toBe(true)
  })

  test('writes every pt-BR text with its accents', async () => {
    const paths = listBrazilianLocalePaths()
    const violations: string[] = []

    for (const path of paths) {
      const locale: unknown = await Bun.file(new URL(path, APPLICATION_ROOT)).json()
      const found: string[] = []
      collectUnaccentedWords(locale, '', found)
      for (const entry of found) violations.push(`${path} → ${entry}`)
    }

    expect(violations).toEqual([])
  })
})
