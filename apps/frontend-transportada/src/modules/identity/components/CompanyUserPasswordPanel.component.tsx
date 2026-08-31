import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { CompanyUserPasswordState } from '../hooks/useCompanyUserPassword.hook'
import { COMPANY_USER_PASSWORD_MIN_LENGTH } from '../shared/companyUsers.constant'
import styles from '../styles/userAdministration.module.css'

type CompanyUserPasswordPanelProps = Readonly<{
  password: CompanyUserPasswordState
  userId: string
  username: string
  disabled?: boolean
}>

/**
 * Definir senha é ação própria, com botão próprio: ela vai por outra rota que o resto do
 * formulário, e o "Salvar" do perfil não pode arrastá-la junto — corrigir um telefone reenviaria a
 * senha digitada, e um campo esquecido na tela viraria escrita silenciosa.
 *
 * Os dois caminhos convivem de propósito. A senha digitada aqui serve a quem está sem canal de
 * e-mail funcionando — que é justamente o caso de quem não consegue receber o link. O link serve a
 * todo o resto, e é o único dos dois em que a senha final nunca passa pela mão do administrador.
 */
export function CompanyUserPasswordPanel({
  disabled = false,
  password,
  userId,
  username,
}: CompanyUserPasswordPanelProps) {
  const { t } = useTranslation('identity')
  /** O olho é do campo, não da sessão: ele volta a esconder quando o diálogo remonta. */
  const [isVisible, setVisible] = useState(false)
  const isBusy = disabled || password.isPending

  return (
    <div className={styles.mirrorPanel}>
      <h3>{t('users.editDialog.password.title')}</h3>
      <p className={styles.fieldHint}>{t('users.editDialog.password.intro')}</p>

      <label className={styles.field}>
        <span>{t('users.editDialog.password.label')}</span>
        <span className={styles.secretRow}>
          <input
            autoComplete="new-password"
            disabled={isBusy}
            maxLength={128}
            onChange={(event) => password.setPassword(event.target.value)}
            type={isVisible ? 'text' : 'password'}
            value={password.password}
          />
          <Button
            aria-label={
              isVisible ? t('users.editDialog.password.hide') : t('users.editDialog.password.show')
            }
            onClick={() => setVisible((visible) => !visible)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name={isVisible ? 'eyeOff' : 'eye'} />
          </Button>
        </span>
        <span className={styles.fieldHint}>
          {t('users.editDialog.password.minimum', { count: COMPANY_USER_PASSWORD_MIN_LENGTH })}
        </span>
      </label>

      <Checkbox
        checked={password.temporary}
        disabled={isBusy}
        label={t('users.editDialog.password.temporary')}
        onChange={password.setTemporary}
      />
      <p className={styles.fieldHint}>{t('users.editDialog.password.temporaryHint')}</p>

      <div className={styles.panelActions}>
        <Button
          disabled={isBusy || !password.isLongEnough}
          onClick={() => void password.submit(userId)}
          type="button"
        >
          <Icon name="save" />
          {t('users.editDialog.password.save')}
        </Button>
        <Button
          disabled={isBusy || username === ''}
          onClick={() => void password.requestReset(username)}
          type="button"
          variant="ghost"
        >
          <Icon name="send" />
          {t('users.editDialog.password.sendReset')}
        </Button>
      </div>

      {password.errorCode !== undefined ? (
        <p className={styles.feedback} role="alert">
          {t(`users.errors.${password.errorCode}`, { defaultValue: t('users.errors.default') })}
        </p>
      ) : password.status === 'idle' ? null : (
        /* Sucesso não pode sair na cor do erro: `feedback` sozinha é vermelha, e "Senha definida."
         * em vermelho manda o operador procurar um defeito que não existe. */
        <p className={`${styles.feedback ?? ''} ${styles.noticeReady ?? ''}`} role="status">
          {password.status === 'saved'
            ? t('users.editDialog.password.saved')
            : t('users.editDialog.password.resetSent')}
        </p>
      )}
    </div>
  )
}
