/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia do fixture da API (`apps/api-transportada/test/fixtures/`): uma app não importa código de
 * outra, nem em teste.
 *
 * Spec 237, revisão de segurança da Fase 4a (S1/S4): as planilhas hostis medidas pelo revisor, cada
 * uma abaixo de 960 KiB comprimida. Montadas em memória, sem dado real.
 */
import { strToU8, zipSync } from 'fflate'

const WORKBOOK_XML =
  '<?xml version="1.0"?><workbook xmlns:r="x"><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>'
const RELS_XML =
  '<?xml version="1.0"?><Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
const EMPTY_SHARED_STRINGS = '<sst></sst>'
const INLINE_CELL = '<c t="inlineStr"><is><t>x</t></is></c>'
const NUMERIC_CELL = '<c><v>1</v></c>'

export const ATTACK_COLUMN_MAP = { routeName: 'ROTA', value: 'VALOR', weightKg: 'PESO' } as const

function buildAttackWorkbook(input: { readonly sheetData: string; readonly sst?: string }) {
  return zipSync(
    {
      'xl/_rels/workbook.xml.rels': strToU8(RELS_XML),
      'xl/sharedStrings.xml': strToU8(input.sst ?? EMPTY_SHARED_STRINGS),
      'xl/workbook.xml': strToU8(WORKBOOK_XML),
      'xl/worksheets/sheet1.xml': strToU8(
        `<worksheet><sheetData>${input.sheetData}</sheetData></worksheet>`,
      ),
    },
    { level: 9 },
  )
}

/** Uma linha só com `cellCount` células iguais, sem referência de coluna. */
export function buildSingleRowAttack(cellCount: number): Uint8Array {
  return buildAttackWorkbook({ sheetData: `<row r="1">${INLINE_CELL.repeat(cellCount)}</row>` })
}

/** `rowCount` linhas largas, `cellsPerRow` células numéricas em cada. */
export function buildWideRowsAttack(input: {
  readonly cellsPerRow: number
  readonly rowCount: number
}): Uint8Array {
  const rows: string[] = []
  for (let rowNumber = 1; rowNumber <= input.rowCount; rowNumber += 1) {
    rows.push(`<row r="${rowNumber}">${NUMERIC_CELL.repeat(input.cellsPerRow)}</row>`)
  }
  return buildAttackWorkbook({ sheetData: rows.join('') })
}

/** Cabeçalho ROTA/VALOR/PESO e `rowCount` linhas cujo VALOR e PESO apontam para um decimal enorme. */
export function buildHugeDecimalAttack(input: {
  readonly digits: number
  readonly rowCount: number
}): Uint8Array {
  const decimal = `1.${'9'.repeat(input.digits)}`
  const sst = `<sst><si><t>ROTA</t></si><si><t>VALOR</t></si><si><t>PESO</t></si><si><t>R1</t></si><si><t>${decimal}</t></si></sst>`
  const rows = [
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>',
  ]
  for (let rowNumber = 2; rowNumber <= input.rowCount + 1; rowNumber += 1) {
    rows.push(
      `<row r="${rowNumber}"><c r="A${rowNumber}" t="s"><v>3</v></c><c r="B${rowNumber}" t="s"><v>4</v></c><c r="C${rowNumber}" t="s"><v>4</v></c></row>`,
    )
  }
  return buildAttackWorkbook({ sheetData: rows.join(''), sst })
}
