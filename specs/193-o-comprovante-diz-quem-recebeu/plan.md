# Plano — Feature 193

Antes deste plano, leia `spec.md` (R1–R4, D1–D16) e
`docs/adr/0079-quem-recebeu-e-o-contato-do-destinatario.md`.

## Ordem e releases

A ordem das fases:

1. **Fila no cabeçalho.** Só UI do motorista, sem API e sem tocar no formulário.
2. **Banco.** Migration aditiva, com verificação prévia e rollback escrito à mão.
3. **API.** Começa pela tolerância do painel (T3.1).
4. **App do motorista: quem recebeu.** Depende de **P0** (o attach nunca descarta), da 194 fases 1–3
   (conferidos na T4.0).
5. **Painel.**
6. **Contato do destinatário.** Segue R3/R4 e, para o e-mail, depende do PR #105.
7. **Revisão de design, documentação viva e gates.**

**Produção sai em três releases**, cada uma por PR `staging → main` com aprovação humana (a `main` é
protegida):

- **R1 — o painel tolera chaves novas (T3.1).** Tem de estar **em produção** antes da R2. O service
  worker do painel é `autoUpdate`, e a versão velha fica aberta nas abas. Um painel sem a T3.1
  derruba o comprovante inteiro: a `hasExactKeys` em `tripResponse.validation.ts:1121` recusa a
  chave desconhecida, e a `deliveryProofsFromApi`, em `:799`, descarta a lista.
- **R2 — migration e API** (Fases 2 e 3, e o lado API da Fase 6). A API só emite chave nova depois
  que a R1 está em produção.
- **R3 — telas** (Fases 1, 4, 5 e o lado app da Fase 6), com o ok do usuário nos prints.

A Fase 1 não depende de API e pode ir na R1 ou na R3.

Os validadores **do app do motorista** ignoram chave desconhecida (o `toDeliveryProof` só
desestrutura as suas). Por isso o app velho aguenta a API nova. O **painel** só aguenta depois da R1.

## Fase 1 — Fila no cabeçalho (D13)

- A função pura `selectPendingTotal({ attachments, reports, ownerSubHash, now })` fica em
  `pendingQueue.service.ts` e devolve `countPending(...).total`.
- O `useDriverTrip` expõe `pendingTotal` como estado derivado da mesma leitura que já alimenta o
  temporizador (`useDriverTrip.hook.ts:201`).
- O `DriverShellHeader` recebe `pendingCount` por prop. Ele monta em
  `DriverTripWorkspace.page.tsx:172, 191, 206, 241, 260 e 371`, todas com o hook à mão. O
  `/notificacoes` fica de fora (D13).
- O botão fica entre a marca e o sino e chama `navigateToDriverSection('queue')`.
- O selo vem de `formatQueueBadge(total)`.
- O ícone vem do `icon` copiado. Se faltar ícone, entra no mapa com o cabeçalho de cópia por valor.
- O CSS usa o mesmo alvo do sino.
- **Preview:** a API de demonstração ganha `PREVIEW_HOLD_QUEUE=1`, com 503 nos `POST
/me/trips/current/*`.
- **Smoke:** o `driver-app.smoke.spec.ts` ganha o caso "fila presa → selo → toque abre `/fila`".

## Fase 2 — Banco

A migration é `drizzle/<ts>_delivery_proof_received_by/`. O `migration.sql` e o `snapshot.json` vêm
de `db:generate`, com o SQL conferido à mão. O **`rollback.sql` é escrito à mão**, porque o
`db:generate` não gera rollback.

1. **Verificação prévia:** um `DO $$ … RAISE EXCEPTION` aborta se existir linha em
   `trip_delivery_proofs` com `kind = 'cargo'`, `channel = 'office'` e `receiver_name <> ''`. O CHECK
   novo seria **mais estreito** que o antigo para esse caso.
2. `received_by` (`text not null default 'optional'`, com CHECK nos modos) em
   `company_delivery_proof_settings` e em `delivery_proof_setting_overrides`.
3. Colunas nulas `trip_delivery_proofs.received_by varchar(16)` e `received_by_detail varchar(120)`,
   com estes CHECKs:
   - a relação está na lista ou é nula;
   - detalhe só existe com relação;
   - `kind <> 'cargo'` ou os dois são nulos.

   O detalhe obrigatório em `other`/`other_relative` **não** vira CHECK: pela D2 o motorista pode
   gravar sem ele.

4. O `receiver_check` troca para `kind <> 'cargo' or length(receiver_name) = 0`.
5. A constante `RECEIVED_BY_OPTIONS` fica em `src/database/trip.schema.ts`. Ela não pode importar
   `trips/domain`, por causa do fechamento de imports do pre-deploy.
6. O `rollback.sql` começa com "Manual rollback only". Ele aborta se houver relação gravada ou foto
   do motorista com nome. Sem dado, restaura o CHECK antigo e remove as colunas.
7. **Prova:** `test/database-migration/delivery-proof-received-by.assertion.ts`, ligado em
   `test/database-migration/database-migration.integration.ts`, no mesmo molde de
   `delivery-proof-cargo.assertion.ts` da spec 184. Ele cobre:
   - o CHECK recusa `cargo` com relação ou com nome;
   - a foto do motorista com nome passa;
   - a verificação prévia aborta;
   - o rollback aborta com dado.
8. A pasta nova entra em `static-migration.contract.ts:61`.
9. O `trip-schema/tenant-safety.contract.ts` e o `delivery-proof-settings-tenant-safety.contract.ts`
   são atualizados.

## Fase 3 — API

- **T3.1 é painel, na R1:**
  - `isDeliveryProof` aceita `receivedBy`/`receivedByDetail` presentes (válidos ou `null`) ou
    ausentes;
  - `deliveryProofsFromApi` descarta só o item inválido, nunca a lista;
  - `isDeliveryProofFieldSettings` lê `receivedBy` ausente como `optional`.
- **Configuração:**
  - o tipo ganha `receivedBy`;
  - o schema `.strict()` aceita `receivedBy` opcional;
  - repositório: ausente no geral não mexe; ausente na exceção preserva o valor do mesmo `taxId`;
  - o snapshot leva o modo resolvido por nota, junto de `recipientDisplayName` (nome fantasia, senão
    razão social: o join já busca `nfeParticipants`, e a regra vem de `resolveDeliveryContact`);
  - o `GET /trips/field-delivery-settings` não muda: o escritório renderiza sempre (D16).
- **Forma, em `trips/presentation/received-by.schema.ts`:**
  - `normalizeReceivedBy` é tolerante e serve ao motorista, ao anexo e ao PATCH;
  - `parseReceivedByStrict` responde 400 com `details` e serve ao escritório.
  - Os campos entram na lista fechada de `office-field-delivery.schema.ts:30-46`.
- **Configuração aplicada, em `trips/domain/received-by.policy.ts`:**
  `applyReceivedBySettings({ channel, mode, value })` descarta em `off` e só lança
  `TripDeliveryProofReceivedByRequiredError` no canal `office`. O erro fica em
  `trip-field-office.error.ts`, e o código mora na classe (não existe `codes.ts`).
- **Gravação:**
  - no `attachDeliveryProof`, `carriesReceiverName` passa a `kind !== 'cargo'`;
  - o `persistOfficeProof` grava os campos e zera em `cargo`;
  - o replay por `attachmentKey` não reescreve.
- **PATCH, em `me-trip.routes.ts`:** `PATCH /me/trips/current/documents/:documentId/proof/receiver`.
  - JSON e `Idempotency-Key`, pelo mesmo mecanismo das outras rotas `/me` (conferir
    `trip_field_reports`).
  - O use case `updateDriverProofReceiver` atualiza **só** as linhas `photo`/`signature` com
    `channel = 'driver_app'` do evento de entrega daquela nota.
  - Sem linha, responde 404 `TRIP_DELIVERY_PROOF_NOT_FOUND`.
  - Aplica `normalizeReceivedBy` e a regra de `off`, e responde 200 `{ changed }`.
  - Entra no rate limit das rotas do motorista.
- **Leitura:** `DeliveryProofView` e `delivery-proof-read.support.ts` emitem os campos novos.
- **Contratos negativos:**
  - o portal não ganha o campo;
  - log: nenhum `logger.*`, `log.*` ou `console.*` em arquivo que cite `receivedByDetail`;
  - a auditoria do escritório não leva o detalhe.

## Fase 4 — App do motorista: quem recebeu

Pré-condições:

- **P0** (o attach nunca descarta) está em `origin/staging`;
- a **194** fases 1–3 está em `origin/staging`, ou foi combinada com quem a executa;
- a T4.0 registrou os dois hashes em `evidence.md`.

Mudanças:

- **Tipos e validação:** `driverTrip.types.ts` ganha `receivedBy` no `DriverDeliveryProofSettings`
  e `recipientDisplayName` na nota. O `toDeliveryProof` passa a ter **fallback por campo**: um
  campo ausente ou inválido vira o padrão daquele campo, e o conjunto nunca vira `null` por causa
  de um campo só.
- **Plano do formulário (`proofFormPlan.service.ts`):**
  - `rendersReceivedBy` e `rendersRecipientShortcut`;
  - `applyRecipientShortcut`;
  - `listPendingReceiverFields`, que devolve avisos (`receivedBy` em `required`; detalhe em
    `other`/`other_relative`) e **nunca** entra em `blockedByFields`.
  - As opções vêm de `RECEIVED_BY_OPTIONS`, em cópia por valor vigiada por `catalog-parity`.
- **Tela (`DeliveryProofSection`):**
  - Ordem: os três botões de captura, depois o bloco "Quem recebeu" (botão rápido, select compacto
    (R1), "Detalhes" com `maxLength={120}`, nome e documento).
  - A pendência de `required` (R2) aparece como `role="status"`, nunca como erro que trava.
  - O `receiverFields()` omite o detalhe sem relação, aplica trim e remove `\p{Cc}`.
- **Fila:**
  - o `QueuedAttachment` ganha `receivedBy?` e `receivedByDetail?`, e o `attachProof` faz `form.set`
    dos dois;
  - `applyAttachmentReceiver({ attachmentKey, items, receiver })` segue o molde de
    `applyAttachmentLocation`;
  - novo kind `proofReceiver` no `DriverFieldReport`, com o `switch` exaustivo de
    `driverTripClient.service.ts` fazendo o PATCH;
  - na drenagem, ao receber `sent`, os campos do item gravado são comparados com os enviados, e se
    diferirem entra um `proofReceiver`;
  - o IndexedDB não muda de versão (a leitura já é tolerante);
  - a edição depois da captura vale em `DriverPendingProofs.page.tsx` também.
- **Preview:** a API de demonstração passa a responder:
  - `deliveryProof.receivedBy = 'required'` numa parada;
  - `recipientDisplayName` PF e PJ;
  - `/proof` com 201 sempre;
  - `PATCH .../proof/receiver` com 200.

## Fase 5 — Painel

- **Configuração:**
  - `DELIVERY_PROOF_FIELDS` ganha `receivedBy`;
  - o quinto `Select` "Quem recebeu" entra no geral e nas exceções;
  - o aviso "a exceção vence a configuração geral por inteiro" fica no bloco das exceções.
- **Comprovante:**
  - o `resolveDeliveryProofView` escolhe **uma linha** (assinatura, senão foto) e tira dela nome,
    relação e detalhe;
  - a frase vem das chaves de locale `deliveryProof.receiver*`;
  - com `required` e sem relação, mostra "Quem recebeu: não informado".
- **Assistente do escritório:**
  - o `FieldDeliveryReviewStep` renderiza **sempre** o `Select` "Quem recebeu" e "Detalhes";
  - o 400 e o 422 vão para o campo (`error-mapping`).
- Locale pt-BR acentuado e en.

## Fase 6 — Contato do destinatário

Segue R3 (Ligar e WhatsApp) e R4 ("Ver contato", com auditoria).

- **API:**
  - o repositório do snapshot junta `nfe_addresses.phone` do destinatário e reusa
    `resolveDeliveryContact`;
  - `resolveDriverRecipientContact({ contact, documentStatus, tripStatus })` devolve `null` com a
    nota fechada, com a viagem fechada ou sem contato;
  - `toE164Brazil(digits)` só aceita 10/11 dígitos nacionais (ou 12/13 com o 55 na frente);
  - o e-mail é validado com zod;
  - o `email` fica `null` até a T6.5;
  - rota `POST /me/trips/current/documents/:documentId/contact-reveals` (R4):
    - `Idempotency-Key`;
    - grava em `audit_logs` o ator, a viagem, a nota e o horário do toque (`revealedAt`, vindo do
      aparelho e limitado à janela da viagem), sem o contato;
    - rate limit;
    - nota fora da viagem do motorista responde 404.
- **App:**
  - validação com ausente como `null`;
  - `buildRecipientContactLinks(contact, channels)` monta os `href`: `tel:` só com E.164, `wa.me`
    só com celular de 11 dígitos (R3), `mailto:` com `encodeURIComponent`;
  - `DriverStopContact.component.tsx` é arquivo próprio, para reduzir o conflito com a 192, com os
    contatos deduplicados por `phoneE164` entre as notas pendentes da parada;
  - o contato fica oculto até "Ver contato"; o toque revela na hora, mesmo sem rede, e enfileira o
    kind `contactReveal` no `DriverFieldReport` (R4);
  - `https://wa.me` entra em `NON_FETCH_ORIGIN` (R3).
- **Smoke:** o card com contato. O botão "Ver contato" revela e o evento entra na fila.
- **E-mail (T6.5):**
  1. Merge do `adatechnology-packages#105` e publicação.
  2. Bump na API e no worker. O bump atravessa `0.3.0-rc.7` → `0.3.0`: ler o changelog.
  3. `nfe_participants.email`, com migration aditiva e `rollback.sql` à mão, e a cópia do schema do
     worker (`apps/worker-transportada/src/database/nfe.schema.ts`).
  4. Gravação no consumidor (`drizzle-nfe-import-consumer.repository.ts`).
  5. Backfill: `emailByParticipantId` em `nfe-party-contact-backfill.service.ts`.
  6. `resolveDeliveryContact` preenche o `email`, e o `TripStopList` mostra o e-mail com botão de
     copiar.

## Fase 7 — Revisão e fechamento

- **Prints** em 375 e 768 px no preview:
  - o cabeçalho com o selo;
  - a captura acima do bloco "Quem recebeu";
  - o botão rápido PF e PJ;
  - o select ou a grade;
  - a pendência;
  - o painel: configuração, comprovante e assistente;
  - o contato no card.
- **Documentação viva:**
  - o `CLAUDE.md` das três apps (e do worker, se a T6.5 fechar);
  - o `docs/SECURITY.md`: detalhe livre; contato no aparelho; retenção fora do nosso controle
    pelos links; exposição do número do motorista;
  - a `079/tasks.md`: T022 fechada pela 193;
  - a ADR-0079 passa a "aceita".

## Riscos

- **Painel em produção sem a R1:** o comprovante some da tela. Por isso a R1 vai antes.
- **P0 e 194 no mesmo `attach`:** se a Fase 4 correr antes do P0, o campo novo herda o descarte da
  foto. A Fase 4 tem de parar se o P0 não estiver no `origin/staging`.
- **Corrida entre a edição e o envio do anexo:** coberta pela comparação no `sent` (D7).
- **Migrations da 193 e da 194 em `trip_delivery_proofs`:** a segunda regenera, e o `db:generate`
  tem de dar `no_changes`.
- **E-mail:** depende do #105. Sem ele, a T6.5 fica aberta (CA20).
- **Rollback:** o caminho de reversão é **só de código**, porque a migration de volta aborta com
  dado.
