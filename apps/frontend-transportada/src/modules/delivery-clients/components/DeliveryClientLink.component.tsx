/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import {
  buildDeliveryClientSearchRoute,
  navigateToDeliveryClientSearch,
} from '../shared/deliveryClientLink.service'

type DeliveryClientLinkProps = Readonly<{ className?: string | undefined; clientName: string }>

export function DeliveryClientLink({ className, clientName }: DeliveryClientLinkProps) {
  const { t } = useTranslation('deliveryClients')

  return (
    <a
      className={className}
      href={buildDeliveryClientSearchRoute(clientName)}
      onClick={(event) => {
        event.preventDefault()
        navigateToDeliveryClientSearch({ clientName, navigator: createBrowserWorkspaceNavigator() })
      }}
    >
      {t('clientLink.label')}
    </a>
  )
}
