# Spec 291 — Staging recebe só um recorte da produção

**Origem (Anderson, 02/11/2026):** "tipo queremos alguns dados apenas não todos" — aprovou ("boa pode ser") a proposta de restaurar o
dump num banco temporário e copiar para staging só um recorte. Não mexe em produção; o conserto do token que faz o refresh cair fica
em outra thread.

Antes (`deploy/staging-refresh/`): `pg_restore` do dump inteiro por cima de staging, depois `strip_emission_data`, `neutralize_external_reach`
e religamento de identidades. Agora o dump passa por um banco temporário antes de staging ser tocado.

## Como funciona

1. `download_production_cycle` / `extract_production_realm_users`: sem mudança.
2. `build_pruned_dump` (novo): cria `staging_refresh_source` no Postgres de staging, restaura o dump inteiro nele, roda
   `prune-source.sql`, gera um dump novo (`pg_dump -Fc`) e derruba o banco temporário. Se algo falhar aqui, **staging não foi tocado**.
3. `restore_over_staging`: igual, mas restaura o dump recortado.
4. Resto do ciclo (religar identidades, `strip_emission_data`, `neutralize_external_reach`, alinhar empresas, redeploy): sem mudança.

`prune-source.sql` salva as FKs, derruba-as, aplica a política por tabela, remove órfãs até estabilizar e **recoloca as FKs validando**:
órfã que escapou derruba o ciclo no banco temporário, nunca em staging.

## Política por tabela (`refresh_work.policy`, 246 tabelas)

| Modo          | Tabelas                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `keep` (153)  | empresas e todas as `company_*` (config, perfis fiscais, grupos), frota e motoristas, contratantes e contatos, destinatários (`delivery_clients*`), tipos de ocorrência e seus vínculos, modelos de e-mail (`contractor_mail_templates`), `notification.templates`, identidade, perfis de emissão, regras de frete, feriados, geocodificação, preferências                  |
| `window` (10) | `nfe_documents` (`issued_at`), `nfe_imports`, `nfe_events`, `trips`, `trip_document_occurrences`, `delivery_charges` (`charged_on`), `extra_charge_batches`, `cargo_arrivals`, `cargo_previews`, `route_suggestions` (os demais pela `created_at`/`occurred_at`)                                                                                                            |
| `empty` (82)  | conversas (`occurrence_conversation*`, `occurrence_contractor_repl*`, `contractor_mail_*`, `meta_whatsapp.*`), anexos e uploads, filas/outbox, auditoria, idempotência, convites e reset de senha, comandos de WhatsApp, `cte_*`/`mdfe_*`/`nfse_*`/`billing_invoice*` (emissão e faturas), `fiscal_sequences`, credenciais, `notification.notifications/deliveries/devices` |
| `referenced`  | `stored_objects`: fica só a linha (metadado, o arquivo mora no bucket) que algum registro mantido ainda aponta                                                                                                                                                                                                                                                              |

Tabela sem política (nova, ou de pacote com schema próprio) é **esvaziada com aviso** (`staging_refresh_unclassified_tables_emptied`).
O contrato `staging-refresh-prune.contract.ts` falha o CI se uma tabela do Drizzle desta app não tiver política.

## Dependências entre tabelas: o que fica de fora de cada uma

Regra geral do ponto fixo, para toda FK: se **todas** as colunas da FK admitem nulo, a referência vira `null` (e, se um CHECK
impedir, a linha sai); caso contrário a linha filha sai junto com o pai. Repete até nada mudar.

| Raiz cortada / vazia                       | O que sai por dependência                                                                                                                                                                   | O que fica, com a referência zerada                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `nfe_documents` > 60 dias                  | `nfe_participants/addresses/products/volumes`, `nfe_document_status_changes`, `freight_calculations`, `cargo_preview_document_links`, `trip_document_reviews`, `route_suggestion_documents` | —                                                                                           |
| `nfe_documents` cortada, `trip_documents`  | o `trip_documents` da nota cortada sai (`must_follow`: a coluna é anulável, mas documento de viagem sem nota não tem sentido)                                                               | —                                                                                           |
| `trips` > 60 dias                          | `trip_documents`, `trip_stops`, `trip_drivers`, eventos, comprovantes, fotos de campo, pings de localização, resultado financeiro, ocorrências de parada                                    | `delivery_charges.trip_id` e `trip_document_id` (a cobrança é janelada por si)              |
| `trip_document_occurrences`                | só as de `trip_documents` que sobraram (referência sem FK, tratada à parte), `trip_occurrence_cases/events/settlements`, `trip_occurrence_resolution_events` ligados                        | respostas do contratante e mensagens (vazias) viram `null` onde anulável                    |
| `delivery_charges` > 60 dias               | `delivery_charge_events`                                                                                                                                                                    | —                                                                                           |
| `cargo_arrivals` / `cargo_previews` > 60 d | documentos, eventos, itens, `cargo_preview_route_loads`, `contractor_recipient_aliases`                                                                                                     | —                                                                                           |
| `route_suggestions` > 60 dias              | paradas, veículos, ajudantes, `driver_assignment_feedback`                                                                                                                                  | —                                                                                           |
| conversas, e-mails e anexos (`empty`)      | respostas, entregas e eventos dependentes                                                                                                                                                   | `occurrence_conversation_message_id`, `contractor_mail_message_id` etc. em tabelas mantidas |
| `cte_*`, `mdfe_*`, `nfse_*`, `billing_*`   | tudo da emissão; `fiscal_sequence_reservations`                                                                                                                                             | `cte_emission_profiles` e `nfse_emission_profiles` **ficam** (configuração)                 |
| `stored_objects` não referenciado          | a linha de metadado sai (XML, anexo, foto, PDF de ocorrências/conversas já fora)                                                                                                            | `nfe_documents.xml_object_id` etc. seguem apontando para metadado mantido                   |

Referências sem FK (colunas `uuid` documentadas como "referência, não FK") **não** são seguidas, exceto `trip_document_occurrences.trip_document_id`.
Elas podem apontar para linha que não foi levada; é o comportamento de hoje para arquivos do bucket, que não é copiado.

## Contatos fictícios

Aplicado no banco temporário, antes do dump: e-mail vira `contato.<hash>@example.com` (domínio reservado, não recebe e-mail) e telefone
vira número fictício no formato que cada CHECK pede. Colunas: `fleet_drivers.{email,phone}`, `contractor_contacts.{email,phone}`,
`contractors.report_email`, `aggregate_applications.{email,phone}`, `company_fiscal_profiles.{email,phone}`, `user_whatsapp_phones.phone`,
`delivery_client_contacts.address` (por canal), `company_contacts.value` (por tipo). Tabela ou coluna ausente **falha o ciclo**.

**Não** são trocados: nome, CPF/CNPJ e endereço de destinatários das notas levadas (são a massa de teste), e e-mail/usuário de
`identity_user_profiles` e do schema `user` (o `rebind-identities.sql` casa o Keycloak de staging por eles).

## Decisões a confirmar

- **Faturas:** a regra "últimos 60 dias" inclui faturas, mas "manter as neutralizações atuais" inclui `billing_invoices` entre as tabelas
  zeradas pela emissão. Fiz a segunda: faturas ficam fora até alguém pedir o contrário (aí `billing_*` vira `window` e sai do `strip_emission_data`).
- **Custo:** o banco temporário e os dois dumps moram no Postgres e no disco do contêiner de staging; a janela de domingo precisa de
  espaço para o dump inteiro de produção mais o recorte. O usuário do Postgres de staging precisa de `CREATEDB` (o do Railway tem).
- **`notification.*` e `user.*`** são de pacote: não há como o contrato listá-las. `notification.templates` e `user.*` vão inteiras, o
  restante de `notification.*` e `meta_whatsapp.*` fica fora, qualquer tabela nova desses schemas é esvaziada com aviso.

## Evidência

Postgres 16 local com as 344 migrations aplicadas e massa sintética (nota velha e nova, viagem velha e nova, documentos cruzados, contatos
reais): notas 3→2, viagens 2→1, documentos de viagem 3→1 (os dois cruzados saíram), `stored_objects` só os referenciados, contatos
trocados com CHECK satisfeito, FKs recolocadas validando, tabela fora de política esvaziada com aviso. Contrato de deploy: 212 testes ok.
