/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: as frases da entrega em preparo, do grupo e da conversa individual. As perguntas citam só o
 * número da nota; o "Confirma a entrega?" traz o resumo completo (nota e o que foi colhido), como o da
 * ocorrência — esconder cliente e endereço no grupo nunca foi decisão do dono (só o log fica sem PII).
 */
import type { ReceivedBy } from '../../database/trip.schema.js'
import {
  DELIVERY_PROOF_ITEM,
  type DeliveryProofItem,
  type DeliveryProofQuestion,
} from './whatsapp-delivery-proof-checklist.policy.js'
import {
  describeProofQuestion,
  type DeliveryProofQuestionView,
} from './whatsapp-delivery-proof-question.policy.js'
import {
  RECEIVED_BY_MESSAGE_OPTIONS,
  describeReceivedByInSentence,
} from './whatsapp-delivery-received-by.constant.js'
import { formatNotUnderstood } from './whatsapp-message-format.policy.js'

const SKIPPED_ITEM_WORDS: Readonly<Record<DeliveryProofItem, string>> = {
  [DELIVERY_PROOF_ITEM.cargo]: 'a foto da mercadoria',
  [DELIVERY_PROOF_ITEM.location]: 'a localização',
  [DELIVERY_PROOF_ITEM.photo]: 'a foto do canhoto',
  [DELIVERY_PROOF_ITEM.receivedBy]: 'quem recebeu',
  [DELIVERY_PROOF_ITEM.receiverName]: 'o nome',
}

export const DELIVERY_PROOF_SPEECH = {
  appOnlySignature: (documentNumber: string) =>
    `NF ${documentNumber} ainda não fechou: a assinatura de quem recebeu é obrigatória e só pode ser feita no aplicativo. Complete por lá.`,
  attachFailed:
    'Algumas fotos não entraram no comprovante. Mande de novo pelo aplicativo, por favor.',
  cancelled: (documentNumber: string) =>
    `Entrega da NF ${documentNumber} cancelada. A nota continua aberta na viagem.`,
  /** `document` (dados da nota) e `collected` (o que veio) são linhas prontas; bloco vazio some. */
  confirm: (
    documentNumber: string,
    summary: { readonly collected: readonly string[]; readonly document: readonly string[] },
  ) =>
    [
      `✅ *NF ${documentNumber} pronta para fechar.*`,
      ...summary.document,
      ...(summary.collected.length === 0 ? [] : ['', ...summary.collected]),
      '',
      '*Confirma a entrega?*',
      '*1* - Sim ✅',
      '*2* - Não ❌',
    ].join('\n'),
  confirmNotUnderstood: 'Responda 1 para confirmar a entrega ou 2 para cancelar.',
  downloadFailed: 'Não consegui baixar a foto. Mande de novo, por favor.',
  duplicatePhoto: 'Essa foto já tinha chegado.',
  nameNotUnderstood: formatNotUnderstood({
    reason: 'Escreva o nome de quem recebeu, ou responda pular se não for obrigatório.',
  }),
  noPhotoWanted: (documentNumber: string) =>
    `A NF ${documentNumber} não pede foto, então não guardei esta.`,
  photoLimit: (documentNumber: string) =>
    `A NF ${documentNumber} já tem as fotos da mercadoria que cabem no comprovante.`,
  question: (
    documentNumber: string,
    question: DeliveryProofQuestion,
    view: DeliveryProofQuestionView,
  ) => describeProofQuestion(documentNumber, question, view),
  received: {
    cargo: '✅ _Foto da mercadoria recebida._',
    location: '📍 _Localização recebida._',
    photo: '✅ _Canhoto recebido._',
    receivedBy: (receivedBy: ReceivedBy) =>
      `👍 _Anotado: ${describeReceivedByInSentence(receivedBy)}._`,
    receiverName: '👍 _Anotado: o nome de quem recebeu._',
    skipped: (item: DeliveryProofItem) => `👍 _Ok, sem ${SKIPPED_ITEM_WORDS[item]}._`,
  },
  /** "entreguei" sem número com a entrega já aberta: o bot diz qual nota e repete a pergunta pendente. */
  resumed: (documentNumber: string) => `↩️ *Continuando a entrega da NF \`${documentNumber}\`.*`,
  receivedByNotUnderstood: formatNotUnderstood({
    options: RECEIVED_BY_MESSAGE_OPTIONS,
    reason: 'Responda com o número da opção:',
  }),
  stillMissingName: 'Esse item é obrigatório para fechar a entrega.',
} as const
