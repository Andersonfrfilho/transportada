/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8 (RF23): as falas do reconhecimento do canhoto, iguais no grupo e na conversa individual. O grupo
 * mostra o cliente (decisão do dono); a leitura do OCR nunca é citada.
 */
import type { OpenNote } from './whatsapp-canhoto-recognition.policy.js'

export const CANHOTO_RECOGNITION_SPEECH = {
  busy: 'Ainda espero sua resposta à pergunta anterior. Responda a ela e mande esta foto de novo.',
  cargoNoted:
    'Anotei como foto da mercadoria. Ela vale quando você disser "entreguei" da nota; mande de novo nessa hora.',
  chooseNote: (notes: readonly OpenNote[]): string =>
    [
      'De qual nota é este canhoto? Responda com o número da opção ou da nota:',
      ...notes.map((note, index) => `*${index + 1}* - ${note.label}`),
      `*${notes.length + 1}* - Descartar a foto`,
    ].join('\n'),
  confirmNote: (note: OpenNote): string =>
    [`Este canhoto é da NF ${note.documentNumber}?`, '*1* - Sim', '*2* - Não, é de outra'].join(
      '\n',
    ),
  discarded: 'Certo, descartei a foto.',
  expired: 'A pergunta sobre a foto venceu e ela foi descartada. Mande a foto de novo.',
  notUnderstood: 'Não entendi. Responda com o número da opção.',
  /** Spec 294 C2: a foto da pergunta não está mais guardada. */
  photoLost: 'Não encontrei mais a foto. Mande a foto do canhoto de novo, por favor.',
  photoKind: (prefix?: string): string =>
    [
      ...(prefix === undefined ? [] : [prefix]),
      'Essa foto não parece um canhoto assinado. É foto da mercadoria?',
      '*1* - Mercadoria',
      '*2* - É o canhoto',
      '*3* - Descartar',
    ].join('\n'),
  readerUnavailable: 'Não consegui ler a foto agora.',
  /** Spec 294 C2: a foto não foi para a nota; a pergunta segue aberta com ela. */
  storeFailed: 'Não consegui guardar a foto na nota agora. Responda de novo daqui a pouco.',
  /** Spec 294 C2: o canhoto lido direto não foi para a nota; a foto ficou guardada na pergunta. */
  storeFailedKept: 'Não consegui guardar a foto na nota agora; ela ficou guardada.',
  /** Spec 294 C2: nem a foto da pergunta guardou. */
  storeFailedResend: 'Não consegui guardar a foto. Mande de novo, por favor.',
} as const
