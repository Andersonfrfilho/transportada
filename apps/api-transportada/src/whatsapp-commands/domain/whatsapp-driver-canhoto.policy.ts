/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF26: **o canhoto repetido não grava duas vezes.** A API decide (hash do conteúdo, nota que já tem outro
 * canhoto); o bot só diz o que aconteceu e pergunta o 1/2 da troca. Textos iguais no grupo e na conversa individual.
 */

/** A hora do motorista: o bot fala com transportadoras do Brasil (a mesma do cumprimento do grupo). */
const BOT_TIME_ZONE = 'America/Sao_Paulo'

const clockOf = (at: Date): string =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: BOT_TIME_ZONE,
  }).format(at)

export const CANHOTO_TEXT = {
  /** Troca recusada: o canhoto que a nota já tinha continua. */
  kept: (documentNumber: string) =>
    `Certo, descartei esta foto e mantive o canhoto da NF ${documentNumber}.`,
  /** A mesma imagem já era canhoto: nada foi gravado. */
  duplicate: (input: { readonly attachedAt: Date; readonly documentNumber?: string | undefined }) =>
    `Esse canhoto já tinha chegado${input.documentNumber === undefined ? '' : `: NF ${input.documentNumber}`}, entregue às ${clockOf(input.attachedAt)}.`,
  notUnderstood: 'Responda 1 para trocar o canhoto ou 2 para descartar a foto.',
  replaced: (documentNumber: string) =>
    `Troquei o canhoto da NF ${documentNumber}. O escritório vai conferir.`,
  /** Outra foto de nota que já tem canhoto: pergunta a troca. */
  replaceQuestion: (documentNumber: string) =>
    [
      `A NF ${documentNumber} já tem um canhoto diferente deste.`,
      '*1* - Trocar o canhoto (vai para conferência do escritório)',
      '*2* - Descartar',
    ].join('\n'),
} as const
