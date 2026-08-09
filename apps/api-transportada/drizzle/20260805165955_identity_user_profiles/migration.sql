CREATE TABLE "identity_user_profiles" (
	"user_id" uuid PRIMARY KEY,
	"name" text NOT NULL,
	"contact_channel" text NOT NULL,
	"contact_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_user_profiles_contact_channel_check" CHECK ("contact_channel" in ('email', 'sms', 'whatsapp')),
	CONSTRAINT "identity_user_profiles_name_not_blank_check" CHECK (length(trim("name")) > 0),
	CONSTRAINT "identity_user_profiles_contact_address_not_blank_check" CHECK (length(trim("contact_address")) > 0)
);
--> statement-breakpoint
ALTER TABLE "identity_user_profiles" ADD CONSTRAINT "identity_user_profiles_user_id_identity_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;