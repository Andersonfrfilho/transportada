/** Copyright (c) 2026 Ada Technology. MIT License. */
import { buildSpreadsheetLayout, type SpreadsheetLayoutInput } from './spreadsheetLayout.service'
import type { SpreadsheetLogo } from './spreadsheetLogo.service'

const LOGO_ANCHOR = { column: 1, row: 1 } as const
const LOGO_OFFSET_PIXELS = 4
const IMAGE_DPI = 96

export type BrandedSpreadsheetInput = SpreadsheetLayoutInput &
  Readonly<{ logo: SpreadsheetLogo | undefined; sheetName: string }>

/**
 * A biblioteca de planilha só carrega aqui, no clique: ela pesa e ninguém abre a aba para exportar.
 * O `.xlsx` sai com timbre, cabeçalho colorido, zebra, larguras e as linhas do topo congeladas.
 */
export async function writeBrandedSpreadsheet(input: BrandedSpreadsheetInput): Promise<Blob> {
  const layout = buildSpreadsheetLayout(input)
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const images =
    input.logo === undefined
      ? []
      : [
          {
            anchor: LOGO_ANCHOR,
            content: input.logo.content,
            contentType: input.logo.contentType,
            dpi: IMAGE_DPI,
            height: input.logo.height,
            offsetX: LOGO_OFFSET_PIXELS,
            offsetY: LOGO_OFFSET_PIXELS,
            width: input.logo.width,
          },
        ]

  return writeExcelFile(
    layout.sheetData.map((row) => [...row]),
    {
      columns: layout.columnOptions.map((column) => ({ ...column })),
      images,
      sheet: input.sheetName,
      showGridLines: false,
      stickyRowsCount: layout.headerRowNumber,
    },
  ).toBlob()
}
