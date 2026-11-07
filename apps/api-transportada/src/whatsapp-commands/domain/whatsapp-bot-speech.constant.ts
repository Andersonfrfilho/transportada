/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T8 (RF7) — as falas do bot de comandos do WhatsApp. Cada uma é um nó de mensagem
 * (`fala_<chave>`) do grafo raiz, editável no `FlowsWorkspace` do SDK de conversas; o texto daqui é
 * só o **padrão** publicado pelo código e o recuo quando o nó não existe no grafo vivo. Variáveis
 * entram como `{{nome}}`, e o editor as preserva como texto comum.
 */

export const BOT_SPEECH_NODE_PREFIX = 'fala_'

export const BOT_SPEECH_DEFAULTS = {
  alreadyRegistered: 'Já estava registrada.',
  deliveryRegistered: '*Entrega registrada* ✅',
  driverDirectCancelled: 'Certo, nada foi registrado.',
  driverDirectConfirm: '{{verb}} {{documents}}{{reason}}?',
  driverDirectReturnOneAtATime: 'Devolva uma nota por vez. Mande "devolvi" e o número da nota.',
  driverDocumentsNotOpen: 'Não achei estas notas abertas na sua viagem: {{numbers}}.',
  driverNoActiveTrip: 'Você não tem viagem em andamento.',
  driverNoPendingDocuments: 'Não há notas pendentes nesta viagem.',
  driverNoStopToArrive: 'Não há parada pendente para registrar a chegada.',
  driverNoStopToDepart: 'Não há parada pendente para sair.',
  driverNoStreetOccurrenceTypes:
    'Ainda não há tipos de ocorrência cadastrados para a rua. Fale com o escritório.',
  driverDirectTooManyDocuments: 'Mande até 8 notas por mensagem.',
  driverNotLinked: 'Sua conta não está ligada a um cadastro de motorista.',
  driverNotLinkedOffice:
    'Sua conta não está ligada a um cadastro de motorista. Fale com o escritório.',
  driverNoteTooLong:
    'Observação muito longa (máximo {{max}} caracteres). Digite de novo ou toque em Pular.',
  issuanceAlreadyDispatched: 'Este pedido já foi enviado.',
  issuanceConfirmReminder: 'Toque em ✅ Confirmar ou 🔙 Voltar, na lista acima.',
  issuanceDispatched: 'Enviado. Aviso quando a SEFAZ e a prefeitura responderem.',
  issuanceExpired: 'Prévia expirada.',
  issuanceFailuresHeader: 'Não saiu na criação:',
  issuanceForbidden:
    'Seu acesso não permite emitir todos os documentos desta prévia. Fale com o administrador.',
  issuanceInProgress:
    'Este pedido já está sendo enviado. Aviso quando a SEFAZ e a prefeitura responderem.',
  issuanceNothingDispatched: 'Nenhum documento saiu.',
  issuanceNothingToIssue: 'Nenhuma dessas notas pode ser emitida agora.',
  issuanceNotFound: 'Esse pedido não vale mais. Refaça a seleção.',
  issuanceRedo: 'Refaça a seleção.',
  issuanceRedoButton: '🔁 Refazer',
  issuanceSuperseded: 'As notas mudaram desde a prévia, e nada foi emitido. Confira de novo:',
  occurrenceRegistered: 'Ocorrência registrada. ⚠️',
  operatorBatchApplied: '{{applied}} de {{total}} notas atualizadas. ✅',
  operatorDispatchAlready: 'A viagem já estava despachada.',
  operatorDispatched: 'Viagem despachada. 🚚',
  operatorDocumentNotFound: 'Essa nota não está mais disponível nesta viagem.',
  operatorForceDispatchRequired: 'Esta viagem precisa de despacho forçado — use o painel.',
  operatorLoadingRegistered: 'Carregamento registrado. ✅',
  operatorNoDocumentsForAction: 'Não há notas para esta ação nesta viagem.',
  operatorNoTrips: 'Não há viagens no armazém agora.',
  operatorNoWarehouseOccurrenceTypes:
    'Ainda não há tipos de ocorrência cadastrados para o armazém. Fale com o escritório.',
  operatorNoteTooLong:
    'Observação muito longa (máximo {{max}} caracteres). Digite de novo ou toque em Pular.',
  operatorOccurrenceCancelled: 'Ocorrência cancelada — nada foi registrado.',
  operatorOccurrenceClosedKept:
    'Encerrado. A ocorrência já registrada com {{count}} foto(s) continua salva.',
  operatorOccurrenceRegistered: 'Ocorrência registrada com {{count}} foto(s). ✅',
  operatorPendingDocuments: 'Há {{count}} notas pendentes — despache pelo painel.',
  operatorPhotoAttached:
    'Foto {{position}} anexada. Envie outra, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.',
  operatorPhotoDownloadFailed: 'Não consegui baixar a foto. Envie de novo.',
  operatorPhotoKeyReused: 'Essa foto já foi processada com outros dados. Envie a foto de novo.',
  operatorPhotoLimit:
    'Limite de 5 fotos por ocorrência atingido. Ocorrência registrada com {{count}} foto(s). ✅',
  operatorPhotoMissing: 'Ainda não há foto anexada. Envie ao menos uma antes de concluir.',
  operatorPhotoReminder: 'Envie a foto, toque em ✅ Concluir ou em ❌ Cancelar ocorrência.',
  operatorPhotoTooLarge:
    'Essa foto é maior que o tamanho aceito ({{limitKiB}} KiB). Envie uma foto menor ou toque em ❌ Cancelar ocorrência.',
  operatorPhotoUnsupportedType:
    'O arquivo enviado precisa ser uma imagem (JPEG, PNG ou WEBP). Envie a foto de novo ou toque em ❌ Cancelar ocorrência.',
  operatorSeparationRegistered: 'Separação registrado. ✅',
  operatorTripNoMoreActions: 'Esta viagem não aceita mais ações por aqui.',
  operatorUnscheduledStops: 'Há paradas sem agendamento — despache pelo painel.',
  returnRegistered: '*Não entrega registrada* ↩️',
  driverDocumentNotReachable: 'Essa nota não está mais disponível na sua viagem.',
  tripUnavailable: 'Esta viagem não está mais disponível.',
  /**
   * Spec 293 T11: os eventos da entrega pela camada comum (`whatsapp-driver-events.service.ts`). As
   * `group*` são a versão do grupo do motorista: o número da nota (e o cliente nas listas de
   * escolha, spec 294 RF17), sem documento nem valor (spec 292).
   */
  arrivalRegistered: '📍 *Chegada registrada* · {{time}}',
  departureRegistered: '🚚 *Saída registrada* · {{time}}',
  stopEnRoute:
    '⚠️ *Você já está a caminho da parada {{sequence}}.*\nRegistre a chegada nela antes de sair para outra.',
  stopNotReachable: 'Essa parada não está mais disponível na viagem.',
  groupAlreadyRegistered: 'NF {{documentNumber}} já estava registrada.',
  groupDeliveryRegistered: '*NF {{documentNumber}} entregue* ✅',
  groupDeliveryStopCompleted: '*NF {{documentNumber}} entregue.* Parada concluída. ✅',
  groupDeliveryTripCompleted: '*NF {{documentNumber}} entregue.* Viagem concluída. 🏁',
  groupDocumentNotReachable: 'Essa nota não está mais disponível na viagem do motorista.',
  groupDriverWithoutAccess:
    'O motorista deste grupo ainda não tem acesso ao aplicativo, e o registro precisa ficar no nome dele. Cadastre o acesso ou registre pelo painel.',
  groupOccurrenceRegistered: 'Ocorrência registrada na NF {{documentNumber}}. ⚠️',
  groupRegisterFailed:
    'Não consegui registrar agora. Tente de novo em instantes ou registre pelo aplicativo.',
  groupReturnRegistered: '*NF {{documentNumber}} não entregue* ↩️',
} as const

export type BotSpeechKey = keyof typeof BOT_SPEECH_DEFAULTS
export type BotSpeechParams = Readonly<Record<string, string | number>>

/** O id do nó do grafo que guarda a fala: sem acento, `^[a-z0-9_]+$`. */
export function botSpeechNodeId(key: BotSpeechKey): string {
  return `${BOT_SPEECH_NODE_PREFIX}${key.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`
}
