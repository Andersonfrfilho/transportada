import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { ReconciliationEntry } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserRealmMirrorProps = Readonly<{
  onAdoptRealmFields: () => void
  onFillFromRealm: () => void
  canReveal?: boolean
  disabled?: boolean
  entry?: ReconciliationEntry | undefined
  isRevealing?: boolean
  onReveal?: () => void
  /** O valor cru vindo do provedor. `undefined` é "ainda não pedido"; vazio é "lá não tem". */
  revealedEmail?: string | undefined
}>

/**
 * O que o provedor de login sabe sobre esta pessoa, dito na tela em que se edita a ficha daqui.
 *
 * Sem isto, a comparação com o Keycloak vivia só no painel de sincronização: quem abria a edição via
 * os campos em branco e não tinha como saber que existia um e-mail do outro lado — nem por qual
 * atributo as duas contas foram casadas, que é o que separa vínculo escrito de palpite do algoritmo.
 *
 * O e-mail chega **mascarado da API**, e o olho o revela como na listagem: revelar é ação com
 * trilha de auditoria, então o valor cru só sai do servidor quando alguém pede — e sai pelo mesmo
 * `users.reveal` que revela o resto. Sem a permissão o olho não aparece, em vez de aparecer
 * desabilitado prometendo o que não vai entregar.
 *
 * **Não há botão de copiar o e-mail para o campo**: copiar `a***@g***.com` para dentro do
 * formulário gravaria a máscara por cima do dado bom. Trazer o valor real é trabalho do servidor, e
 * é o que o botão de preencher pede — por isso ele só aparece quando a ficha daqui está ausente,
 * que é o único caso em que aquela rota escreve.
 */
export function CompanyUserRealmMirror({
  canReveal = false,
  disabled = false,
  entry,
  isRevealing = false,
  onAdoptRealmFields,
  onFillFromRealm,
  onReveal,
  revealedEmail,
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
          <dd>
            <span className={styles.secretRow}>
              <span>{(revealedEmail ?? email) || t('users.editDialog.realm.noEmail')}</span>
              {!canReveal ||
              email === '' ||
              revealedEmail !== undefined ||
              onReveal === undefined ? null : (
                <Button
                  aria-label={t('users.editDialog.realm.reveal')}
                  disabled={isRevealing}
                  onClick={onReveal}
                  size="sm"
                  title={t('users.editDialog.realm.reveal')}
                  type="button"
                  variant="ghost"
                >
                  <Icon name="eye" />
                </Button>
              )}
            </span>
          </dd>
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
      {/**
       * A divergência é dita **aqui**, e não só no painel de comparação: quem abre a edição vê os
       * dois endereços um abaixo do outro e não tem como saber qual deles autentica. Mostrar os
       * valores lado a lado sem dizer que discordam é deixar a conclusão por conta de quem lê.
       */}
      {entry.differences.length === 0 ? null : (
        <>
          <p className={styles.feedback} role="status">
            {t('users.editDialog.realm.diverged', {
              fields: entry.differences.map((field) => t(`users.sync.field.${field}`)).join(', '),
            })}
          </p>
          <Button disabled={disabled} onClick={onAdoptRealmFields} size="sm" type="button">
            <Icon name="download" />
            {t('users.sync.adopt')}
          </Button>
        </>
      )}
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
