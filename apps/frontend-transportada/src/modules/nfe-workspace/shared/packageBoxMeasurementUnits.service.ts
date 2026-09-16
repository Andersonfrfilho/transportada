/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * ⚠️ **A tela fala centímetro, o banco guarda milímetro.** A fita métrica do galpão é marcada em
 * cm, e obrigar o conferente a multiplicar por dez de cabeça, de pé, a cada caixa, é onde nasce o
 * erro de uma ordem de grandeza — 38 virando 38 mm. A coluna continua `length_mm` porque milímetro
 * é inteiro e não perde meia unidade; a conversão mora **aqui**, num lugar só, na borda. Extraído de
 * `PackageBoxMeasurementPanel.component.tsx` (spec 152 T10) porque `PackageBoxMeasurementForm`
 * (câmera) precisa da mesma conversão.
 *
 * ⚠️ Os tetos são **cópia por valor** dos CHECKs da coluna (6000/3000/3000 mm), guardados por
 * contrato. Sem eles, digitar 900 de comprimento devolvia um `400` genérico que virava "não foi
 * possível gravar" sem dizer qual campo — e `web.md` §11 exige o erro ancorado no campo.
 */
export const MAX_CENTIMETRES = { heightMm: 300, lengthMm: 600, widthMm: 300 } as const

export const MILLIMETRES_PER_CENTIMETRE = 10

/**
 * O caminho de volta: milímetro guardado vira centímetro digitável. Sem ele o formulário abria em
 * branco sobre uma medida que existe — a mesma falha que `CargoVolumeFactorPanel` já evita —, e
 * gravar por cima devolvia `unidades por caixa` a 1 **em silêncio**.
 */
export function toCentimetres(millimetres: null | number): string {
  if (millimetres === null) return ''
  const centimetres = millimetres / MILLIMETRES_PER_CENTIMETRE
  return String(Number.isInteger(centimetres) ? centimetres : centimetres.toFixed(1)).replace(
    '.',
    ',',
  )
}

/** Aceita vírgula: o teclado do celular manda `38,5`, e meio centímetro é medida legítima. */
export function toMillimetres(value: string, field: keyof typeof MAX_CENTIMETRES): number | null {
  const centimetres = Number(value.trim().replace(',', '.'))
  if (!Number.isFinite(centimetres) || centimetres <= 0) return null
  if (centimetres > MAX_CENTIMETRES[field]) return null
  const millimetres = Math.round(centimetres * MILLIMETRES_PER_CENTIMETRE)
  return millimetres > 0 ? millimetres : null
}
