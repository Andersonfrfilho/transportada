import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'
import { useDriverOptions } from '@/modules/fleet/hooks/useDriverOptions.hook'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useOccurrenceSettlementDraft } from '../hooks/useOccurrenceSettlementDraft.hook'
import { useOccurrenceDocumentProducts } from '../queries/useOccurrenceDocumentProducts.query'
import { buildDraftRowsFromSuggestion } from '../shared/occurrenceSettlementDraft.service'
import { formatOccurrenceSettlementAmount } from '../shared/occurrenceSettlementMoney.service'
import {
  buildSettlementSuggestion,
  buildSettlementSuggestionLines,
} from '../shared/occurrenceSettlementSuggestion.service'
import type {
  TripOccurrenceDetailItem,
  TripOccurrenceItemValue,
} from '../shared/tripOccurrenceFeed.service'
import styles from '../styles/trip.module.css'
import { OccurrenceSettlementRow } from './OccurrenceSettlementRow.component'
import { OccurrenceSettlementSaved } from './OccurrenceSettlementSaved.component'
import { OccurrenceSettlementSuggestion } from './OccurrenceSettlementSuggestion.component'

export type OccurrenceSettlementPanelProps = Readonly<{
  canResolve: boolean
  /** Sobe para o painel da tratativa: encerrar com rascunho não gravado perde o acerto digitado. */
  onDraftDirtyChange?: (isDirty: boolean) => void
  occurrenceId: string
  /**
   * Spec 247 T5.4 (RF12): os itens do registro e a nota onde ler o valor deles. Ausente, o acerto é o de
   * sempre — sem sugestão, tudo digitado.
   */
  suggestionSource?: Readonly<{
    companyId?: string
    /** Spec 247 T7.2: o valor pago da ocorrência inteira (escopo ocorrência); ausente ou `null` é não digitado. */
    declaredAmount?: null | string
    documentId: string
    /** Spec 247 T7.2: o que o registro copiou por linha — a sugestão parte daqui, não do preço atual da nota. */
    itemValues?: readonly TripOccurrenceItemValue[]
    items: readonly TripOccurrenceDetailItem[]
    tripId: string
  }>
}>

/**
 * Spec 164 T23 (RF22-RF25): itens do acerto — código do produto, valor (sempre digitado aqui,
 * `amountSource: 'manual'` — esta tela não tem de onde ler o `vUnCom` da nota sem um endpoint que a
 * API ainda não publica para o feed de ocorrências), quem pagou, e o total somado em `BigInt`
 * (`occurrenceSettlementMoney.service.ts`), nunca em `number`. `payerKind: 'carrier'` esconde o
 * botão de ressarcimento em vez de deixar o clique estourar 422 (critério de aceite da T23).
 *
 * Achado 2 da revisão: `GET /trip-occurrences/:id/case/settlement` traz o que já foi gravado —
 * o painel abre com o acerto existente em vez de sempre vazio. O carregamento inicial só acontece
 * uma vez por ocorrência (`loadedOccurrenceIdRef`), para não sobrescrever o que o operador está
 * digitando quando a consulta refaz depois de salvar/ressarcir.
 *
 * Revisão de design da T30:
 * - **quem pagou é escolhido pelo nome** (B3). O UUID digitado à mão gravava a dívida no motorista
 *   errado com um dígito trocado, calado. Sem `fleet.read` o campo de texto continua, mas nunca
 *   sozinho: o nome resolvido (ou o aviso de que ele não pôde ser conferido) fica ao lado;
 * - **uma grade só para o bloco** (A1), com a célula do motorista sempre presente — desabilitada
 *   quando não se aplica — e "Remover" em coluna própria, para que as linhas alinhem entre si;
 * - **rótulo visível** (A2): cabeçalho de colunas no desktop, rótulo por campo no celular;
 * - **máscara de moeda pt-BR na digitação** (A3), e linha incompleta **não some em silêncio**: ela
 *   é marcada com `aria-invalid` e mensagem, e o envio inteiro para.
 */
export function OccurrenceSettlementPanel({
  canResolve,
  onDraftDirtyChange,
  occurrenceId,
  suggestionSource,
}: OccurrenceSettlementPanelProps) {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const driverOptions = useDriverOptions({
    enabled: canResolve,
    permissions: authQuery.data?.data.permissions ?? [],
  })
  const draft = useOccurrenceSettlementDraft({ canResolve, occurrenceId, onDraftDirtyChange })
  const productsQuery = useOccurrenceDocumentProducts({
    ...(suggestionSource?.companyId === undefined ? {} : { companyId: suggestionSource.companyId }),
    documentId: suggestionSource?.documentId ?? '',
    isEnabled: canResolve && suggestionSource !== undefined,
    tripId: suggestionSource?.tripId ?? '',
  })
  const suggestion = buildSettlementSuggestion(
    buildSettlementSuggestionLines({
      items: suggestionSource?.items ?? [],
      ...(suggestionSource?.itemValues === undefined
        ? {}
        : { itemValues: suggestionSource.itemValues }),
      products: productsQuery.data ?? [],
    }),
    { occurrenceAmount: suggestionSource?.declaredAmount ?? null },
  )
  const hasSuggestion =
    suggestion.rows.length > 0 ||
    suggestion.unpaid.length > 0 ||
    suggestion.unsplitAmountCents !== null

  /** O operador confirma ao salvar: usar a sugestão só preenche as linhas, sem gravar nada. */
  function handleUseSuggestion(): void {
    draft.replaceRows(buildDraftRowsFromSuggestion(suggestion.rows))
  }

  if (!canResolve) return null

  if (draft.isLoading) {
    return (
      <div className={styles.occurrenceStage}>
        <h4 className={styles.hint}>{t('occurrenceSettlement.title')}</h4>
        <Skeleton height="2.5rem" />
      </div>
    )
  }

  return (
    <div className={styles.occurrenceStage}>
      <h4 className={styles.hint}>{t('occurrenceSettlement.title')}</h4>

      {draft.isPristine && !draft.hasSavedItems && hasSuggestion ? (
        <OccurrenceSettlementSuggestion onUse={handleUseSuggestion} suggestion={suggestion} />
      ) : null}

      <div className={styles.settlementGrid}>
        <div className={styles.settlementColumns}>
          <span>{t('occurrenceSettlement.productCode')}</span>
          <span>{t('occurrenceSettlement.amount')}</span>
          <span>{t('occurrenceSettlement.payerKind')}</span>
          <span>{t('occurrenceSettlement.payerId')}</span>
          <span />
        </div>

        {draft.rows.map((row) => (
          <OccurrenceSettlementRow
            driverOptions={driverOptions}
            isValidationShown={draft.showValidation}
            key={row.id}
            onChange={draft.updateRow}
            onRemove={draft.rows.length === 1 ? undefined : draft.removeRow}
            row={row}
          />
        ))}
      </div>

      {draft.showValidation && draft.hasInvalidRow ? (
        <p className={styles.occurrenceInvalidRows} role="alert">
          {t('occurrenceSettlement.invalidRows')}
        </p>
      ) : null}

      <div className={styles.occurrenceFormActions}>
        <Button onClick={draft.addRow} size="sm" type="button" variant="secondary">
          <Icon name="add" />
          {t('occurrenceSettlement.addRow')}
        </Button>
      </div>

      <p className={styles.hint}>
        {t('occurrenceSettlement.total')}:{' '}
        <strong>{formatOccurrenceSettlementAmount(draft.clientTotal)}</strong>
      </p>

      <div className={styles.occurrenceFormActions}>
        <Button disabled={draft.isBusy} onClick={draft.submit} size="sm" type="button">
          <Icon name="save" />
          {t('occurrenceSettlement.save')}
        </Button>
      </div>

      {draft.lastResult !== null ? (
        <OccurrenceSettlementSaved
          driverOptions={driverOptions}
          isReimbursing={draft.isReimbursing}
          onReimburse={draft.reimburse}
          settlement={draft.lastResult}
        />
      ) : null}
    </div>
  )
}
