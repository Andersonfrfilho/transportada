/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import {
  buildOccurrenceEmailTemplateOptions,
  type OccurrenceEmailTemplatesState,
} from '@/modules/trip/shared/occurrenceTemplate.service'
import { useEmailTemplatesQuery } from '@/modules/notification/queries/useEmailTemplates.query'
import { useOccurrenceAttachmentOverridesBatchQuery } from '@/modules/trip/queries/useOccurrenceAttachmentOverridesBatch.query'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import styles from '@/modules/trip/styles/trip.module.css'

import { useOccurrenceExceptionPeople } from '../hooks/useOccurrenceExceptionPeople.hook'
import type { OccurrenceTypeSaveInput } from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeCreateForm } from './OccurrenceTypeCreateForm.component'
import { OccurrenceTypeList } from './OccurrenceTypeList.component'

function toLoadStatus(query: Readonly<{ isError: boolean; isSuccess: boolean }>) {
  if (query.isError) return 'error' as const
  return query.isSuccess ? ('ready' as const) : ('loading' as const)
}

export type OccurrenceTypeCatalogPanelProps = Readonly<{
  canManage: boolean
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  /** Spec 241: a recusa da última gravação, já traduzida em chave de `trip.feedback`. */
  saveFeedbackKey: null | string
  types: readonly OccurrenceType[]
}>

/**
 * Spec 079, hoje a aba Tipos de `/ocorrencias` (spec 246): esta tela é o **cadastro** do
 * catálogo (nome, etapa, interruptor de aviso, modelo de e-mail), não uma tela de avisos — morar em
 * Viagens → "Avisos" escondia o cadastro atrás do nome do efeito colateral dele.
 *
 * ⚠️ **O texto do aviso não é digitado aqui.** O template mora no módulo de notificações, e o tipo
 * só **seleciona** qual modelo usar — quem escreve o texto (e os marcadores dele) é o editor de
 * templates. Linha antiga com assunto/corpo próprios continua funcionando, marcada como legado.
 *
 * ⚠️ **O grupo é escolhido no cadastro**, e não é enfeite: `separation` é do galpão (`trip.manage`)
 * e `delivery` é da rua (`trip.report`). É ele que decide quem registra, e por isso o campo é
 * obrigatório — um padrão escondido daria permissão por omissão.
 *
 * ⚠️ **O padrão é não avisar.** Aviso que ninguém pediu vira ruído, e ruído faz o operador ignorar
 * também o que importa.
 */
export function OccurrenceTypeCatalogPanel({
  canManage,
  isSaving,
  onSave,
  saveFeedbackKey,
  types,
}: OccurrenceTypeCatalogPanelProps) {
  const { t } = useTranslation('companySettings')
  const { t: tTrip } = useTranslation('trip')
  const hasItemsModeSupport = types.some((type) => type.itemsMode !== undefined)

  /** Spec 246 RF11c: uma consulta de exceções por tela, e uma de contratantes e de clientes — nunca por tipo. */
  const overridesQuery = useOccurrenceAttachmentOverridesBatchQuery({ enabled: canManage })
  const people = useOccurrenceExceptionPeople({ enabled: canManage })

  function exceptionsOf(type: OccurrenceType): OccurrenceTypeExceptionsState {
    if (overridesQuery.isError) return { overrides: undefined, people, status: 'error' }
    if (!overridesQuery.isSuccess) return { overrides: undefined, people, status: 'loading' }
    const found = overridesQuery.data.find((entry) => entry.occurrenceTypeId === type.id)
    return {
      overrides: found ?? { contractorOverrides: [], recipientOverrides: [] },
      people,
      status: 'ready',
    }
  }

  const emailTemplates = useEmailTemplatesQuery({ enabled: canManage })
  const templates: OccurrenceEmailTemplatesState = {
    options: buildOccurrenceEmailTemplateOptions(emailTemplates.data ?? []),
    status: toLoadStatus(emailTemplates),
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('occurrenceTypeCatalog.title')}</h3>
      <p className={styles.hint}>{t('occurrenceTypeCatalog.hint')}</p>

      {types.length === 0 ? (
        <p className={styles.hint}>{t('occurrenceTypeCatalog.empty')}</p>
      ) : null}

      {saveFeedbackKey === null ? null : (
        <p className={styles.alert} role="alert">
          {tTrip(`feedback.${saveFeedbackKey}`)}
        </p>
      )}

      <OccurrenceTypeList
        canManage={canManage}
        exceptionsOf={exceptionsOf}
        isSaving={isSaving}
        onSave={onSave}
        templates={templates}
        types={types}
      />

      {canManage ? (
        <OccurrenceTypeCreateForm
          hasItemsModeSupport={hasItemsModeSupport}
          isSaving={isSaving}
          onSave={onSave}
          templateOptions={templates.options}
        />
      ) : null}
    </section>
  )
}
