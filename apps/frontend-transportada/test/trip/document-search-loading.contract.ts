import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SEARCH_PATH = 'src/modules/trip/components/TripDocumentSearch.component.tsx'
const DIALOG_PATH = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'
const HOOK_PATH = 'src/modules/trip/hooks/useTripQuickCreate.hook.ts'
const WORKSPACE_PATH = 'src/modules/trip/pages/TripWorkspace.page.tsx'
const LOCALE_PATH = 'src/modules/trip/locales/trip.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/trip/locales/trip.en.locale.json'

function readSource(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

/**
 * A busca do diálogo "Nova viagem" carrega todas as notas livres da empresa — milhares delas — e
 * até agora fazia isso calada: a tabela vazia e o "0 notas encontradas" eram indistinguíveis de
 * uma empresa sem nota nenhuma, e quem monta o lote fechava a tela concluindo que não havia carga.
 */
describe('a busca de notas da viagem avisa que está carregando', () => {
  test('o carregamento é declarado por quem sabe dele, não adivinhado pela lista vazia', () => {
    expect(readSource(DIALOG_PATH)).toContain('isLoading={quickCreate.documentsQuery.isLoading}')
  })

  test('o aviso é anunciado ao leitor de tela, não só desenhado', () => {
    const source = readSource(SEARCH_PATH)

    expect(source).toContain('<span className={styles.hint} role="status">')
    expect(source).toContain("t('quickCreate.searchLoading')")
  })

  /**
   * ⚠️ A contagem é a mentira mais cara da tela: "0 notas encontradas" durante a busca é uma
   * resposta, não uma espera. Some enquanto carrega, e volta quando houver o que contar.
   */
  test('a contagem do filtro não sai antes de existir resultado', () => {
    expect(readSource(SEARCH_PATH)).toContain('{isLoading ? null : (')
  })

  test('a tabela dá lugar ao esqueleto marcado como ocupado', () => {
    const source = readSource(SEARCH_PATH)

    expect(source).toContain('<SkeletonGroup')
    expect(source).toContain("import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'")
  })

  /** Marcar "as N do filtro" durante o carregamento marcaria um filtro que ainda não terminou. */
  test('selecionar tudo do filtro só aparece com a busca concluída', () => {
    expect(readSource(SEARCH_PATH)).toContain(
      '{isOpen && !isLoading && table.totalFiltered > 0 ? (',
    )
  })

  test('o aviso tem texto nos dois idiomas do produto', () => {
    const locale = JSON.parse(readSource(LOCALE_PATH)) as {
      quickCreate: Record<string, string>
    }
    const english = JSON.parse(readSource(ENGLISH_LOCALE_PATH)) as {
      quickCreate: Record<string, string>
    }

    expect(locale.quickCreate.searchLoading).toBeString()
    expect(english.quickCreate.searchLoading).toBeString()
  })
})

/**
 * O aviso de carregamento conta a verdade, mas a espera continua inteira: ela só começava no
 * clique. Quem vai criar viagem passa o ponteiro pelo botão antes de clicar, e esse intervalo é
 * de graça.
 */
describe('a lista de notas se adianta ao clique em Nova viagem', () => {
  test('o botão adianta a busca no ponteiro e no foco do teclado', () => {
    const source = readSource(WORKSPACE_PATH)

    expect(source).toContain('onPointerEnter={quickCreate.prefetchDocuments}')
    expect(source).toContain('onFocus={quickCreate.prefetchDocuments}')
  })

  /**
   * ⚠️ A chave tem de ser a mesma que o diálogo consulta. Adiantar sob outra chave encheria o
   * cache sem encurtar espera nenhuma — e nada no tipo acusaria.
   */
  test('o adiantamento alimenta a chave que o diálogo lê', () => {
    const source = readSource(HOOK_PATH)

    expect(source).toContain('queryClient.prefetchQuery({')
    expect(source).toContain('queryKey: AVAILABLE_TRIP_DOCUMENTS_QUERY_KEY,')
    expect(source).toContain('queryFn: loadAvailableTripDocuments,')
  })

  test('o adiantamento é oferecido pelo controlador, não montado na página', () => {
    expect(readSource(HOOK_PATH)).toContain('prefetchDocuments,')
  })
})
