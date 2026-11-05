-- Spec 295 Fase 4: quem pôs a foto de perfil (cnh|self|admin). Aditiva: coluna com default; foto existente entra como 'admin'
-- (até aqui só o escritório gravava foto; a rota própria da 295 ainda não foi publicada).
ALTER TABLE "identity_user_pictures" ADD COLUMN "origin" text DEFAULT 'admin' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_user_pictures" ADD CONSTRAINT "identity_user_pictures_origin_check" CHECK ("origin" in ('cnh', 'self', 'admin'));
