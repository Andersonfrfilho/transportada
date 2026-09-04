-- A trilha de correcao humana de coordenada (spec 084, RF4). Append-only.
--
-- NAO e `geocoding_refinement_requests`: aquela registra a COMPRA de precisao fina no provedor pago
-- (spec 069) e alimenta o teto de gasto por janela. Esta registra a correcao POR GENTE — o
-- contratante que sabe onde fica a porta, o motorista que esteve la. Fundi-las faria o teto contar
-- correcao que nao custou nada.
--
-- NAO e `delivery_address_overrides`: aquele e desvio de UMA entrega, por vinculo de nota, sem valor
-- para a proxima. Esta e cadastro permanente.
--
-- Tem `company_id`, ao contrario de `geocoded_addresses`: a coordenada nao e de ninguem, mas a
-- correcao e de quem a fez.
CREATE TABLE "geocoded_address_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"address_key" text NOT NULL,
	"previous_latitude" numeric(10, 7),
	"previous_longitude" numeric(10, 7),
	"previous_source" text,
	"previous_precision" text,
	"new_latitude" numeric(10, 7) NOT NULL,
	"new_longitude" numeric(10, 7) NOT NULL,
	"new_source" text NOT NULL,
	"new_precision" text NOT NULL,
	"origin" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"requested_by" text NOT NULL DEFAULT '',
	"reason" text NOT NULL DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "companies"("id")
	ON DELETE restrict ON UPDATE cascade;

-- O ator precisa ser membro DAQUELA empresa: a FK simples aceitaria conta de outra.
ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_actor_membership_fk"
	FOREIGN KEY ("actor_user_id", "company_id")
	REFERENCES "user_company_memberships"("user_id", "company_id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_address_key_check"
	CHECK (length("address_key") > 0);

-- As quatro colunas da posicao anterior vivem e morrem juntas: coordenada sem procedencia e
-- coordenada em que ninguem confia, e procedencia sem coordenada nao diz de onde se saiu.
ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_previous_check"
	CHECK (
		("previous_latitude" IS NULL) = ("previous_longitude" IS NULL)
		AND ("previous_latitude" IS NULL) = ("previous_source" IS NULL)
		AND ("previous_latitude" IS NULL) = ("previous_precision" IS NULL)
	);

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_previous_source_check"
	CHECK ("previous_source" IS NULL OR "previous_source" IN ('manual', 'google', 'postal_code', 'city'));

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_previous_precision_check"
	CHECK ("previous_precision" IS NULL OR "previous_precision" IN ('rooftop', 'street', 'postal_code', 'city'));

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_new_source_check"
	CHECK ("new_source" IN ('manual', 'google', 'postal_code', 'city'));

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_new_precision_check"
	CHECK ("new_precision" IN ('rooftop', 'street', 'postal_code', 'city'));

-- Eixo separado de `source`: contratante, motorista e operador produzem todos `manual` na
-- coordenada, e o relatorio precisa distinguir de quem vem a informacao boa.
ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_origin_check"
	CHECK ("origin" IN ('contractor', 'driver', 'operator'));

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_previous_latitude_check"
	CHECK ("previous_latitude" IS NULL OR "previous_latitude" BETWEEN -90 AND 90);

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_previous_longitude_check"
	CHECK ("previous_longitude" IS NULL OR "previous_longitude" BETWEEN -180 AND 180);

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_new_latitude_check"
	CHECK ("new_latitude" BETWEEN -90 AND 90);

ALTER TABLE "geocoded_address_corrections"
	ADD CONSTRAINT "geocoded_address_corrections_new_longitude_check"
	CHECK ("new_longitude" BETWEEN -180 AND 180);

CREATE INDEX "geocoded_address_corrections_company_created_idx"
	ON "geocoded_address_corrections" ("company_id", "created_at");

CREATE INDEX "geocoded_address_corrections_address_key_idx"
	ON "geocoded_address_corrections" ("address_key");
