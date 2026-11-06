/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: as frases da entrega em preparo, do grupo e da conversa individual. As perguntas citam só o
 * número da nota; o "Confirma a entrega?" traz o resumo completo (nota e o que foi colhido), como o da
 * ocorrência — esconder cliente e endereço no grupo nunca foi decisão do dono (só o log fica sem PII).
 */
import { RECEIVED_BY_OPTIONS, type ReceivedBy } from '../../database/trip.schema.js'
import {
  DELIVERY_PROOF_ITEM,
  type DeliveryProofQuestion,
  type MissingDeliveryProof,
} from './whatsapp-delivery-proof-checklist.policy.js'

/** A ordem é a do seletor do app (`RECEIVED_BY_OPTIONS`); o número da resposta é a posição. */
export const RECEIVED_BY_LABELS: Readonly<Record<ReceivedBy, string>> = {
  child: 'Filho ou filha',
  doorman: 'Porteiro',
  employee: 'Funcionário do local',
  neighbor: 'Vizinho',
  other: 'Outra pessoa',
  other_relative: 'Outro parente',
  parent: 'Pai ou mãe',
  recipient: 'O próprio destinatário',
  sibling: 'Irmão ou irmã',
  spouse: 'Cônjuge',
}

const SKIP_HINT = '_Se não tiver, responda pular._'

const photos = (count: number) => (count === 1 ? '1 foto' : `${count} fotos`)

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
  missing: (documentNumber: string, missing: readonly MissingDeliveryProof[]) =>
    `⚠️ *NF ${documentNumber} ainda não fechou.* Falta: ${missing.map(describeMissing).join(', ')}.`,
  nameNotUnderstood: 'Digite o nome de quem recebeu (ou "pular", se não for obrigatório).',
  noPhotoWanted: (documentNumber: string) =>
    `A NF ${documentNumber} não pede foto, então não guardei esta.`,
  photoLimit: (documentNumber: string) =>
    `A NF ${documentNumber} já tem as fotos da mercadoria que cabem no comprovante.`,
  question: (documentNumber: string, question: DeliveryProofQuestion) =>
    describeQuestion(documentNumber, question),
  received: {
    cargo: 'Foto da mercadoria recebida.',
    location: 'Localização recebida.',
    photo: 'Foto do canhoto recebida.',
    receivedBy: 'Anotado quem recebeu.',
    receiverName: 'Anotado o nome de quem recebeu.',
    skipped: 'Ok, sem esse item.',
  },
  /** "entreguei" sem número com a entrega já aberta: o bot diz qual nota e repete a pergunta pendente. */
  resumed: (documentNumber: string) => `↩️ *Continuando a entrega da NF ${documentNumber}.*`,
  receivedByNotUnderstood: 'Responda com o número da lista de quem recebeu.',
  stillMissingName: 'Esse item é obrigatório para fechar a entrega.',
} as const

function describeMissing(missing: MissingDeliveryProof): string {
  switch (missing.item) {
    case DELIVERY_PROOF_ITEM.photo:
      return 'foto do canhoto'
    case DELIVERY_PROOF_ITEM.cargo:
      return `${photos(missing.remaining)} da mercadoria`
    case DELIVERY_PROOF_ITEM.receivedBy:
      return 'quem recebeu'
    case DELIVERY_PROOF_ITEM.receiverName:
      return 'nome de quem recebeu'
  }
}

function describeQuestion(documentNumber: string, question: DeliveryProofQuestion): string {
  const tail = question.optional ? ` ${SKIP_HINT}` : ''
  switch (question.item) {
    case DELIVERY_PROOF_ITEM.location:
      return `📍 *NF ${documentNumber}:* se puder, compartilhe a localização da entrega (clipe 📎 → Localização).${tail}`
    case DELIVERY_PROOF_ITEM.photo:
      return `📸 *NF ${documentNumber}:* mande a foto do canhoto assinado.${tail}`
    case DELIVERY_PROOF_ITEM.cargo:
      return question.optional
        ? `📦 *NF ${documentNumber}:* mande a foto da mercadoria entregue.${tail}`
        : `📦 *NF ${documentNumber}:* mande ${photos(question.remaining)} da mercadoria entregue.`
    case DELIVERY_PROOF_ITEM.receivedBy:
      return [
        `👤 *NF ${documentNumber}:* quem recebeu? _Responda com o número._${tail}`,
        ...RECEIVED_BY_OPTIONS.map(
          (option, index) => `*${index + 1}* - ${RECEIVED_BY_LABELS[option]}`,
        ),
      ].join('\n')
    case DELIVERY_PROOF_ITEM.receiverName:
      return `✍️ *NF ${documentNumber}:* qual o nome de quem recebeu?${tail}`
  }
}
