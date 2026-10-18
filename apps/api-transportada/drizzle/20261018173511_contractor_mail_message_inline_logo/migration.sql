-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Spec 272 (D9): o worker sabe se anexa o logo `cid:` sem ler o HTML do e-mail. Aditiva: linhas antigas
-- ficam com `false` (nenhuma tinha logo embutido), sem backfill.
ALTER TABLE "contractor_mail_messages" ADD COLUMN "has_inline_logo" boolean DEFAULT false NOT NULL;
