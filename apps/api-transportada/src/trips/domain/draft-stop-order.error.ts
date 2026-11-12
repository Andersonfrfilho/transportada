/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323: a matriz que chegou ao ordenador não cobre as paradas. É defeito de quem montou a matriz (o serviço), nunca
 * dado do usuário: o ordenador recusa em vez de inventar uma ordem.
 */
export class DraftStopOrderMatrixMismatchError extends Error {
  public constructor(detail: string) {
    super(`The road cost matrix does not cover the draft stops: ${detail}.`)
    this.name = 'DraftStopOrderMatrixMismatchError'
  }
}
