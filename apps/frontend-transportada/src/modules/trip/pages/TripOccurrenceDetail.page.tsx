/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'
import { OccurrenceConversations } from '@/modules/occurrence-conversation/components/OccurrenceConversations.component'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatStoredPhone } from '@/modules/shared/phone.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { OccurrenceCasePanel } from '../components/OccurrenceCasePanel.component'
import { OccurrenceTimelinePanel } from '../components/OccurrenceTimeline.component'
import { formatMoment, OccurrenceAttachments } from '../components/TripOccurrenceTable.component'
import { useTripOccurrenceDetailQuery } from '../queries/tripOccurrenceFeed.query'
import {
  buildOccurrenceDriverContact,
  formatOccurrenceItemQuantity,
} from '../shared/tripOccurrenceDetail.service'
import {
  formatOccurrenceInvoice,
  resolveOccurrenceTypeLabel,
  type TripOccurrenceDetail,
} from '../shared/tripOccurrenceFeed.service'
import { navigateToTripOccurrences } from '../shared/tripOccurrenceRoute.service'
import { navigateToTrip } from '../shared/tripRoute.service'
import styles from '../styles/trip.module.css'

/** A mesma permissão da lista: o detalhe não abre para quem a lista não abre (spec 183 RF1). */
const TRIP_READ_PERMISSION = 'fleet.read'
/** Spec 164 D7: validar a tratativa é `occurrences.resolve`, nunca `trip.manage`. */
const OCCURRENCE_CASE_RESOLVE_PERMISSION = 'occurrences.resolve'
/** Spec 183 T407: "Adicionar aos contatos" grava contato, e contato é configuração da empresa. */
const CONTACTS_MANAGE_PERMISSION = 'settings.manage'

function TripOccurrenceDetailSkeleton() {
  const { t } = useTranslation('trip')

  return (
    <SkeletonGroup className={styles.deck} label={t('loading')}>
      <div className={styles.panel}>
        <Skeleton variant="text" width="10rem" />
        <Skeleton height="4rem" width="100%" />
      </div>
      <div className={styles.panel}>
        <Skeleton variant="text" width="8rem" />
        <Skeleton height="6rem" width="100%" />
      </div>
    </SkeletonGroup>
  )
}

function OccurrenceTypeTitle({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('trip')
  const typeLabel = resolveOccurrenceTypeLabel(occurrence)

  return (
    <h1 className={styles.occurrenceTitle}>
      {typeLabel.labelKey === null
        ? typeLabel.value
        : t(typeLabel.labelKey, { defaultValue: typeLabel.value })}
    </h1>
  )
}

/** Quem registrou: o ator, e "em nome de" quando foi o escritório pelo motorista (spec 156). */
function OccurrenceAuthorship({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('trip')
  const channel = t(`occurrenceDetail.channel.${occurrence.channel}`, {
    defaultValue: occurrence.channel,
  })
  const actor = occurrence.actorName ?? t('occurrenceDetail.unknownActor')

  return (
    <p className={styles.intro}>
      {occurrence.onBehalfOfDriverName === null
        ? t('occurrenceDetail.recordedBy', {
            actor,
            channel,
            moment: formatMoment(occurrence.createdAt),
          })
        : t('occurrenceDetail.recordedOnBehalf', {
            actor,
            driver: occurrence.onBehalfOfDriverName,
            moment: formatMoment(occurrence.createdAt),
          })}
    </p>
  )
}

/** Spec 183 RF2: de quem é a carga, para onde ia e quanto vale. */
function OccurrenceDocumentPanel({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('trip')
  const { document } = occurrence

  return (
    <section aria-labelledby="occurrence-document-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-document-title">{t('occurrenceDetail.document.title')}</h2>
      </div>
      {document === null ? (
        <p className={styles.hint}>
          {t('occurrenceDetail.document.none', { stop: occurrence.stopLabel ?? '' })}
        </p>
      ) : (
        <dl className={styles.occurrenceFacts}>
          <div>
            <dt>{t('occurrenceDetail.document.invoice')}</dt>
            <dd>{formatOccurrenceInvoice(occurrence.invoiceNumber, occurrence.invoiceSeries)}</dd>
          </div>
          <div>
            <dt>{t('occurrenceDetail.document.contractor')}</dt>
            <dd>
              {document.contractor === null ? (
                t('occurrenceDetail.document.contractorUnknown')
              ) : (
                <>
                  {document.contractor.name}
                  {document.contractor.taxId === null ? null : (
                    <span className={styles.occurrenceFactNote}>{document.contractor.taxId}</span>
                  )}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('occurrenceDetail.document.totalValue')}</dt>
            <dd className={styles.occurrenceMoney}>{formatAmount(document.totalValue)}</dd>
          </div>
          <div className={styles.occurrenceFactWide}>
            <dt>
              {document.destination === null
                ? t('occurrenceDetail.document.destination')
                : t('occurrenceDetail.document.destinationOf', {
                    recipient: document.destination.recipientName,
                  })}
            </dt>
            <dd>
              {document.destination === null
                ? t('occurrenceDetail.document.destinationUnknown')
                : document.destination.label}
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}

/** Spec 183 P2: o contato do motorista vira ação — ligar, WhatsApp, e-mail, copiar. */
function OccurrenceDriverPanel({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('trip')
  const contact = buildOccurrenceDriverContact({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    driver: occurrence.driver,
  })
  if (contact === null || occurrence.driver === null) return null
  const { driver } = occurrence

  return (
    <section aria-labelledby="occurrence-driver-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-driver-title">{t('occurrenceDetail.driver.title')}</h2>
      </div>
      <div className={styles.occurrenceDriver}>
        {contact.pictureUrl === null ? (
          <span aria-hidden="true" className={styles.occurrenceAvatar}>
            {contact.initials}
          </span>
        ) : (
          <img
            alt={t('occurrenceDetail.driver.pictureAlt', { name: contact.name })}
            className={styles.occurrenceAvatar}
            src={contact.pictureUrl}
          />
        )}
        <dl className={styles.occurrenceFacts}>
          <div>
            <dt>{t('occurrenceDetail.driver.name')}</dt>
            <dd>{contact.name}</dd>
          </div>
          <div>
            <dt>{t('occurrenceDetail.driver.phone')}</dt>
            <dd>
              {contact.phone === ''
                ? t('occurrenceDetail.driver.none')
                : formatStoredPhone(contact.phone)}
              {contact.whatsappHref === null ? null : (
                <span className={styles.statusBadge}>{t('occurrenceDetail.driver.whatsapp')}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('occurrenceDetail.driver.email')}</dt>
            <dd>{driver.email === '' ? t('occurrenceDetail.driver.none') : driver.email}</dd>
          </div>
        </dl>
      </div>
      <div className={styles.occurrenceActions}>
        {contact.telHref === null ? null : (
          <Button asChild size="sm" variant="secondary">
            <a href={contact.telHref}>
              <Icon name="workspace-driver-trip" />
              {t('occurrenceDetail.driver.call')}
            </a>
          </Button>
        )}
        {contact.whatsappHref === null ? null : (
          <Button asChild size="sm" variant="secondary">
            <a href={contact.whatsappHref} rel="noreferrer" target="_blank">
              <Icon name="message" />
              {t('occurrenceDetail.driver.openWhatsapp')}
            </a>
          </Button>
        )}
        {contact.emailHref === null ? null : (
          <Button asChild size="sm" variant="secondary">
            <a href={contact.emailHref}>
              <Icon name="send" />
              {t('occurrenceDetail.driver.writeEmail')}
            </a>
          </Button>
        )}
        {contact.phone === '' ? null : (
          <CopyButton
            copiedLabel={t('occurrenceDetail.driver.copied')}
            label={t('occurrenceDetail.driver.copyPhone')}
            value={contact.phone}
            variant="boxed"
          />
        )}
      </div>
    </section>
  )
}

const quantityFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 })

/** Quantidade é string decimal de três casas; a tela só a mostra, nunca faz conta com ela. */
function formatQuantity(value: string): string {
  return quantityFormatter.format(Number(value))
}

/** Spec 183 T207: os itens atingidos (specs 166/172). A nota inteira não lista item nenhum. */
function OccurrenceItems({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('trip')
  if (occurrence.items.length === 0) return null

  return (
    <div>
      <h3 className={styles.occurrenceItemsTitle}>{t('occurrenceDetail.items.title')}</h3>
      <ul className={styles.occurrenceItems}>
        {occurrence.items.map((item) => {
          const quantity = formatOccurrenceItemQuantity(item, formatQuantity)
          return (
            <li key={item.code}>
              <span className={styles.occurrenceItemCode}>{item.code}</span>
              <span>
                {item.description === ''
                  ? t('occurrenceDetail.items.noDescription')
                  : item.description}
              </span>
              {quantity === '' ? null : (
                <span className={styles.occurrenceItemQuantity}>{quantity}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function OccurrenceSummaryPanel({ occurrence }: Readonly<{ occurrence: TripOccurrenceDetail }>) {
  const { t } = useTranslation('trip')

  return (
    <section aria-labelledby="occurrence-summary-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="occurrence-summary-title">{t('occurrenceDetail.summary.title')}</h2>
        <Button
          onClick={() =>
            navigateToTrip({
              navigator: createBrowserWorkspaceNavigator(),
              tripId: occurrence.tripId,
            })
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="truck" />
          {t('occurrenceDetail.summary.openTrip')}
        </Button>
      </div>
      <dl className={styles.occurrenceFacts}>
        <div>
          <dt>{t('occurrenceFeed.columns.vehiclePlate')}</dt>
          <dd>{occurrence.vehiclePlate}</dd>
        </div>
        <div>
          <dt>{t('occurrenceFeed.columns.driverName')}</dt>
          <dd>
            {occurrence.driverName === '' ? t('occurrenceDetail.noDriver') : occurrence.driverName}
          </dd>
        </div>
        <div>
          <dt>{t('occurrenceFeed.columns.stopLabel')}</dt>
          <dd>{occurrence.stopLabel ?? t('occurrenceDetail.driver.none')}</dd>
        </div>
        <div className={styles.occurrenceFactWide}>
          <dt>{t('occurrenceDetail.summary.description')}</dt>
          <dd className={styles.occurrenceDescription}>
            {occurrence.description.length === 0
              ? t('occurrenceFeed.detail.noDescription')
              : occurrence.description}
          </dd>
        </div>
      </dl>
      <OccurrenceItems occurrence={occurrence} />
      <OccurrenceAttachments item={occurrence} />
    </section>
  )
}

export function TripOccurrenceDetailPage({ occurrenceId }: Readonly<{ occurrenceId: string }>) {
  const { t } = useTranslation('trip')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const canRead = companyId !== undefined && permissions.includes(TRIP_READ_PERMISSION)
  const canResolveOccurrenceCases = permissions.includes(OCCURRENCE_CASE_RESOLVE_PERMISSION)
  const canManageContacts = permissions.includes(CONTACTS_MANAGE_PERMISSION)

  const detailQuery = useTripOccurrenceDetailQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: canRead,
    occurrenceId,
  })
  const occurrence = detailQuery.data

  return (
    <main className={styles.tripShell}>
      <nav aria-label={t('occurrenceDetail.breadcrumb')}>
        <Button
          onClick={() => navigateToTripOccurrences(createBrowserWorkspaceNavigator())}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="chevron-left" />
          {t('occurrenceDetail.back')}
        </Button>
      </nav>

      {authQuery.isLoading || detailQuery.isLoading ? <TripOccurrenceDetailSkeleton /> : null}
      {authQuery.isSuccess && !canRead ? (
        <p className={styles.hint} role="alert">
          {t('forbidden')}
        </p>
      ) : null}
      {detailQuery.isError ? (
        <p className={styles.hint} role="alert">
          {t('occurrenceDetail.notFound')}
        </p>
      ) : null}

      {occurrence === undefined ? null : (
        <>
          <header className={styles.header}>
            <p className={styles.kicker}>
              {t('occurrenceDetail.kicker', {
                stage: t(`occurrenceFeed.stage.${occurrence.stage ?? 'stop'}`),
              })}
            </p>
            <OccurrenceTypeTitle occurrence={occurrence} />
            <OccurrenceAuthorship occurrence={occurrence} />
          </header>
          <div className={styles.deck}>
            <OccurrenceSummaryPanel occurrence={occurrence} />
            <OccurrenceDocumentPanel occurrence={occurrence} />
            <OccurrenceDriverPanel occurrence={occurrence} />
            {occurrence.source === 'document' ? (
              <section aria-labelledby="occurrence-case-title" className={styles.panel}>
                <div className={styles.panelHead}>
                  <h2 id="occurrence-case-title">{t('occurrenceDetail.case.title')}</h2>
                </div>
                <OccurrenceCasePanel
                  canResolve={canResolveOccurrenceCases}
                  occurrenceCase={occurrence.case}
                  occurrenceId={occurrence.id}
                />
              </section>
            ) : null}
            <section aria-labelledby="occurrence-conversations-title" className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 id="occurrence-conversations-title">
                  {t('occurrenceDetail.conversations.title')}
                </h2>
              </div>
              <OccurrenceConversations
                canManageContacts={canManageContacts}
                canSend={canResolveOccurrenceCases}
                {...(companyId === undefined ? {} : { companyId })}
                contractorId={occurrence.document?.contractor?.contractorId ?? null}
                contractorName={occurrence.document?.contractor?.name ?? ''}
                hasDocument={occurrence.document !== null}
                occurrenceId={occurrence.id}
              />
            </section>
            <OccurrenceTimelinePanel
              {...(companyId === undefined ? {} : { companyId })}
              occurrenceId={occurrence.id}
            />
          </div>
        </>
      )}
    </main>
  )
}
