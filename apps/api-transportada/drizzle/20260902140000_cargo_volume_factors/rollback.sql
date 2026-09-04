-- Copyright (c) 2026 Ada Technology. MIT License.
-- Manual rollback only. Do not run from application startup.
-- Remove o fator de cubagem por espécie (spec 075).
--
-- ⚠️ Aqui HÁ trabalho humano a perder: o fator é conhecimento da operação, não dado público que um
-- seed refaça. A tabela do cliente dá a capacidade do veículo, não o volume da caixa — o número
-- 0,05 m³/volume saiu de quem carrega o caminhão, e não há de onde recalculá-lo. Guarde o conteúdo
-- antes de rodar isto.
--
-- O que se perde enquanto a tabela não existir: a nota volta a não ter cubagem, a ocupação da
-- viagem desaparece da tela, e o baú da spec 076 não é desenhado. Nada é declarado errado — a
-- ausência é ausência, nunca zero —, então nenhum documento fiscal muda.

DO $$
DECLARE
  deleted_migrations integer;
BEGIN
  DELETE FROM "drizzle"."__drizzle_migrations"
    WHERE "name" = '20260902140000_cargo_volume_factors';

  GET DIAGNOSTICS deleted_migrations = ROW_COUNT;
  IF deleted_migrations <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one cargo_volume_factors journal entry, removed %',
      deleted_migrations;
  END IF;
END $$;

DROP TABLE IF EXISTS "company_cargo_volume_factors";
