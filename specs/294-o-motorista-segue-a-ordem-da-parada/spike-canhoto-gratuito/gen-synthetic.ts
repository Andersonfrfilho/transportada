/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
// Negativos sintéticos: corpo de DANFE sem o canhoto e documentos impressos quaisquer. Texto inventado.
import sharp from 'sharp'

const outDir = process.argv[2] as string
let seed = 7
const rand = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)] as T
const digits = (n: number): string =>
  Array.from({ length: n }, () => Math.floor(rand() * 10)).join('')

const DANFE_LABELS = [
  'DANFE',
  'DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA',
  '0 - ENTRADA  1 - SAÍDA',
  `Nº ${digits(3)}.${digits(3)}.${digits(3)}`,
  `SÉRIE ${digits(1)}`,
  'CHAVE DE ACESSO',
  'NATUREZA DA OPERAÇÃO',
  'VENDA DE MERCADORIA',
  'PROTOCOLO DE AUTORIZAÇÃO DE USO',
  'INSCRIÇÃO ESTADUAL',
  'CNPJ',
  'DESTINATÁRIO / REMETENTE',
  'NOME / RAZÃO SOCIAL',
  'ENDEREÇO',
  'BAIRRO / DISTRITO',
  'MUNICÍPIO',
  'DATA DA EMISSÃO',
  'CÁLCULO DO IMPOSTO',
  'BASE DE CÁLCULO DO ICMS',
  'VALOR DO ICMS',
  'VALOR TOTAL DOS PRODUTOS',
  'TRANSPORTADOR / VOLUMES TRANSPORTADOS',
  'FRETE POR CONTA',
  'DADOS DOS PRODUTOS / SERVIÇOS',
  'CÓDIGO',
  'DESCRIÇÃO DO PRODUTO',
  'NCM/SH',
  'CFOP',
  'QUANT.',
  'VALOR UNIT.',
  'DADOS ADICIONAIS',
]
const MISC_LINES = [
  'CUPOM FISCAL',
  'TOTAL R$',
  'OBRIGADO PELA PREFERÊNCIA',
  'RELATÓRIO MENSAL',
  'PLANILHA DE CONTROLE',
  'ATA DE REUNIÃO',
  'BOLETO BANCÁRIO',
  'LINHA DIGITÁVEL',
  'VENCIMENTO',
  'BENEFICIÁRIO',
  'ORDEM DE SERVIÇO',
  'CHECKLIST DO VEÍCULO',
  'PNEUS',
  'ÓLEO',
  'ROMANEIO DE CARGA',
  'PESO BRUTO',
]

function svgDocument(kind: 'danfe' | 'misc', width: number, height: number): string {
  const lines: string[] = []
  let y = 40
  while (y < height - 20) {
    const size = 12 + Math.floor(rand() * 14)
    const text =
      kind === 'danfe' && rand() < 0.7
        ? pick(DANFE_LABELS)
        : rand() < 0.5
          ? pick(MISC_LINES)
          : `${digits(2)}/${digits(2)}/2026  ${digits(5)}  ${digits(3)},${digits(2)}`
    lines.push(
      `<text x="${20 + Math.floor(rand() * 200)}" y="${y}" font-family="sans-serif" font-size="${size}" fill="#111">${text}</text>`,
    )
    if (rand() < 0.3)
      lines.push(
        `<rect x="10" y="${y - size - 6}" width="${width - 20}" height="${size + 14}" fill="none" stroke="#222"/>`,
      )
    y += size + 10 + Math.floor(rand() * 20)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f4f1ea"/>${lines.join('')}</svg>`
}

for (let i = 0; i < 20; i += 1) {
  const kind = i < 10 ? 'danfe' : 'misc'
  const width = 900 + Math.floor(rand() * 300)
  const height = 1200 + Math.floor(rand() * 300)
  const angle = (rand() - 0.5) * 16
  await sharp(Buffer.from(svgDocument(kind, width, height)))
    .rotate(angle, { background: pick(['#6b5b4b', '#3a3a3a', '#9a8f80']) })
    .blur(0.6 + rand())
    .modulate({ brightness: 0.8 + rand() * 0.3 })
    .jpeg({ quality: 70 })
    .toFile(`${outDir}/n${String(i).padStart(3, '0')}.jpg`)
}
console.log('synthetic 20')
