/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A cadência real do cron mora no `cronSchedule` de `deploy/cron/railway.json`, numa app que a
 * API não importa. O padrão é copiado dali de propósito, e `scheduled-distribution-window.contract`
 * lê o arquivo para falhar se as duas pontas divergirem.
 */
export const DEFAULT_SCHEDULED_DISTRIBUTION_CRON = '0 * * * *'
