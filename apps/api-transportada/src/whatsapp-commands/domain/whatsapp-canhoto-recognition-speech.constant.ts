/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.8 (RF23): as falas do reconhecimento do canhoto, iguais no grupo e na conversa individual. O grupo
 * mostra o cliente (decisão do dono); a leitura do OCR nunca é citada.
 */
import type { OpenNote } from './whatsapp-canhoto-recognition.policy.js'
import {
  DISCARDED_TEXT,
  formatNextStep,
  formatNotUnderstood,
  formatOptions,
  formatReplyHint,
  type MessageOption,
} from './whatsapp-message-format.policy.js'

const CONFIRM_OPTIONS: readonly MessageOption[] = [
  { action: 'Sim, é dessa nota', icon: '✅' },
  { action: 'Não, é de outra', icon: '🔄' },
]

const PHOTO_KIND_OPTIONS: readonly MessageOption[] = [
  { action: 'Foto da mercadoria', icon: '📦' },
  { action: 'É o canhoto, sim', icon: '🧾' },
  { action: 'Descartar', icon: '🗑️' },
]

const CHOOSE_REASON = 'Não achei essa nota na lista.'
const OPTION_REASON = 'Responda com o número da opção:'

/** O cliente e a cidade da nota em citação; nota sem cliente guardado (pergunta antiga) fica sem a linha. */
function describeNoteQuote(note: OpenNote): string[] {
  if (note.clientName === undefined || note.clientName === '') return []
  const city = note.city === undefined || note.city === '' ? '' : ` · ${note.city}`
  return [`> 🏪 ${note.clientName}${city}`]
}

function describeNoteOptions(notes: readonly OpenNote[]): MessageOption[] {
  return [
    ...notes.map((note) => ({
      action: [
        `NF \`${note.documentNumber}\``,
        note.clientName ? `*${note.clientName}*` : undefined,
        note.city,
      ]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      icon: '🧾',
    })),
    { action: 'Descartar a foto', icon: '🗑️' },
  ]
}

export const CANHOTO_RECOGNITION_SPEECH = {
  busy: '⏳ *Ainda espero sua resposta.*\nResponda à pergunta anterior e mande esta foto de novo.',
  cargoNoted: [
    '📦 *Anotei como foto da mercadoria.*',
    formatNextStep('ela entra quando você mandar *entreguei* da nota.'),
  ].join('\n'),
  chooseNote: (notes: readonly OpenNote[]): string =>
    [
      '📸 *De qual nota é este canhoto?*',
      '',
      formatOptions(describeNoteOptions(notes)),
      '',
      formatReplyHint('Responda com o número da opção ou da nota.'),
    ].join('\n'),
  confirmNote: (note: OpenNote): string =>
    [
      `📸 *Este canhoto é da NF \`${note.documentNumber}\`?*`,
      ...describeNoteQuote(note),
      '',
      formatOptions(CONFIRM_OPTIONS),
    ].join('\n'),
  discarded: DISCARDED_TEXT,
  /** Spec 321 T4: o canhoto retido chegou pela coleta; quem fecha é a conferência do escritório. */
  pickupCollected: (documentNumber: string): string =>
    [
      `🧾 *Recebi o canhoto da NF \`${documentNumber}\`.*`,
      formatNextStep('o escritório confere e a coleta fica concluída.'),
    ].join('\n'),
  expired:
    '⏳ *A pergunta sobre a foto venceu.*\nA foto foi descartada. Mande a foto do canhoto de novo.',
  /** O "não entendi" repete as opções da pergunta aberta, por tipo. */
  notUnderstood: {
    choose_note: (notes: readonly OpenNote[]): string =>
      formatNotUnderstood({ options: describeNoteOptions(notes), reason: CHOOSE_REASON }),
    confirm_note: (): string =>
      formatNotUnderstood({ options: CONFIRM_OPTIONS, reason: OPTION_REASON }),
    photo_kind: (): string =>
      formatNotUnderstood({ options: PHOTO_KIND_OPTIONS, reason: OPTION_REASON }),
  },
  /** Spec 294 C2: a foto da pergunta não está mais guardada. */
  photoLost: '⚠️ *Não encontrei mais a foto.*\nMande a foto do canhoto de novo, por favor.',
  photoKind: (prefix?: string): string =>
    [
      ...(prefix === undefined ? [] : [prefix, '']),
      '🤔 *Essa foto não parece um canhoto assinado.*',
      'O que é?',
      '',
      formatOptions(PHOTO_KIND_OPTIONS),
    ].join('\n'),
  readerUnavailable: '⚠️ *Não consegui ler a foto agora.*',
  /** Spec 294 C2: a foto não foi para a nota; a pergunta segue aberta com ela. */
  storeFailed: '⚠️ *Não consegui guardar a foto na nota agora.*\nResponda de novo daqui a pouco.',
  /** Spec 294 C2: o canhoto lido direto não foi para a nota; a foto ficou guardada na pergunta. */
  storeFailedKept: '⚠️ *Não consegui guardar a foto na nota agora.* Ela ficou guardada.',
  /** Spec 294 C2: nem a foto da pergunta guardou. */
  storeFailedResend: '⚠️ *Não consegui guardar a foto.*\nMande de novo, por favor.',
} as const
