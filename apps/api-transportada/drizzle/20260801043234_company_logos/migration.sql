CREATE TABLE "company_logos" (
	"company_id" uuid PRIMARY KEY,
	"mime_type" text NOT NULL,
	"content_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_logos_mime_type_check" CHECK ("mime_type" in ('image/jpeg', 'image/png')),
	CONSTRAINT "company_logos_byte_size_check" CHECK ("byte_size" between 1 and 262144),
	CONSTRAINT "company_logos_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "company_logos" ADD CONSTRAINT "company_logos_company_id_companies_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;