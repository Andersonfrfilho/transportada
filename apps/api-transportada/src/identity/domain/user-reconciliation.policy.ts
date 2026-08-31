/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  RECONCILIATION_MATCH,
  RECONCILIATION_STATUS,
  RECONCILIATION_VIEW_STATUS,
  reconcileIdentities as reconcileContractIdentities,
  type LocalIdentityRecord as LocalContractRecord,
  type RealmIdentityRecord as RealmContractRecord,
  type ReconciliationMatch,
  type ReconciliationStatus,
  type ReconciliationViewStatus,
} from '@adatechnology/identity-reconciliation'

/**
 * Dois conjuntos, e a diferença importa: `RECONCILIATION_STATUS` responde se as duas contas são a
 * mesma pessoa, e `RECONCILIATION_VIEW_STATUS` acrescenta o estado de leitura — casado e sem ficha
 * neste produto. O segundo nasceu aqui e foi para o pacote quando ficou claro que o caso é de todo
 * produto que federa login e tem tabela de perfil própria.
 */
export { RECONCILIATION_MATCH, RECONCILIATION_STATUS, RECONCILIATION_VIEW_STATUS }
export type { ReconciliationMatch, ReconciliationStatus, ReconciliationViewStatus }

/**
 * A regra de casar as duas bases vive em `@adatechnology/identity-reconciliation`: ela é pura e vale
 * para todo produto com login federado, e é lá que estão os testes dos degraus e do que nunca casa.
 *
 * O que sobra aqui é **a extração** — traduzir o vocabulário do TransportAdA para o contrato de
 * vínculo. É a parte que o pacote não pode saber, e a parte que erra na prática: um mapeamento que
 * olhasse só a coluna `email` entregaria conjunto vazio para quase toda conta desta instalação.
 */

export type LocalIdentityRecord = {
  /**
   * O canal do convite e o endereço dele. O convite grava o e-mail **aqui**, não em `email` — que
   * fica vazio na maioria das contas.
   */
  readonly contactAddress: string
  readonly contactChannel: string
  readonly email: string
  /**
   * Se existe linha em `identity_user_profiles`. É o quarto estado da tela: a conta existe dos dois
   * lados e ainda assim não tem nome nem contato para mostrar. Campo próprio, e não `name === ''`,
   * porque a coluna tem CHECK de não vazio — nome em branco não é perfil pobre, é perfil ausente, e
   * inferir isso do texto amarraria a tela a um detalhe que a tabela já proíbe.
   */
  readonly hasProfile: boolean
  readonly membershipId: string
  readonly name: string
  readonly subject?: string
  readonly taxId: string
  readonly userId: string
}

export type RealmIdentityRecord = {
  readonly email: string
  readonly enabled: boolean
  readonly subject: string
  readonly taxId: string
  readonly username: string
}

export type ReconciliationEntry = {
  readonly local?: LocalIdentityRecord
  readonly matchedBy: ReconciliationMatch
  readonly realm?: RealmIdentityRecord
  readonly status: ReconciliationStatus
}

export type ReconcileIdentitiesInput = {
  readonly local: readonly LocalIdentityRecord[]
  readonly realm: readonly RealmIdentityRecord[]
}

/**
 * Os endereços que a pessoa tem deste lado. São dois campos, e o contato só entra quando o canal é
 * e-mail: telefone de WhatsApp num conjunto de e-mails seria chave que nunca casa — ou, pior, que
 * casa por engano com outro telefone digitado no campo errado.
 */
function localEmailsOf(record: LocalIdentityRecord): readonly string[] {
  const contactEmail = record.contactChannel === 'email' ? record.contactAddress : ''
  return [record.email, contactEmail].filter((email) => email.trim() !== '')
}

function toLocalContract(record: LocalIdentityRecord): LocalContractRecord {
  return {
    document: record.taxId,
    emails: localEmailsOf(record),
    id: record.userId,
    ...(record.subject === undefined ? {} : { subject: record.subject }),
  }
}

/** O realm publica um e-mail só; o conjunto existe para o dia em que ele publicar mais de um. */
function toRealmContract(record: RealmIdentityRecord): RealmContractRecord {
  return {
    document: record.taxId,
    emails: record.email === '' ? [] : [record.email],
    subject: record.subject,
  }
}

/**
 * O contrato devolve o `id` e o `subject`; a tela precisa da ficha inteira. A volta é por chave, e
 * não por índice: o pacote acrescenta as contas órfãs do provedor no fim, então posição não casa.
 */
export function reconcileIdentities({
  local,
  realm,
}: ReconcileIdentitiesInput): readonly ReconciliationEntry[] {
  const localByUserId = new Map(local.map((record) => [record.userId, record]))
  const realmBySubject = new Map(realm.map((record) => [record.subject, record]))

  return reconcileContractIdentities({
    local: local.map(toLocalContract),
    realm: realm.map(toRealmContract),
  }).map((entry) => {
    const localRecord = entry.local === undefined ? undefined : localByUserId.get(entry.local.id)
    const realmRecord =
      entry.realm === undefined ? undefined : realmBySubject.get(entry.realm.subject)

    return {
      matchedBy: entry.matchedBy,
      status: entry.status,
      ...(localRecord === undefined ? {} : { local: localRecord }),
      ...(realmRecord === undefined ? {} : { realm: realmRecord }),
    }
  })
}
