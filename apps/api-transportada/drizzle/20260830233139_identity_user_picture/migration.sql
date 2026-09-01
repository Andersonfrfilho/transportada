CREATE TABLE "identity_user_pictures" (
	"user_id" uuid PRIMARY KEY,
	"mime_type" text NOT NULL,
	"content_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_user_pictures_mime_type_check" CHECK ("mime_type" in ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "identity_user_pictures_byte_size_check" CHECK ("byte_size" between 1 and 262144),
	CONSTRAINT "identity_user_pictures_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "identity_user_pictures" ADD CONSTRAINT "identity_user_pictures_user_id_identity_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;