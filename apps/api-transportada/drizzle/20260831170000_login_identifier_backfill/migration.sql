-- Copyright (c) 2026 Ada Technology. MIT License.
-- Preenche `login_identifiers` a partir das fichas que já existem.
--
-- A tabela foi criada em 20260830193604 e nunca teve escritor: a tela de login a consulta para
-- resolver quem é a pessoa a partir do que ela lembra, e a listagem lê dela os e-mails da pessoa.
-- Sem backfill, quem já estava cadastrado continuaria invisível para as duas — a projeção passa a
-- ser reconstruída a cada escrita do perfil, mas ninguém reescreve ficha antiga só por isso.
--
-- A projeção é a mesma de `login-identifier-projection.policy.ts`: e-mail é conjunto (o do perfil e
-- o do contato, quando o canal é e-mail), mais documento e telefone. Valor normalizado, porque o
-- CHECK da tabela exige `value = lower(btrim(value))`.
INSERT INTO "login_identifiers" ("user_id", "kind", "value")
SELECT "user_id", 'email', lower(btrim("email"))
  FROM "identity_user_profiles"
  WHERE length(btrim("email")) > 0
UNION
SELECT "user_id", 'email', lower(btrim("contact_address"))
  FROM "identity_user_profiles"
  WHERE "contact_channel" = 'email' AND length(btrim("contact_address")) > 0
UNION
SELECT "user_id", 'document', lower(btrim("tax_id"))
  FROM "identity_user_profiles"
  WHERE length(btrim("tax_id")) > 0
UNION
SELECT "user_id", 'phone', lower(btrim("phone"))
  FROM "identity_user_profiles"
  WHERE length(btrim("phone")) > 0
ON CONFLICT ON CONSTRAINT "login_identifiers_user_kind_value_unique" DO NOTHING;
