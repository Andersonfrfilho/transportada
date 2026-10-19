ALTER TABLE "notification"."deliveries" DROP CONSTRAINT "deliveries_notification_id_notifications_id_fk";
--> statement-breakpoint
ALTER TABLE "notification"."deliveries" ADD CONSTRAINT "deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "notification"."notifications"("id") ON DELETE cascade ON UPDATE no action;