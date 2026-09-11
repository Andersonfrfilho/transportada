/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 133: **as caixas sem apoio que o juiz corrigido acha no empacotador de `85cbb5fc`**, por placa.
 *
 * ⚠️ O juiz antigo carimbava a caixa pelo centro da célula de 1 cm e sondava a 0,5 mm da face: a sonda
 * caía na célula da própria caixa, e ela se escorava em si mesma. Corrigido o juiz, a fileira do fundo
 * que o deslocamento para a porta afasta da testeira aparece solta — 15 caixas na Sprinter (vão de
 * 0,315 m) e 15 no Accelo (0,474 m), contra um giro de 0,248 m.
 *
 * Isto **não é tolerância**: é a linha de base registrada, e o contrato cobra "não piorar" em relação a
 * ela até a spec 134 (carga encostada na cabeceira) zerá-la e apagar este arquivo.
 */
export const KNOWN_UNSUPPORTED_BY_PLATE: Readonly<Record<string, number>> = {
  'RTA-2F45': 0,
  'RTC-4H67': 0,
  'RTD-5J78': 15,
  'RTE-6K89': 15,
}

export function knownUnsupportedOf(loadName: string): number {
  const plate = loadName.split(' ')[0] ?? ''
  const known = KNOWN_UNSUPPORTED_BY_PLATE[plate]
  if (known === undefined) throw new Error(`placa sem linha de base registrada: ${plate}`)

  return known
}
