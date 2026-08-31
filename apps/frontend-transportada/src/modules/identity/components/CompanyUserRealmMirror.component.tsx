import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { ReconciliationEntry } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserRealmMirrorProps = Readonly<{
  onFillFromRealm: () => void
  disabled?: boolean
  entry?: ReconciliationEntry | undefined
}>

/**
 * O que o provedor de login sabe sobre esta pessoa, dito na tela em que se edita a ficha daqui.
 *
 * Sem isto, a comparação com o Keycloak vivia só no painel de sincronização: quem abria a edição via
 * os campos em branco e não tinha como saber que existia um e-mail do outro lado — nem por qual
 * atributo as duas contas foram casadas, que é o que separa vínculo escrito de palpite do algoritmo.
 *
 * **Não há botão de copiar o e-mail para o campo**: a rota de reconciliação mascara o endereço na
 * API, e copiar `a***@g***.com` para dentro do formulário gravaria a máscara por cima do dado bom.
 * Trazer o valor real é trabalho do servidor, e é o que o botão de preencher pede — por isso ele só
 * aparece quando a ficha daqui está ausente, que é o único caso em que aquela rota escreve.
 */
export function CompanyUserRealmMirror({
  disabled = false,
  entry,
  onFillFromRealm,
}: CompanyUserRealmMirrorProps) {
  const { t } = useTranslation('identity')

  if (entry?.realm === undefined) {
    return (
      <div className={styles.mirrorPanel}>
        <h3>{t('users.editDialog.realm.title')}</h3>
        <p className={styles.fieldHint}>{t('users.editDialog.realm.absent')}</p>
      </div>
    )
  }

  const { email, enabled, subject, username } = entry.realm

  return (
    <div className={styles.mirrorPanel}>
      <h3>{t('users.editDialog.realm.title')}</h3>
      <p className={styles.fieldHint}>{t('users.editDialog.realm.intro')}</p>
      <dl className={styles.detailGrid}>
        <div>
          <dt>{t('users.editDialog.realm.username')}</dt>
          <dd>{username || '—'}</dd>
        </div>
        <div>
          <dt>{t('users.editDialog.realm.email')}</dt>
          <dd>{email || t('users.editDialog.realm.noEmail')}</dd>
        </div>
        <div>
          <dt>{t('users.editDialog.realm.matchedBy')}</dt>
          <dd>{t(`users.sync.match.${entry.matchedBy}`)}</dd>
        </div>
        <div>
          <dt>{t('users.editDialog.realm.state')}</dt>
          <dd>
            {enabled ? t('users.editDialog.realm.enabled') : t('users.editDialog.realm.disabled')}
          </dd>
        </div>
        <div>
          <dt>{t('users.editDialog.realm.subject')}</dt>
          <dd>
            <code>{subject}</code>
          </dd>
        </div>
      </dl>
      {entry.status !== 'profile-missing' ? null : (
        <>
          <p className={styles.fieldHint}>{t('users.editDialog.realm.fillHint')}</p>
          <Button disabled={disabled} onClick={onFillFromRealm} size="sm" type="button">
            <Icon name="download" />
            {t('users.sync.fillProfile')}
          </Button>
        </>
      )}
    </div>
  )
}
