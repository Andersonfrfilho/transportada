-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 237, revisão das Fases 1–2 (M1): corretiva e aditiva sobre `20261003204733_cargo_arrivals`, que
-- já está em staging e não se edita. Três CHECKs viravam NULL com coluna nula — e CHECK que dá NULL
-- deixa a linha passar: janela sem prazo (e o inverso), nota `separated` sem `separated_at`, e evento de
-- nota sem `from_state`/`to_state`. As versões novas exigem a presença antes de comparar. Nenhuma
-- coluna, índice ou outro CHECK muda.
--
-- Custo de lock: a pasta roda numa transação, então o DROP + ADD toma ACCESS EXCLUSIVE da tabela até o
-- COMMIT, e o VALIDATE varre sob esse mesmo lock (o NOT VALID só tira a varredura de dentro do ADD;
-- não solta o lock). As três tabelas são novas e pequenas. O NOT VALID + VALIDATE fica pelo molde
-- de `20261003010806` e para a linha antiga fora da forma, se houver, reprovar o deploy no VALIDATE
-- daquele CHECK, com o nome dele. `lock_timeout` aborta em 3 s em vez de enfileirar a doca atrás de
-- uma transação longa.
SET LOCAL lock_timeout = '3s';--> statement-breakpoint
ALTER TABLE "cargo_arrivals" DROP CONSTRAINT "cargo_arrivals_separation_due_at_check", ADD CONSTRAINT "cargo_arrivals_separation_due_at_check" CHECK (("separation_window_hours" is null) = ("separation_due_at" is null) and ("separation_due_at" is null or extract(epoch from "separation_due_at" - "arrived_at") = "separation_window_hours" * 3600)) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrivals" VALIDATE CONSTRAINT "cargo_arrivals_separation_due_at_check";--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" DROP CONSTRAINT "cargo_arrival_documents_state_dates_check", ADD CONSTRAINT "cargo_arrival_documents_state_dates_check" CHECK (("separation_state" = 'expected' and "received_at" is null and "separated_at" is null) or ("separation_state" = 'received' and "received_at" is not null and "separated_at" is null) or ("separation_state" = 'separated' and "received_at" is not null and "separated_at" is not null and "separated_at" >= "received_at")) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrival_documents" VALIDATE CONSTRAINT "cargo_arrival_documents_state_dates_check";--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" DROP CONSTRAINT "cargo_arrival_events_state_shape_check", ADD CONSTRAINT "cargo_arrival_events_state_shape_check" CHECK (case "kind" when 'document_added' then "from_state" is null and "to_state" is not null and "to_state" = 'expected' when 'document_received' then "from_state" is not null and "to_state" is not null and "from_state" = 'expected' and "to_state" = 'received' when 'document_separated' then "from_state" is not null and "to_state" is not null and "from_state" = 'received' and "to_state" = 'separated' else "from_state" is null and "to_state" is null end) NOT VALID;--> statement-breakpoint
ALTER TABLE "cargo_arrival_events" VALIDATE CONSTRAINT "cargo_arrival_events_state_shape_check";--> statement-breakpoint
-- A pasta roda na mesma transação das migrations seguintes: devolve o prazo ao padrão da sessão.
SET LOCAL lock_timeout = DEFAULT;
