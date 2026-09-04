-- A agenda de enderecos confirmados, por CLIENTE E LUGAR (spec 084, P5). E o que faz a correcao
-- valer para a proxima nota, sem consultar provedor.
--
-- A chave e (empresa, cliente, cidade, numero, rua) — NUNCA so o cliente. A parada agrupa por
-- endereco e nao por CNPJ de proposito: a mesma rede em cinco lojas e cinco paradas. Ligar
-- coordenada ao documento do cliente colapsaria as cinco.
--
-- A rua esta na chave porque o CEP nao basta: MEDIDO nesta base, tres casos de mesma cidade e mesmo
-- numero com CEPs diferentes ("PORTO FERREIRA no 25" tem tres).
CREATE TABLE "client_delivery_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_tax_id" text NOT NULL,
	"city_code" text NOT NULL,
	"address_number" text NOT NULL,
	"street_key" text NOT NULL,
	"street" text NOT NULL DEFAULT '',
	"address_key" text NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"source" text NOT NULL,
	"precision" text NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_company_id_companies_id_fk"
	FOREIGN KEY ("company_id") REFERENCES "companies"("id")
	ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_actor_membership_fk"
	FOREIGN KEY ("actor_user_id", "company_id")
	REFERENCES "user_company_memberships"("user_id", "company_id")
	ON DELETE restrict ON UPDATE cascade;

-- A rua entra no unique, e e ela que deixa duas lojas do mesmo cliente no mesmo numero coexistirem.
-- Sem ela o banco recusaria a segunda loja — e recusar cadastro legitimo e tao errado quanto
-- colapsar dois lugares num.
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_client_place_unique"
	UNIQUE ("company_id", "client_tax_id", "city_code", "address_number", "street_key");

-- SEM indice de consulta separado: (company_id, client_tax_id, city_code, address_number) e prefixo
-- exato do unique acima, servido pelo indice dele. Um indice extra so duplicaria o documento do
-- cliente em disco e em backup.

ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_client_tax_id_check" CHECK (length("client_tax_id") > 0);
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_city_code_check" CHECK (length("city_code") > 0);
-- street_key vazio colapsaria duas lojas sem rua legivel no mesmo numero. Recusar o cadastro
-- ambiguo e melhor que agrupa-lo sob uma sentinela.
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_street_key_check" CHECK (length("street_key") > 0);
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_address_key_check" CHECK (length("address_key") > 0);
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_source_check"
	CHECK ("source" IN ('manual', 'google', 'postal_code', 'city'));
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_precision_check"
	CHECK ("precision" IN ('rooftop', 'street', 'postal_code', 'city'));
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "client_delivery_addresses"
	ADD CONSTRAINT "client_delivery_addresses_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);
