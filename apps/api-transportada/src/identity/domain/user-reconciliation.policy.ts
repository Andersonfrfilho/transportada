/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O produto e o Keycloak guardam a mesma pessoa em dois lugares, e nada garante que os dois lados
 * concordem: conta criada antes do vínculo existir, pessoa apagada de um lado só, convite que
 * morreu no meio. Esta é a regra que diz quem é quem — e ela é pura de propósito: casar identidade
 * é a parte que precisa de teste, não a que precisa de rede.
 */

export const RECONCILIATION_STATUS = {
  /** Existe nos dois lados. */
  LINKED: 'linked',
  /** Existe só no Keycloak — ninguém aqui responde por ela. */
  MISSING_LOCALLY: 'missing-locally',
  /** Existe só aqui — quem tem membership não consegue entrar. */
  MISSING_IN_REALM: 'missing-in-realm',
} as const
export type ReconciliationStatus =
  (typeof RECONCILIATION_STATUS)[keyof typeof RECONCILIATION_STATUS]

/**
 * A ordem é a da confiança, não a do gosto:
 *
 * - `subject` é identidade — unique em `external_identities`, gravado quando o produto criou a
 *   conta;
 * - **documento vem antes de e-mail**, e não o contrário: a pessoa tem um documento só e pode ter
 *   vários e-mails. Casar por e-mail primeiro faria a mesma pessoa aparecer duas vezes quando os
 *   dois lados guardam endereços diferentes, e faria um alias casar com quem não é;
 * - e-mail é o último degrau, para quem ainda não tem documento cadastrado de nenhum dos lados.
 *
 * ⚠️ Hoje o realm **não guarda documento** — o gateway só escreve `company_id` —, então o degrau do
 * meio não acha ninguém até o produto passar a gravar `tax_id` como atributo do usuário, com
 * backfill de quem já existe. Enquanto isso, o casamento cai no e-mail, com as ambiguidades acima.
 */
export const RECONCILIATION_MATCH = {
  EMAIL: 'email',
  NONE: 'none',
  SUBJECT: 'subject',
  TAX_ID: 'tax-id',
} as const
export type ReconciliationMatch = (typeof RECONCILIATION_MATCH)[keyof typeof RECONCILIATION_MATCH]

export type LocalIdentityRecord = {
  /**
   * O canal do convite e o endereço dele. O convite grava o e-mail aqui, **não** em `email` — que
   * fica vazio na maioria das contas —, então casar só por `email` não acha praticamente ninguém.
   */
  readonly contactAddress: string
  readonly contactChannel: string
  readonly email: string
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
 * O endereço de e-mail que a pessoa tem do nosso lado: o campo `email` quando existe, senão o
 * contato — que é onde o convite por e-mail o grava. Sem isto o degrau do e-mail casa quase nada.
 */
function localEmailOf(record: LocalIdentityRecord): string {
  const email = normalizeEmail(record.email)
  if (email !== '') return email
  return record.contactChannel === 'email' ? normalizeEmail(record.contactAddress) : ''
}

/** Caixa e espaço não são identidade: `Ana@X.test` e `ana@x.test` são a mesma caixa postal. */
function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/** Máscara não é identidade: o mesmo CPF entra com ponto de um lado e sem do outro. */
function normalizeTaxIdKey(value: string): string {
  return value.replace(/\D/gu, '')
}

/**
 * Chave em branco não casa com chave em branco. Duas pessoas sem CPF cadastrado não são a mesma
 * pessoa, e tratá-las como uma esconderia uma delas da tela para sempre.
 */
function indexBy(
  records: readonly RealmIdentityRecord[],
  keyOf: (record: RealmIdentityRecord) => string,
): ReadonlyMap<string, RealmIdentityRecord> {
  const index = new Map<string, RealmIdentityRecord>()
  for (const record of records) {
    const key = keyOf(record)
    if (key === '') continue
    // O primeiro vence: chave repetida no realm é anomalia do realm, não escolha nossa.
    if (!index.has(key)) index.set(key, record)
  }
  return index
}

export function reconcileIdentities({
  local,
  realm,
}: ReconcileIdentitiesInput): readonly ReconciliationEntry[] {
  const bySubject = indexBy(realm, (record) => record.subject)
  const byEmail = indexBy(realm, (record) => normalizeEmail(record.email))
  const byTaxId = indexBy(realm, (record) => normalizeTaxIdKey(record.taxId))

  const claimed = new Set<string>()
  const entries: ReconciliationEntry[] = []

  for (const record of local) {
    const matched = matchLocal({ byEmail, bySubject, byTaxId, claimed, record })
    if (matched === undefined) {
      entries.push({
        local: record,
        matchedBy: RECONCILIATION_MATCH.NONE,
        status: RECONCILIATION_STATUS.MISSING_IN_REALM,
      })
      continue
    }
    claimed.add(matched.realm.subject)
    entries.push({
      local: record,
      matchedBy: matched.matchedBy,
      realm: matched.realm,
      status: RECONCILIATION_STATUS.LINKED,
    })
  }

  for (const record of realm) {
    if (claimed.has(record.subject)) continue
    entries.push({
      matchedBy: RECONCILIATION_MATCH.NONE,
      realm: record,
      status: RECONCILIATION_STATUS.MISSING_LOCALLY,
    })
  }

  return entries
}

function matchLocal({
  byEmail,
  bySubject,
  byTaxId,
  claimed,
  record,
}: Readonly<{
  byEmail: ReadonlyMap<string, RealmIdentityRecord>
  bySubject: ReadonlyMap<string, RealmIdentityRecord>
  byTaxId: ReadonlyMap<string, RealmIdentityRecord>
  claimed: ReadonlySet<string>
  record: LocalIdentityRecord
}>): { readonly matchedBy: ReconciliationMatch; readonly realm: RealmIdentityRecord } | undefined {
  const attempts = [
    { index: bySubject, key: record.subject ?? '', matchedBy: RECONCILIATION_MATCH.SUBJECT },
    {
      index: byTaxId,
      key: normalizeTaxIdKey(record.taxId),
      matchedBy: RECONCILIATION_MATCH.TAX_ID,
    },
    { index: byEmail, key: localEmailOf(record), matchedBy: RECONCILIATION_MATCH.EMAIL },
  ] as const

  for (const attempt of attempts) {
    if (attempt.key === '') continue
    const found = attempt.index.get(attempt.key)
    // Já reivindicado por outra pessoa daqui: seguir para o próximo degrau, não roubar o vínculo.
    if (found === undefined || claimed.has(found.subject)) continue
    return { matchedBy: attempt.matchedBy, realm: found }
  }

  return undefined
}
