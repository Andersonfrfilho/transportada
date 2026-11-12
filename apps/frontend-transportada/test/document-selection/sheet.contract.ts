/* Copyright (c) 2026 Ada Technology. MIT License. */
import { deflateRawSync } from 'node:zlib'

import { describe, expect, it } from 'bun:test'

import { selectDocumentsBySheet } from '@/modules/nfe-workspace/shared/documentSelectionBySheet.service'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import {
  readInvoiceNumbersFromWorkbook,
  WorkbookReadError,
} from '@/modules/nfe-workspace/shared/workbookInvoiceNumbers.service'

type Entry = Readonly<{ data: string; deflate: boolean; name: string }>

/** Zip mínimo, só o bastante para o leitor: cabeçalho local, diretório central e fim. */
function buildZip(entries: readonly Entry[]): Uint8Array {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const raw = Buffer.from(entry.data, 'utf8')
    const body = entry.deflate ? deflateRawSync(raw) : raw
    const name = Buffer.from(entry.name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    chunks.push(local, name, body)
    const head = Buffer.alloc(46)
    head.writeUInt32LE(0x02014b50, 0)
    head.writeUInt16LE(entry.deflate ? 8 : 0, 10)
    head.writeUInt32LE(body.length, 20)
    head.writeUInt32LE(raw.length, 24)
    head.writeUInt16LE(name.length, 28)
    head.writeUInt32LE(offset, 42)
    central.push(head, name)
    offset += local.length + name.length + body.length
  }
  const centralBytes = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...chunks, centralBytes, end]))
}

const SHARED = '<sst><si><t>DATA</t></si><si><t>DOCUMENTO1</t></si><si><t>Frete</t></si></sst>'
const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
<row r="2"><c r="A2"><v>46314</v></c><c r="B2"><v>914060</v></c><c r="C2"><v>112.65</v></c></row>
<row r="3"><c r="A3"><v>46314</v></c><c r="B3"><v>914061</v></c><c r="C3"><v>75.17</v></c></row>
<row r="4"><c r="A4"><v>46314</v></c><c r="B4"><v>914061</v></c><c r="C4"><v>1</v></c></row>
</sheetData></worksheet>`

function workbook(deflate: boolean): Uint8Array {
  return buildZip([
    { data: SHARED, deflate, name: 'xl/sharedStrings.xml' },
    { data: SHEET, deflate, name: 'xl/worksheets/sheet1.xml' },
  ])
}

function document(id: string, number: string, blocked = false): NfeDocumentListItem {
  return { cteBlockReason: blocked ? 'X' : null, id, number } as unknown as NfeDocumentListItem
}

describe('a planilha semanal escolhe as notas', () => {
  it('lê a coluna DOCUMENTO1, comprimida ou não', async () => {
    expect(await readInvoiceNumbersFromWorkbook(workbook(true))).toEqual([914060, 914061, 914061])
    expect(await readInvoiceNumbersFromWorkbook(workbook(false))).toEqual([914060, 914061, 914061])
  })

  it('recusa arquivo que não é planilha e planilha sem a coluna da nota', async () => {
    const invalido = await readInvoiceNumbersFromWorkbook(new Uint8Array([1, 2, 3])).catch(
      (error: unknown) => error,
    )
    expect(invalido).toBeInstanceOf(WorkbookReadError)
    const semColuna = buildZip([
      { data: SHARED, deflate: false, name: 'xl/sharedStrings.xml' },
      {
        data: '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>',
        deflate: false,
        name: 'xl/worksheets/sheet1.xml',
      },
    ])
    const erro = await readInvoiceNumbersFromWorkbook(semColuna).catch((error: unknown) => error)
    expect(erro).toMatchObject({ code: 'NUMBER_COLUMN_NOT_FOUND' })
  })

  it('seleciona só o que a planilha cita; ausentes e bloqueadas viram aviso', () => {
    const result = selectDocumentsBySheet({
      documents: [
        document('a', '000914060'),
        document('b', '914061', true),
        document('c', '914062'),
      ],
      isBlocked: (item) => item.cteBlockReason !== null,
      sheetNumbers: [914060, 914061, 914061, 914063],
    })

    expect(result.selectedIds).toEqual(['a'])
    expect(result.blockedNumbers).toEqual([914061])
    expect(result.missingNumbers).toEqual([914063])
    expect(result.sheetCount).toBe(3)
  })
})
