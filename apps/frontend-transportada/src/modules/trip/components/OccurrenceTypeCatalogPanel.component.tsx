/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { buildOccurrenceEmailTemplateOptions } from '@/modules/trip/shared/occurrenceTemplate.service'
import { useEmailTemplatesQuery } from '@/modules/notification/queries/useEmailTemplates.query'
import { useOccurrenceAttachmentOverridesBatchQuery } from '@/modules/trip/queries/useOccurrenceAttachmentOverridesBatch.query'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import styles from '@/modules/trip/styles/trip.module.css'

import { useOccurrenceExceptionPeople } from '../hooks/useOccurrenceExceptionPeople.hook'
import type { OccurrenceTypeSaveInput } from '../shared/occurrenceTypeUpdate.service'
import { OccurrenceTypeCreateForm } from './OccurrenceTypeCreateForm.component'
import { OccurrenceTypeItem } from './OccurrenceTypeItem.component'

export type OccurrenceTypeCatalogPanelProps = Readonly<{
  canManage: boolean
  isSaving: boolean
  onSave: (input: OccurrenceTypeSaveInput) => void
  /** Spec 241: a recusa da última gravação, já traduzida em chave de `trip.feedback`. */
  saveFeedbackKey: null | string
  types: readonly OccurrenceType[]
}>

/**
 * Spec 079, movido para Configurações → "Tipos de ocorrência": esta tela é o **cadastro** do
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
  const templateOptions = buildOccurrenceEmailTemplateOptions(emailTemplates.data ?? [])

  function templateLabelOf(type: OccurrenceType): string {
    if (type.emailTemplateKey !== null) {
      const option = templateOptions.find((candidate) => candidate.key === type.emailTemplateKey)
      /** Sem a lista carregada (ou modelo desativado depois), a chave crua ainda diz qual é. */
      return option?.label ?? type.emailTemplateKey
    }
    if (type.emailSubject !== '') {
      return t('occurrenceTypeCatalog.legacyTemplate', { subject: type.emailSubject })
    }
    return t('occurrenceTypeCatalog.withoutTemplate')
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

      {[TRIP_OCCURRENCE_STAGE.separation, TRIP_OCCURRENCE_STAGE.delivery].map((group) => {
        const doGrupo = types.filter((type) => type.stage === group)
        if (doGrupo.length === 0) return null

        return (
          <fieldset className={styles.occurrenceStage} key={group}>
            <legend className={styles.hint}>
              {group === TRIP_OCCURRENCE_STAGE.separation
                ? t('occurrenceTypeCatalog.stageSeparation')
                : t('occurrenceTypeCatalog.stageDelivery')}
            </legend>
            {doGrupo.map((type) => (
              <OccurrenceTypeItem
                canManage={canManage}
                exceptions={exceptionsOf(type)}
                isSaving={isSaving}
                key={type.id}
                onSave={onSave}
                templateLabel={templateLabelOf(type)}
                type={type}
              />
            ))}
          </fieldset>
        )
      })}

      {canManage ? (
        <OccurrenceTypeCreateForm
          hasItemsModeSupport={hasItemsModeSupport}
          isSaving={isSaving}
          onSave={onSave}
          templateOptions={templateOptions}
        />
      ) : null}
    </section>
  )
}
