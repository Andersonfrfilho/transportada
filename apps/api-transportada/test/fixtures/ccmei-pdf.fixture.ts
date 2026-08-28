/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * CCMEI sintético com camada de texto **de verdade**: prova bytes → fragmento → geometria → campo.
 * Nenhum documento real entra no repositório (§ Privacidade da 048).
 */
type Placement = Readonly<{ size?: number; text: string; x: number; y: number }>

function buildTextPdf(placements: readonly Placement[]): Uint8Array {
  const content = placements
    .map(
      (placement) =>
        `BT /F1 ${placement.size ?? 8} Tf 1 0 0 1 ${placement.x} ${placement.y} Tm (${placement.text}) Tj ET`,
    )
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

  const bytes = new Uint8Array(pdf.length)
  for (let index = 0; index < pdf.length; index += 1) bytes[index] = pdf.charCodeAt(index) & 0xff
  return bytes
}

export function buildSyntheticCcmeiPdf(overrides: Readonly<{ title?: string }> = {}): Uint8Array {
  const title = overrides.title ?? 'Certificado da Condicao de Microempreendedor Individual'
  return buildTextPdf([
    { size: 14, text: title, x: 60, y: 790 },
    { text: 'CNPJ', x: 60, y: 700 },
    { text: '30.213.061/0001-06', x: 62, y: 686 },
    { text: 'Data de Inicio de Atividades', x: 300, y: 700 },
    { text: '17/04/2018', x: 302, y: 686 },
  ])
}
