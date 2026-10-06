/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DOCUMENT_ATTRIBUTE,
  FIELD_ATTRIBUTE,
  focusCargoTarget,
} from '../shared/focusCargoTarget.service'
import type { RegistrationRefusal } from '../shared/cargoReceivingRefusal.service'
import styles from '../styles/cargoReceiving.module.css'

type RegistrationRefusalSummaryProps = Readonly<{
  panelRef: RefObject<HTMLElement | null>
  refusal: RegistrationRefusal
}>

/**
 * `web.md` §11: o aviso nomeia TODOS os campos e TODAS as notas recusadas, de uma vez, e cada nome é um
 * atalho que rola até o alvo e põe o foco nele. O que a tela não conhece sai com o nome que a API usou.
 */
export function RegistrationRefusalSummary({
  panelRef,
  refusal,
}: RegistrationRefusalSummaryProps): JSX.Element | null {
  const { t } = useTranslation('cargoReceiving')

  return (
    <>
      {refusal.fields.length === 0 ? null : (
        <p className={styles.refusal} data-refusal-summary="">
          {t('refusal.lead')}{' '}
          {refusal.fields.map((item, index) => (
            <Fragment key={item.field}>
              {index === 0 ? null : ', '}
              <button
                className={styles.refusalShortcut}
                onClick={() =>
                  focusCargoTarget({
                    attribute: FIELD_ATTRIBUTE,
                    panel: panelRef.current,
                    value: item.field,
                  })
                }
                type="button"
              >
                {item.labelKey === undefined ? item.field : t(item.labelKey)}
              </button>
            </Fragment>
          ))}
          .
        </p>
      )}
      {refusal.documents.length === 0 ? null : (
        <div className={styles.refusal} data-refusal-documents="">
          <p className={styles.refusal}>{t('refusal.documentsLead')}</p>
          <ul className={styles.refusalList}>
            {refusal.documents.map((item) => (
              <li key={item.documentId}>
                <button
                  className={styles.refusalShortcut}
                  onClick={() =>
                    focusCargoTarget({
                      attribute: DOCUMENT_ATTRIBUTE,
                      panel: panelRef.current,
                      value: item.documentId,
                    })
                  }
                  type="button"
                >
                  {t('refusal.documentShortcut', { number: item.number })}
                </button>{' '}
                {t(`refusal.reasons.${item.reason}`, { defaultValue: item.reason })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
