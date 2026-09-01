-- Copyright (c) 2026 Ada Technology. MIT License.
-- O endereço público da foto de perfil, opaco e girado a cada troca de imagem.
--
-- Nulo nas fichas que já existem: o link nasce na primeira gravação depois desta coluna. Preencher
-- aqui criaria endereço público para foto que ninguém pediu para publicar.
ALTER TABLE "identity_user_pictures" ADD COLUMN "public_token" text;

ALTER TABLE "identity_user_pictures"
  ADD CONSTRAINT "identity_user_pictures_public_token_unique" UNIQUE ("public_token");

-- Base64url de 32 bytes: 43 caracteres. Curto demais é adivinhável por varredura.
ALTER TABLE "identity_user_pictures"
  ADD CONSTRAINT "identity_user_pictures_public_token_check"
  CHECK ("public_token" IS NULL OR "public_token" ~ '^[A-Za-z0-9_-]{43}$');
