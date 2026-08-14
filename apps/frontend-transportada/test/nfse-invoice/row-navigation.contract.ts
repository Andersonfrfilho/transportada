/**
 * Contrato do acesso às ações da tabela de NFS-e. A T028b entregou os botões, e ainda assim o
 * operador não conseguia agir: nove colunas de conteúdo largo dentro de um `overflow-x` com
 * `white-space: nowrap` empurram a coluna de ações para além da borda direita. Aqui se guarda o
 * caminho até ela — coluna fixa e linha que abre o detalhe —, no texto do componente e do estilo,
 * que é como as demais telas deste módulo se guardam.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const STYLES_PATH = 'src/modules/nfse-invoice/styles/nfseInvoice.module.css'
const TABLE_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceTable.component.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1
}

describe('nfse row navigation contract', () => {
  test('a célula de dado abre o detalhe da nota', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).toContain('onClick={() => table.rowActions.openDetail(invoice)}')
  })

  test('só a célula de dado carrega o clique: checkbox e ações têm controle próprio', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(countOccurrences(table, 'rowActions.openDetail(invoice)')).toBe(1)
  })

  test('a linha continua sendo linha: sem `role` de botão sobre a semântica da tabela', async () => {
    const table = await readApplicationFile(TABLE_PATH)

    expect(table).not.toContain('role="button"')
    expect(table).not.toContain('<tr onClick')
  })

  test('a célula clicável avisa que é clicável', async () => {
    const [styles, table] = await Promise.all([
      readApplicationFile(STYLES_PATH),
      readApplicationFile(TABLE_PATH),
    ])

    expect(table).toContain('className={styles.rowLink}')
    expect(styles).toMatch(/\.rowLink\s*\{[^}]*cursor:\s*pointer;/)
  })
})

describe('nfse actions column contract', () => {
  test('a coluna de ações fica fixa na borda direita da rolagem', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toMatch(/last-child\s*\{[^}]*position:\s*sticky;/)
    expect(styles).toMatch(/last-child\s*\{[^}]*right:\s*0;/)
  })

  test('a coluna fixa tem fundo opaco: o conteúdo rolando não a atravessa', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toMatch(/last-child\s*\{[^}]*background:\s*var\(--color-graphite\);/)
  })

  test('a coluna fixa se separa do conteúdo que passa por baixo', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toMatch(/last-child\s*\{[^}]*border-left:/)
  })
})
