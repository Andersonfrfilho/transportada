import { expect, test } from '@playwright/test'

import {
  buildLabelledColumns,
  buildTextPdf,
  CCMEI_TITLE_PLACEMENTS,
} from './application/ccmei-pdf.helper'

/**
 * Spec 066, T021: o arquivo é solto na tela **de verdade** e os campos chegam preenchidos. É o único
 * teste que prova o caminho inteiro — `input[type=file]` → bytes na aba → pdf.js com o worker da
 * nossa origem → mapa de rótulos → campo do formulário. Os contratos provam cada pedaço; só o
 * navegador prova que eles estão ligados.
 *
 * O CCMEI é gerado aqui, sintético: nenhum documento real entra no repositório.
 */
const CNPJ = '30.213.061/0001-06'

function buildCcmeiFile(): Buffer {
  return Buffer.from(
    buildTextPdf([
      ...CCMEI_TITLE_PLACEMENTS,
      ...buildLabelledColumns([
        { label: 'CNPJ', value: CNPJ, x: 60, y: 700 },
        { label: 'Nome Empresarial', value: 'FULANO DE TAL 12345678909', x: 300, y: 700 },
        { label: 'Data de Início de Atividades', value: '17/04/2018', x: 60, y: 620 },
        { label: 'Município', value: 'SAO PAULO', x: 300, y: 620 },
        { label: 'UF', value: 'SP', x: 460, y: 620 },
        { label: 'CEP', value: '02410-010', x: 60, y: 540 },
        { label: 'Logradouro', value: 'RUA JOAO DE LAET', x: 200, y: 540 },
        { label: 'Número', value: '724', x: 420, y: 540 },
        { label: 'Bairro', value: 'VILA AURORA', x: 480, y: 540 },
      ]),
    ]),
  )
}

test('o CCMEI solto na tela preenche a empresa sem tocar no CNPJ digitado', async ({ page }) => {
  await page.goto('/cadastro')

  await page.getByLabel('CPF ou CNPJ').fill(CNPJ)
  await expect(page.getByText('Empresa')).toBeVisible()

  await page.getByLabel('Anexar o CCMEI (opcional)').setInputFiles({
    buffer: buildCcmeiFile(),
    mimeType: 'application/pdf',
    name: 'ccmei.pdf',
  })

  await expect(page.getByLabel('Razão social')).toHaveValue('FULANO DE TAL 12345678909')
  await expect(page.getByLabel('Cidade')).toHaveValue('SAO PAULO')
  // O documento confere, não reescreve: o que a pessoa digitou continua lá.
  await expect(page.getByLabel('CPF ou CNPJ')).toHaveValue(CNPJ)
})
