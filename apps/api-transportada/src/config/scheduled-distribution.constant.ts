/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A cadência real do cron mora no `cronSchedule` de `deploy/cron/railway.json`, numa app que a
 * API não importa. O padrão é copiado dali de propósito, e `scheduled-distribution-window.contract`
 * lê o arquivo para falhar se as duas pontas divergirem.
 *
 * O tique é mais fino que a janela de uma hora da SEFAZ de propósito: a janela corre do lado dela,
 * a partir do instante em que nos serviu, e um tique de hora cheia só reencontrava a permissão na
 * hora seguinte. Ciclo fora da janela é no-op — a elegibilidade recusa por `cooldown_active` antes
 * de criar importação.
 */
export const DEFAULT_SCHEDULED_DISTRIBUTION_CRON = '*/15 * * * *'
