UPDATE "job_schedules"
  SET "interval_seconds" = 3600,
      "next_run_at" = now() + interval '1 hour'
  WHERE "job" = 'geocoding.backfill';
