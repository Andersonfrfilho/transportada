CREATE TABLE "municipality_centroids" (
	"city_code" char(7) PRIMARY KEY,
	"state" char(2) NOT NULL,
	"latitude" numeric(10,7) NOT NULL,
	"longitude" numeric(10,7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "municipality_centroids_city_code_check" CHECK ("city_code" ~ '^[0-9]{7}$'),
	CONSTRAINT "municipality_centroids_state_check" CHECK ("state" ~ '^[A-Z]{2}$'),
	CONSTRAINT "municipality_centroids_latitude_check" CHECK ("latitude" between -90 and 90),
	CONSTRAINT "municipality_centroids_longitude_check" CHECK ("longitude" between -180 and 180)
);
