-- Spec 299 T2.4: a rotina `driver.stop-reminder.dispatch` passa a existir no worker, então a linha que a T1.2 semeou pausada
-- pelo sistema volta a correr. Só desfaz a pausa de origem `system`: pausa de gente (`user`) nunca é sobrescrita.
UPDATE "job_schedules"
  SET "enabled" = true, "paused_at" = NULL, "paused_by" = NULL, "paused_origin" = NULL
  WHERE "job" = 'driver.stop-reminder.dispatch' AND "paused_origin" = 'system';
