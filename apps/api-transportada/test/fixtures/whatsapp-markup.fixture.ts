/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A marcação do WhatsApp (`*negrito*`, `_itálico_`, `~riscado~`) de cada mensagem do bot: marcador sem par ou par
 * vazio vira lixo na tela do motorista ("** na *NF *"). Confere linha a linha, porque o WhatsApp não fecha um
 * marcador em outra linha. Link (`https://…`) fica de fora: `_` dentro de URL não é marcação.
 */
/** O til sozinho ("~14:35") não risca nada; só negrito e itálico são conferidos. */
const MARKERS = ['*', '_'] as const

export function findWhatsAppMarkupProblems(text: string): string[] {
  const problems: string[] = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/https?:\/\/\S+/gu, '')
    for (const marker of MARKERS) {
      const positions = Array.from({ length: line.length }, (_, index) => index).filter(
        (index) => line[index] === marker,
      )
      if (positions.length % 2 !== 0) {
        problems.push(`marcador ${marker} sem par em: ${rawLine}`)
        continue
      }
      for (let index = 0; index < positions.length; index += 2) {
        const content = line.slice((positions[index] ?? 0) + 1, positions[index + 1])
        if (content.trim() === '') problems.push(`par ${marker} vazio em: ${rawLine}`)
        else if (content !== content.trim()) {
          problems.push(`par ${marker} com espaço na borda em: ${rawLine}`)
        }
      }
    }
  }
  return problems
}
