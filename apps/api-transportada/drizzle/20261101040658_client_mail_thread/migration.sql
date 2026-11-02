-- Copyright (c) 2026 Ada Technology. MIT License.
-- Spec 287: abre o fio de e-mail do cliente (`client_document_occurrence`, `client_stop_occurrence`) ao lado do da
-- contratante. Aditiva: só alarga a CHECK; nenhuma linha antiga muda.
ALTER TABLE "contractor_mail_threads" DROP CONSTRAINT "contractor_mail_threads_subject_type_check", ADD CONSTRAINT "contractor_mail_threads_subject_type_check" CHECK ("subject_type" in ('stop_occurrence', 'document_occurrence', 'delivery_charge', 'setup_test', 'address_correction', 'client_document_occurrence', 'client_stop_occurrence'));