-- Copyright (c) 2026 Ada Technology. MIT License.
--
-- Recorte da base de produção para staging (spec 291). Roda no **banco temporário** onde o
-- `staging-refresh.sh` restaurou o dump inteiro, nunca em staging: o que sai daqui é o que o dump
-- recortado leva para staging, então dado pessoal e conversa não chegam a tocar a base de staging.
--
-- Uso: psql --set ON_ERROR_STOP=1 --set window_days=60 --file prune-source.sql <banco temporário>
--
-- Cada tabela tem uma política (`refresh_work.policy`), e a lista é conferida contra os schemas
-- Drizzle pelo contrato `staging-refresh.contract.ts`:
--   keep        vai inteira (configuração, cadastros, modelos).
--   window      só as linhas dos últimos `window_days` dias, pela coluna indicada.
--   empty       não vai (conversas, anexos, filas, auditoria, emissão fiscal, credenciais).
--   referenced  fica só a linha que algum registro mantido ainda aponta (metadado de `stored_objects`).
-- Tabela **sem política** (nova, ou de pacote com schema próprio) é esvaziada com aviso: o padrão é
-- não levar. O contrato falha o CI antes de isso acontecer com tabela do Drizzle desta app.
--
-- As FKs são salvas, derrubadas, e recolocadas no fim **com validação**: se o recorte deixou linha
-- órfã, o `add constraint` falha e o refresh aborta antes de staging ser tocado. No meio, as órfãs
-- saem num ponto fixo: FK com todas as colunas anuláveis zera a referência (se um CHECK impedir, a
-- linha sai); as demais levam a linha filha embora.
select set_config('refresh.window_days', :'window_days', false);

drop schema if exists refresh_work cascade;
create schema refresh_work;

create table refresh_work.policy (
  table_key text primary key,
  mode text not null check (mode in ('keep', 'empty', 'window', 'referenced')),
  date_column text,
  check ((mode = 'window') = (date_column is not null))
);

insert into refresh_work.policy (table_key, mode, date_column) values
  ('address_comparisons', 'keep', null),
  ('address_correction_requests', 'keep', null),
  ('address_correction_suggestions', 'empty', null),
  ('aggregate_accounts', 'keep', null),
  ('aggregate_application_attachments', 'empty', null),
  ('aggregate_applications', 'keep', null),
  ('aggregate_attachment_outbox', 'empty', null),
  ('aggregate_documents', 'empty', null),
  ('audit_logs', 'empty', null),
  ('billing_description_templates', 'keep', null),
  ('billing_invoice_documents', 'empty', null),
  ('billing_invoice_events', 'empty', null),
  ('billing_invoice_items', 'empty', null),
  ('billing_invoices', 'empty', null),
  ('cargo_arrival_documents', 'keep', null),
  ('cargo_arrival_events', 'keep', null),
  ('cargo_arrivals', 'window', 'created_at'),
  ('cargo_preview_document_links', 'keep', null),
  ('cargo_preview_email_intakes', 'empty', null),
  ('cargo_preview_events', 'keep', null),
  ('cargo_preview_items', 'keep', null),
  ('cargo_preview_outbox', 'empty', null),
  ('cargo_preview_route_loads', 'keep', null),
  ('cargo_previews', 'window', 'created_at'),
  ('client_delivery_addresses', 'keep', null),
  ('companies', 'keep', null),
  ('company_audio_transcription_settings', 'keep', null),
  ('company_business_calendar_settings', 'keep', null),
  ('company_cargo_settings', 'keep', null),
  ('company_cargo_volume_factors', 'keep', null),
  ('company_contacts', 'keep', null),
  ('company_crew_settings', 'keep', null),
  ('company_delivery_proof_settings', 'keep', null),
  ('company_distribution_settings', 'keep', null),
  ('company_driver_allowance_settings', 'keep', null),
  ('company_driver_reminder_settings', 'keep', null),
  ('company_energy_settings', 'keep', null),
  ('company_entry_kinds', 'keep', null),
  ('company_fiscal_profiles', 'keep', null),
  ('company_fuel_prices', 'keep', null),
  ('company_group_permissions', 'keep', null),
  ('company_group_roles', 'keep', null),
  ('company_groups', 'keep', null),
  ('company_holiday_import_settings', 'keep', null),
  ('company_location_retention_settings', 'keep', null),
  ('company_logos', 'keep', null),
  ('company_occurrence_type_client_channels', 'keep', null),
  ('company_occurrence_type_contractor_overrides', 'keep', null),
  ('company_occurrence_type_contractors', 'keep', null),
  ('company_occurrence_type_moments', 'keep', null),
  ('company_occurrence_type_recipient_overrides', 'keep', null),
  ('company_occurrence_type_recipients', 'keep', null),
  ('company_occurrence_type_watchers', 'keep', null),
  ('company_occurrence_types', 'keep', null),
  ('company_occurrence_watchers', 'keep', null),
  ('company_quick_replies', 'keep', null),
  ('company_route_optimization_settings', 'keep', null),
  ('company_social_links', 'keep', null),
  ('company_tax_settings', 'keep', null),
  ('company_toll_booth_charges', 'keep', null),
  ('contractor_automations', 'keep', null),
  ('contractor_contacts', 'keep', null),
  ('contractor_inbound_email_outbox', 'empty', null),
  ('contractor_mail_messages', 'empty', null),
  ('contractor_mail_outbox', 'empty', null),
  ('contractor_mail_settings', 'empty', null),
  ('contractor_mail_templates', 'keep', null),
  ('contractor_mail_threads', 'empty', null),
  ('contractor_occurrence_watchers', 'keep', null),
  ('contractor_portal_bindings', 'keep', null),
  ('contractor_receiving_profiles', 'keep', null),
  ('contractor_recipient_aliases', 'keep', null),
  ('contractors', 'keep', null),
  ('cte_batch_events', 'empty', null),
  ('cte_batch_item_charges', 'empty', null),
  ('cte_batch_item_documents', 'empty', null),
  ('cte_batch_items', 'empty', null),
  ('cte_batches', 'empty', null),
  ('cte_emission_profile_components', 'keep', null),
  ('cte_emission_profile_matchers', 'keep', null),
  ('cte_emission_profiles', 'keep', null),
  ('cte_fiscal_documents', 'empty', null),
  ('cte_issuance_attempts', 'empty', null),
  ('cte_issuance_diagnostics', 'empty', null),
  ('cte_issuance_events', 'empty', null),
  ('cte_issuance_outbox', 'empty', null),
  ('cte_issuance_payloads', 'empty', null),
  ('cte_processed_messages', 'empty', null),
  ('cte_retry_schedules', 'empty', null),
  ('cte_submission_records', 'empty', null),
  ('delivery_address_overrides', 'keep', null),
  ('delivery_charge_events', 'keep', null),
  ('delivery_charges', 'window', 'charged_on'),
  ('delivery_client_charge_rules', 'keep', null),
  ('delivery_client_contacts', 'keep', null),
  ('delivery_client_exceptions', 'keep', null),
  ('delivery_client_windows', 'keep', null),
  ('delivery_clients', 'keep', null),
  ('delivery_proof_outbox', 'empty', null),
  ('delivery_proof_setting_contractor_overrides', 'keep', null),
  ('delivery_proof_setting_overrides', 'keep', null),
  ('digital_certificates', 'keep', null),
  ('driver_assignment_feedback', 'keep', null),
  ('driver_stop_reminders', 'empty', null),
  ('energy_tariff_references', 'keep', null),
  ('external_identities', 'keep', null),
  ('extra_charge_batches', 'window', 'created_at'),
  ('fiscal_sequence_reservations', 'empty', null),
  ('fiscal_sequences', 'empty', null),
  ('fleet_driver_attachment_outbox', 'empty', null),
  ('fleet_driver_attachments', 'empty', null),
  ('fleet_driver_regions', 'keep', null),
  ('fleet_driver_vehicle_assignments', 'keep', null),
  ('fleet_driver_whatsapp_groups', 'keep', null),
  ('fleet_drivers', 'keep', null),
  ('fleet_vehicle_axles', 'keep', null),
  ('fleet_vehicles', 'keep', null),
  ('freight_calculations', 'keep', null),
  ('freight_region_cities', 'keep', null),
  ('freight_region_driver_rates', 'keep', null),
  ('freight_regions', 'keep', null),
  ('freight_rule_versions', 'keep', null),
  ('freight_rules', 'keep', null),
  ('fuel_price_references', 'keep', null),
  ('geocoded_address_corrections', 'keep', null),
  ('geocoded_addresses', 'keep', null),
  ('geocoding_refinement_requests', 'keep', null),
  ('holiday_import_cities', 'keep', null),
  ('holiday_import_suppressions', 'keep', null),
  ('holiday_provider_entries', 'keep', null),
  ('holiday_provider_fetches', 'keep', null),
  ('holiday_provider_monthly_usage', 'keep', null),
  ('holiday_provider_settings', 'keep', null),
  ('idempotency_records', 'empty', null),
  ('identity_user_pictures', 'keep', null),
  ('identity_user_profiles', 'keep', null),
  ('identity_users', 'keep', null),
  ('invitation_delivery_outbox', 'empty', null),
  ('job_executions', 'empty', null),
  ('job_schedules', 'keep', null),
  ('landing_settings', 'keep', null),
  ('login_identifiers', 'keep', null),
  ('mdfe_fiscal_documents', 'empty', null),
  ('mdfe_issuance_attempts', 'empty', null),
  ('mdfe_issuance_events', 'empty', null),
  ('mdfe_issuance_outbox', 'empty', null),
  ('mdfe_issuance_payloads', 'empty', null),
  ('mdfe_manifest_drivers', 'empty', null),
  ('mdfe_manifest_items', 'empty', null),
  ('mdfe_manifest_loading_cities', 'empty', null),
  ('mdfe_manifests', 'empty', null),
  ('mdfe_processed_messages', 'empty', null),
  ('membership_groups', 'keep', null),
  ('membership_permissions', 'keep', null),
  ('membership_roles', 'keep', null),
  ('municipal_holiday_rules', 'keep', null),
  ('municipal_holidays', 'keep', null),
  ('municipality_centroids', 'keep', null),
  ('nfe_access_key_lookup_budgets', 'empty', null),
  ('nfe_access_key_lookups', 'empty', null),
  ('nfe_addresses', 'keep', null),
  ('nfe_distribution_cursors', 'keep', null),
  ('nfe_document_status_changes', 'keep', null),
  ('nfe_documents', 'window', 'issued_at'),
  ('nfe_events', 'window', 'occurred_at'),
  ('nfe_import_items', 'empty', null),
  ('nfe_imports', 'window', 'created_at'),
  ('nfe_package_box_measurements', 'keep', null),
  ('nfe_package_boxes', 'keep', null),
  ('nfe_participants', 'keep', null),
  ('nfe_products', 'keep', null),
  ('nfe_volumes', 'keep', null),
  ('nfe_xml_allowed_email_domains', 'keep', null),
  ('nfe_xml_receipts', 'empty', null),
  ('nfse_emission_profiles', 'keep', null),
  ('nfse_fiscal_documents', 'empty', null),
  ('nfse_issuance_attempts', 'empty', null),
  ('nfse_issuance_events', 'empty', null),
  ('nfse_issuance_outbox', 'empty', null),
  ('nfse_issuance_payloads', 'empty', null),
  ('nfse_processed_messages', 'empty', null),
  ('nfse_provider_credentials', 'empty', null),
  ('nfse_service_invoice_charges', 'empty', null),
  ('nfse_service_invoice_documents', 'empty', null),
  ('nfse_service_invoices', 'empty', null),
  ('occurrence_contractor_replies', 'empty', null),
  ('occurrence_contractor_reply_deliveries', 'empty', null),
  ('occurrence_contractor_reply_events', 'empty', null),
  ('occurrence_conversation_attachments', 'empty', null),
  ('occurrence_conversation_audio_transcriptions', 'empty', null),
  ('occurrence_conversation_messages', 'empty', null),
  ('occurrence_conversation_reads', 'empty', null),
  ('occurrence_conversation_unassigned', 'empty', null),
  ('occurrence_conversation_uploads', 'empty', null),
  ('occurrence_conversations', 'empty', null),
  ('password_reset_delivery_outbox', 'empty', null),
  ('password_reset_requests', 'empty', null),
  ('processed_messages', 'empty', null),
  ('processing_jobs', 'empty', null),
  ('processing_outbox', 'empty', null),
  ('rate_limit_windows', 'empty', null),
  ('route_suggestion_documents', 'keep', null),
  ('route_suggestion_stop_documents', 'keep', null),
  ('route_suggestion_stops', 'keep', null),
  ('route_suggestion_vehicle_helpers', 'keep', null),
  ('route_suggestion_vehicles', 'keep', null),
  ('route_suggestions', 'window', 'created_at'),
  ('state_holidays', 'keep', null),
  ('stored_objects', 'referenced', null),
  ('toll_booth_extracts', 'keep', null),
  ('toll_booths', 'keep', null),
  ('trip_cargo_layout_outbox', 'empty', null),
  ('trip_cargo_layouts', 'keep', null),
  ('trip_cost_entries', 'keep', null),
  ('trip_crew_events', 'keep', null),
  ('trip_delivery_proofs', 'keep', null),
  ('trip_dispatch_snapshots', 'keep', null),
  ('trip_document_events', 'keep', null),
  ('trip_document_link_events', 'keep', null),
  ('trip_document_occurrence_attachments', 'empty', null),
  ('trip_document_occurrence_corrections', 'keep', null),
  ('trip_document_occurrence_products', 'keep', null),
  ('trip_document_occurrences', 'window', 'created_at'),
  ('trip_document_release_events', 'keep', null),
  ('trip_document_reviews', 'keep', null),
  ('trip_documents', 'keep', null),
  ('trip_drivers', 'keep', null),
  ('trip_field_reports', 'keep', null),
  ('trip_financial_parcels', 'keep', null),
  ('trip_financial_results', 'keep', null),
  ('trip_location_pings', 'keep', null),
  ('trip_occurrence_case_events', 'keep', null),
  ('trip_occurrence_cases', 'keep', null),
  ('trip_occurrence_item_settlements', 'keep', null),
  ('trip_occurrence_resolution_events', 'keep', null),
  ('trip_occurrence_uploads', 'empty', null),
  ('trip_revenue_entries', 'keep', null),
  ('trip_status_events', 'keep', null),
  ('trip_stop_events', 'keep', null),
  ('trip_stop_occurrences', 'keep', null),
  ('trip_stop_schedules', 'keep', null),
  ('trip_stops', 'keep', null),
  ('trips', 'window', 'created_at'),
  ('user_company_memberships', 'keep', null),
  ('user_invitation_roles', 'empty', null),
  ('user_invitations', 'empty', null),
  ('user_whatsapp_phones', 'keep', null),
  ('vehicle_volume_references', 'keep', null),
  ('view_preferences', 'keep', null),
  ('whatsapp_canhoto_questions', 'empty', null),
  ('whatsapp_channels', 'empty', null),
  ('whatsapp_command_documents', 'empty', null),
  ('whatsapp_command_requests', 'empty', null),
  ('whatsapp_delivery_preparations', 'empty', null),
  ('whatsapp_evolution_settings', 'keep', null),
  ('whatsapp_flow_graph_versions', 'keep', null),
  ('whatsapp_group_request_messages', 'empty', null),
  ('whatsapp_group_requests', 'empty', null),
  ('whatsapp_occurrence_drafts', 'empty', null),
  ('whatsapp_phone_verification_requests', 'empty', null),
  ('whatsapp_webhook_nonces', 'empty', null),
  ('notification.templates', 'keep', null),
  ('notification.notifications', 'empty', null),
  ('notification.deliveries', 'empty', null),
  ('notification.devices', 'empty', null),
  ('meta_whatsapp.messages', 'empty', null),
  ('meta_whatsapp.sessions', 'empty', null),
  ('user.*', 'keep', null),
  ('drizzle.*', 'keep', null);

-- (tabela, coluna) cuja linha **não faz sentido** sem o pai, mesmo com a coluna anulável: a nota
-- cortada leva o documento de viagem dela junto, em vez de deixá-lo sem nota.
create table refresh_work.must_follow (table_key text, column_name text);
insert into refresh_work.must_follow values ('trip_documents', 'nfe_document_id');

do $refresh$
declare
  cutoff timestamptz := now() - make_interval(days => current_setting('refresh.window_days')::int);
  tbl record;
  fk record;
  mode text;
  date_column text;
  statement text;
  where_clause text;
  rows_changed bigint;
  pass_changes bigint;
  pass integer := 0;
  unclassified text[] := '{}';
begin
  create table refresh_work.tbl as
    select c.oid as relid, c.oid::regclass::text as qualified,
           case when n.nspname = 'public' then c.relname else n.nspname || '.' || c.relname end as table_key,
           n.nspname as schema_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname not in ('pg_catalog', 'information_schema', 'refresh_work')
      and n.nspname !~ '^pg_';

  create table refresh_work.fk as
    select c.conname, c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
           pg_get_constraintdef(c.oid) as definition,
           (select array_agg(quote_ident(a.attname) order by k.ord)
              from unnest(c.conkey) with ordinality k(att, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) as child_columns,
           (select array_agg(quote_ident(a.attname) order by k.ord)
              from unnest(c.confkey) with ordinality k(att, ord)
              join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.att) as parent_columns,
           (select bool_and(not a.attnotnull)
              from unnest(c.conkey) k(att)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att) as all_nullable,
           (select t.table_key from refresh_work.tbl t where t.relid = c.conrelid) as child_key,
           (select t.table_key from refresh_work.tbl t where t.relid = c.confrelid) as parent_key
    from pg_constraint c
    where c.contype = 'f' and c.conrelid in (select relid from refresh_work.tbl);

  for fk in select * from refresh_work.fk loop
    execute format('alter table %s drop constraint %I', fk.child, fk.conname);
  end loop;

  -- 1. Política por tabela.
  for tbl in select * from refresh_work.tbl order by table_key loop
    select p.mode, p.date_column into mode, date_column
      from refresh_work.policy p
      where p.table_key in (tbl.table_key, tbl.schema_name || '.*')
      order by (p.table_key = tbl.table_key) desc
      limit 1;
    if mode is null then
      mode := 'empty';
      unclassified := unclassified || tbl.table_key;
    end if;

    if mode = 'empty' then
      execute format('truncate table %s', tbl.qualified);
    elsif mode = 'window' then
      execute format('delete from %s where %I < %L', tbl.qualified, date_column, cutoff);
    end if;
  end loop;
  if cardinality(unclassified) > 0 then
    raise warning 'staging_refresh_unclassified_tables_emptied: %', array_to_string(unclassified, ' ');
  end if;

  -- 2. Referências que não são FK: a ocorrência aponta para o documento de viagem só por coluna.
  delete from trip_document_occurrences o
    where not exists (select 1 from trip_documents d where d.id = o.trip_document_id);

  -- 3. Ponto fixo das órfãs.
  loop
    pass := pass + 1;
    pass_changes := 0;
    for fk in select * from refresh_work.fk loop
      select string_agg(format('c.%s is not null', col), ' and ') into where_clause
        from unnest(fk.child_columns) col;
      select where_clause || ' and not exists (select 1 from ' || fk.parent || ' p where '
             || string_agg(format('p.%s = c.%s', pc, cc), ' and ') || ')' into where_clause
        from unnest(fk.parent_columns, fk.child_columns) as pair(pc, cc);

      if fk.all_nullable and not exists (
        select 1 from refresh_work.must_follow m
        where m.table_key = fk.child_key and fk.child_columns = array[quote_ident(m.column_name)]
      ) then
        begin
          select 'update ' || fk.child || ' c set '
                 || string_agg(format('%s = null', col), ', ') || ' where ' || where_clause
            into statement
            from unnest(fk.child_columns) col;
          execute statement;
          get diagnostics rows_changed = row_count;
        exception when check_violation or not_null_violation then
          execute format('delete from %s c where %s', fk.child, where_clause);
          get diagnostics rows_changed = row_count;
        end;
      else
        execute format('delete from %s c where %s', fk.child, where_clause);
        get diagnostics rows_changed = row_count;
      end if;
      pass_changes := pass_changes + rows_changed;
    end loop;
    exit when pass_changes = 0;
    if pass > 100 then
      raise exception 'staging_refresh_prune_did_not_converge';
    end if;
  end loop;

  -- 4. `referenced`: a linha só fica se algum registro mantido ainda a aponta.
  for tbl in
    select t.* from refresh_work.tbl t
    join refresh_work.policy p on p.table_key = t.table_key and p.mode = 'referenced'
  loop
    select format('delete from %s r where %s', tbl.qualified,
                  coalesce(string_agg(format('not exists (select 1 from %s c where %s)', f.child,
                    (select string_agg(format('c.%s = r.%s', cc, pc), ' and ')
                       from unnest(f.child_columns, f.parent_columns) as pair(cc, pc))), ' and '), 'true'))
      into statement
      from refresh_work.fk f where f.parent = tbl.qualified;
    execute statement;
  end loop;
end
$refresh$;

-- Material de assinatura nunca vai: a linha fica (o perfil fiscal a referencia), o envelope não.
update digital_certificates set status = 'retired', secret_envelope = null where secret_envelope is not null;

-- Contatos reais viram fictícios, derivados do hash da linha (únicos e estáveis dentro do ciclo).
-- Domínio `example.com` (RFC 2606) não recebe e-mail; o telefone tem o formato que cada CHECK exige
-- (o contato de entrega por WhatsApp é E.164 com `+`, o do usuário não).
-- Tabela ou coluna ausente **falha o ciclo**: pular em silêncio deixaria contato real em staging.
create function refresh_work.fake_email(row_text text) returns text
  language sql immutable as $$ select 'contato.' || substr(md5(row_text), 1, 12) || '@example.com' $$;
create function refresh_work.fake_phone(row_text text, with_country boolean) returns text
  language sql immutable as $$
    select case when with_country then '55' else '' end || '119'
           || lpad(((('x' || substr(md5(row_text), 1, 7))::bit(28)::int) % 100000000)::text, 8, '0') $$;

do $scrub$
declare
  spec record;
  statement text;
begin
  for spec in
    select * from (values
      ('fleet_drivers', 'email', 'refresh_work.fake_email(c::text)', ''),
      ('fleet_drivers', 'phone', 'refresh_work.fake_phone(c::text, false)', ''),
      ('contractor_contacts', 'email', 'refresh_work.fake_email(c::text)', ''),
      ('contractor_contacts', 'phone', 'refresh_work.fake_phone(c::text, true)', null),
      ('contractors', 'report_email', 'refresh_work.fake_email(c::text)', null),
      ('aggregate_applications', 'email', 'refresh_work.fake_email(c::text)', ''),
      ('aggregate_applications', 'phone', 'refresh_work.fake_phone(c::text, false)', ''),
      ('company_fiscal_profiles', 'email', 'refresh_work.fake_email(c::text)', ''),
      ('company_fiscal_profiles', 'phone', 'refresh_work.fake_phone(c::text, false)', ''),
      ('user_whatsapp_phones', 'phone', 'refresh_work.fake_phone(c::text, true)', ''),
      ('delivery_client_contacts', 'address',
        'case when c.channel = ''whatsapp'' then ''+'' || refresh_work.fake_phone(c::text, true) else refresh_work.fake_email(c::text) end', ''),
      ('company_contacts', 'value',
        'case when c.kind = ''phone'' then refresh_work.fake_phone(c::text, true) else refresh_work.fake_email(c::text) end', '')
    ) as v(table_name, column_name, expression, blank)
  loop
    if to_regclass(spec.table_name) is null then
      raise exception 'staging_refresh_scrub_table_missing: %', spec.table_name;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = spec.table_name
                     and column_name = spec.column_name) then
      raise exception 'staging_refresh_scrub_column_missing: %.%', spec.table_name, spec.column_name;
    end if;
    statement := format('update %I c set %I = %s where %I is not null',
      spec.table_name, spec.column_name, spec.expression, spec.column_name);
    if spec.blank is not null then
      statement := statement || format(' and %I <> %L', spec.column_name, spec.blank);
    end if;
    execute statement;
  end loop;
end
$scrub$;

-- As FKs voltam **validando**: órfã que o ponto fixo não viu derruba o ciclo aqui.
do $restore_fks$
declare
  fk record;
begin
  for fk in select * from refresh_work.fk loop
    execute format('alter table %s add constraint %I %s', fk.child, fk.conname, fk.definition);
  end loop;
end
$restore_fks$;

drop schema refresh_work cascade;
