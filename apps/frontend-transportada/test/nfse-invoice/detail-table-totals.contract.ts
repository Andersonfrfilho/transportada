/**
 * Contrato das tabelas do detalhe da NFS-e. O cabeçalho da coluna de valor nascia à esquerda
 * enquanto o número ia para a direita, e a tabela terminava sem total — quem lê o detalhe procura
 * o total antes de qualquer linha. Aqui se guarda o alinhamento e o rodapé, no texto do componente
 * e do estilo, que é como as demais telas deste módulo se guardam.
 */
import { describe, expect, test } from 'bun:test'

import { deriveIssRatePercent } from '../../src/modules/nfse-invoice/shared/nfseIssRate.service'
import { sumScaledAmounts } from '../../src/modules/shared/decimalAmount.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const DIALOG_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceDetailDialog.component.tsx'
const STYLES_PATH = 'src/modules/nfse-invoice/styles/nfseInvoice.module.css'
const LOCALE_PATHS = [
  'src/modules/nfse-invoice/locales/nfseInvoice.locale.json',
  'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1
}

describe('nfse detail table alignment contract', () => {
  test('todo cabeçalho de coluna numérica é alinhado como a coluna', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    // Base de cálculo, valor do encargo e valor da nota: as três colunas de dinheiro do detalhe.
    expect(countOccurrences(dialog, 'className={styles.amountHeader} scope="col"')).toBe(3)
  })

  test('o alinhamento do cabeçalho vence o padrão à esquerda da tabela', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toMatch(/\.emissionTable\s+\.amountHeader\s*\{[^}]*text-align:\s*right;/)
  })
})

describe('nfse detail table total contract', () => {
  test('a tabela de encargos fecha com o valor gravado na nota, não com a soma da tela', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain("{t('detail.chargeTotal')}")
    expect(dialog).toContain(
      '<td className={styles.amountCell}>{formatAmount(invoice.serviceAmount)}</td>',
    )
  })

  test('a tabela de notas vinculadas fecha com a soma exata das linhas', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain("{t('detail.documentsTotal')}")
    expect(dialog).toContain(
      'sumScaledAmounts(actions.documents.map((linked) => linked.totalAmount))',
    )
  })

  test('a soma das notas é decimal exata: o total do detalhe não passa por binário', () => {
    expect(sumScaledAmounts(['1392.3200', '4242.6100', '858.7600'])).toBe('6493.6900')
  })

  test('as duas tabelas terminam num rodapé, e o total mora na coluna do valor', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(countOccurrences(dialog, '<tfoot>')).toBe(2)
    expect(countOccurrences(dialog, '<th colSpan={2} scope="row">')).toBe(2)
  })

  test('o rodapé se separa das linhas em vez de virar mais uma delas', async () => {
    const styles = await readApplicationFile(STYLES_PATH)

    expect(styles).toMatch(/tfoot th\s*\{[^}]*border-top:/)
    expect(styles).toMatch(/tfoot th\s*\{[^}]*border-bottom:\s*none;/)
  })

  test('os dois rótulos de total existem nos dois idiomas', async () => {
    const locales = await Promise.all(LOCALE_PATHS.map(readApplicationFile))

    for (const locale of locales) {
      expect(locale).toContain('"chargeTotal"')
      expect(locale).toContain('"documentsTotal"')
    }
  })
})

describe('nfse detail iss charge contract', () => {
  test('o ISS é linha da tabela de encargos, com base no valor do serviço', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('<td>{issChargeLabel}</td>')
    expect(dialog).toContain(
      '<td className={styles.amountCell}>{formatAmount(invoice.issAmount)}</td>',
    )
  })

  test('a alíquota do rótulo sai dos valores congelados na nota, não do perfil', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(dialog).toContain('deriveIssRatePercent(invoice)')
    expect(dialog).not.toContain('profile.issRate')
  })

  test('a alíquota é derivada com exatidão decimal e sem casa sobrando', () => {
    expect(deriveIssRatePercent({ issAmount: '32.4700', serviceAmount: '649.3700' })).toBe('5')
    expect(deriveIssRatePercent({ issAmount: '29.2200', serviceAmount: '649.3700' })).toBe('4,5')
    expect(deriveIssRatePercent({ issAmount: '13.0000', serviceAmount: '649.3700' })).toBe('2')
  })

  test('serviço zerado não inventa alíquota: o rótulo cai para o ISS sem percentual', async () => {
    const dialog = await readApplicationFile(DIALOG_PATH)

    expect(deriveIssRatePercent({ issAmount: '0.0000', serviceAmount: '0.0000' })).toBeNull()
    expect(dialog).toContain("t('detail.issCharge')")
  })

  test('os dois rótulos de ISS existem nos dois idiomas, com a alíquota interpolada', async () => {
    const locales = await Promise.all(LOCALE_PATHS.map(readApplicationFile))

    for (const locale of locales) {
      expect(locale).toContain('"issCharge"')
      expect(locale).toContain('ISS ({{rate}}%)')
    }
  })
})
