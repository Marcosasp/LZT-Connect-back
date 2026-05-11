-- Cascade delete: WintourTicket when WintourHeader is deleted
ALTER TABLE "wintour_tickets" DROP CONSTRAINT "wintour_tickets_header_id_fkey";
ALTER TABLE "wintour_tickets" ADD CONSTRAINT "wintour_tickets_header_id_fkey"
  FOREIGN KEY ("header_id") REFERENCES "wintour_headers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade delete: WintourTicket children when WintourTicket is deleted
ALTER TABLE "wintour_apportionments" DROP CONSTRAINT "wintour_apportionments_ticket_id_fkey";
ALTER TABLE "wintour_apportionments" ADD CONSTRAINT "wintour_apportionments_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_sales_origins" DROP CONSTRAINT "wintour_sales_origins_ticket_id_fkey";
ALTER TABLE "wintour_sales_origins" ADD CONSTRAINT "wintour_sales_origins_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_ticket_conjugates" DROP CONSTRAINT "wintour_ticket_conjugates_ticket_id_fkey";
ALTER TABLE "wintour_ticket_conjugates" ADD CONSTRAINT "wintour_ticket_conjugates_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_values" DROP CONSTRAINT "wintour_values_ticket_id_fkey";
ALTER TABLE "wintour_values" ADD CONSTRAINT "wintour_values_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_expiries" DROP CONSTRAINT "wintour_expiries_ticket_id_fkey";
ALTER TABLE "wintour_expiries" ADD CONSTRAINT "wintour_expiries_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_airs" DROP CONSTRAINT "wintour_airs_ticket_id_fkey";
ALTER TABLE "wintour_airs" ADD CONSTRAINT "wintour_airs_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade delete: WintourSection when WintourAir is deleted
ALTER TABLE "wintour_sections" DROP CONSTRAINT "wintour_sections_air_id_fkey";
ALTER TABLE "wintour_sections" ADD CONSTRAINT "wintour_sections_air_id_fkey"
  FOREIGN KEY ("air_id") REFERENCES "wintour_airs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_hotels" DROP CONSTRAINT "wintour_hotels_ticket_id_fkey";
ALTER TABLE "wintour_hotels" ADD CONSTRAINT "wintour_hotels_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_locations" DROP CONSTRAINT "wintour_locations_ticket_id_fkey";
ALTER TABLE "wintour_locations" ADD CONSTRAINT "wintour_locations_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_others" DROP CONSTRAINT "wintour_others_ticket_id_fkey";
ALTER TABLE "wintour_others" ADD CONSTRAINT "wintour_others_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_transfers" DROP CONSTRAINT "wintour_transfers_ticket_id_fkey";
ALTER TABLE "wintour_transfers" ADD CONSTRAINT "wintour_transfers_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_packages" DROP CONSTRAINT "wintour_packages_ticket_id_fkey";
ALTER TABLE "wintour_packages" ADD CONSTRAINT "wintour_packages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_other_services" DROP CONSTRAINT "wintour_other_services_ticket_id_fkey";
ALTER TABLE "wintour_other_services" ADD CONSTRAINT "wintour_other_services_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "wintour_customer_data" DROP CONSTRAINT "wintour_customer_data_ticket_id_fkey";
ALTER TABLE "wintour_customer_data" ADD CONSTRAINT "wintour_customer_data_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "wintour_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
