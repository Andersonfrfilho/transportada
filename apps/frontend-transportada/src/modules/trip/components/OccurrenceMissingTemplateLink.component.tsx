/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { navigateToTripOccurrenceTypes } from '@/modules/trip/shared/tripOccurrenceRoute.service'

/** Spec 269 RF6 / 271: o caminho de quem vê "Tipo sem modelo de notificação" até o editor do tipo, onde o modelo é escolhido. */
export function OccurrenceMissingTemplateLink() {
  const { t } = useTranslation('trip')

  return (
    <Button
      onClick={() => navigateToTripOccurrenceTypes(createBrowserWorkspaceNavigator())}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon name="edit" />
      {t('occurrenceFeed.missingTemplate.open')}
    </Button>
  )
}
