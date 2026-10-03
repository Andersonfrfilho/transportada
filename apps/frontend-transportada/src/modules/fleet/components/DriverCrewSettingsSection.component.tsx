import { useCrewSettings } from '../hooks/useCrewSettings.hook'
import type { CrewSettingsClient } from '../shared/crewSettingsClient.service'
import { DriverCrewSettingsPanel } from './DriverCrewSettingsPanel.component'

type DriverCrewSettingsSectionProps = Readonly<{
  canManage: boolean
  canRead: boolean
  isActive: boolean
  client?: CrewSettingsClient
  companyId?: string
}>

/** Spec 243 D2: a permissão é a da API (`fleet.read` lê, `fleet.manage` grava) e a consulta só sobe na aba dela. */
export function DriverCrewSettingsSection(props: DriverCrewSettingsSectionProps) {
  const crewSettings = useCrewSettings({
    ...(props.client === undefined ? {} : { client: props.client }),
    ...(props.companyId === undefined ? {} : { companyId: props.companyId }),
    enabled: props.canRead && props.isActive,
  })
  const saveError = crewSettings.saveMutation.error

  if (!props.canRead) return null

  return (
    <DriverCrewSettingsPanel
      canManage={props.canManage}
      {...(saveError instanceof Error ? { errorCode: saveError.message } : {})}
      isSaving={crewSettings.saveMutation.isPending}
      loading={crewSettings.query.isLoading}
      saved={crewSettings.saveMutation.isSuccess}
      settings={crewSettings.query.data}
      onEdit={crewSettings.saveMutation.reset}
      onRetry={() => void crewSettings.query.refetch()}
      onSave={(helperDailyRate) => crewSettings.saveMutation.mutate(helperDailyRate)}
    />
  )
}
