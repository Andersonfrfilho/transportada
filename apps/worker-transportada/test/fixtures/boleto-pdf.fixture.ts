/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T2: PDFs sintéticos com camada de texto de verdade, para a conferência do boleto passar pelos
 * bytes → leitor de texto → política. Nenhum boleto real entra no repositório. Mesmo arquivo na API e no
 * worker.
 */

/** Linha válida de R$ 6.561,78, impressa em grupos como o banco imprime. */
export const PRINTED_BOLETO_LINE = '34191.79001 10435.100473 91020.150008 6 96610000656178'

/** Um PDF de uma página com cada linha de texto numa altura própria (Helvetica, sem acento). */
export function buildTextLinesPdf(lines: readonly string[]): Uint8Array {
  const content = lines
    .map((line, index) => `BT /F1 10 Tf 1 0 0 1 40 ${800 - index * 20} Tm (${line}) Tj ET`)
    .join('\n')

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const crossReferenceStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceStart}\n%%EOF\n`

  return new TextEncoder().encode(pdf)
}

export function buildBoletoPdf(noteNumber: string): Uint8Array {
  return buildTextLinesPdf([
    'Banco Itau 341-7',
    PRINTED_BOLETO_LINE,
    `Numero do documento ${noteNumber}`,
    'Local de pagamento: pagavel em qualquer banco',
  ])
}

/** O DANFE da própria nota: número e valor, sem linha digitável. */
export function buildNotePdf(noteNumber: string): Uint8Array {
  return buildTextLinesPdf([
    'DANFE - Documento auxiliar da nota fiscal eletronica',
    `No ${noteNumber} Serie 1`,
    'Valor total da nota 6.561,78',
  ])
}
