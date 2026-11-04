/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T15: as frases da entrega em preparo. Valem para o grupo e para a conversa individual, então
 * **nunca levam dado do cliente**: só o número da nota e o nome do item (desenho 3.4, regra 9). O nome
 * de quem recebeu não é repetido em resposta nenhuma.
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

const SKIP_HINT = 'Se não tiver, responda "pular".'

const photos = (count: number) => (count === 1 ? '1 foto' : `${count} fotos`)

export const DELIVERY_PROOF_SPEECH = {
  appOnlySignature: (documentNumber: string) =>
    `NF ${documentNumber} ainda não fechou: a assinatura de quem recebeu é obrigatória e só pode ser feita no aplicativo. Complete por lá.`,
  attachFailed:
    'Algumas fotos não entraram no comprovante. Mande de novo pelo aplicativo, por favor.',
  cancelled: (documentNumber: string) =>
    `Entrega da NF ${documentNumber} cancelada. A nota continua aberta na viagem.`,
  confirm: (documentNumber: string, summary: readonly string[]) =>
    [
      `NF ${documentNumber} pronta para fechar${summary.length === 0 ? '' : `: ${summary.join(', ')}`}.`,
      'Confirma a entrega? Responda 1 para Sim ou 2 para Não.',
    ].join('\n'),
  confirmNotUnderstood: 'Responda 1 para confirmar a entrega ou 2 para cancelar.',
  downloadFailed: 'Não consegui baixar a foto. Mande de novo, por favor.',
  duplicatePhoto: 'Essa foto já tinha chegado.',
  missing: (documentNumber: string, missing: readonly MissingDeliveryProof[]) =>
    `NF ${documentNumber} ainda não fechou. Falta: ${missing.map(describeMissing).join(', ')}.`,
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
      return `NF ${documentNumber}: se puder, compartilhe a localização da entrega (clipe > Localização).${tail}`
    case DELIVERY_PROOF_ITEM.photo:
      return `NF ${documentNumber}: mande a foto do canhoto assinado.${tail}`
    case DELIVERY_PROOF_ITEM.cargo:
      return question.optional
        ? `NF ${documentNumber}: mande a foto da mercadoria entregue.${tail}`
        : `NF ${documentNumber}: mande ${photos(question.remaining)} da mercadoria entregue.`
    case DELIVERY_PROOF_ITEM.receivedBy:
      return [
        `NF ${documentNumber}: quem recebeu? Responda com o número.${tail}`,
        ...RECEIVED_BY_OPTIONS.map(
          (option, index) => `${index + 1}. ${RECEIVED_BY_LABELS[option]}`,
        ),
      ].join('\n')
    case DELIVERY_PROOF_ITEM.receiverName:
      return `NF ${documentNumber}: qual o nome de quem recebeu?${tail}`
  }
}
