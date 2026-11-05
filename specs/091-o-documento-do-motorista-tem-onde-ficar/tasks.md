# Tasks — 091 O documento do motorista tem onde ficar

Uma task por vez. Task só fecha com evidência em `evidence.md`. Teste de aceite antes da
implementação.

## Fase 1 — removida

T001–T006 (criptografar a ficha, ADR-0039) saíram: ADR revogada pelo dono em 2026-11-05 (perder a
chave é perder o dado). A feature começa na Fase 2.

## Fase 2 — Tabela e rotas · 🤖 `sonnet`

- [x] **T007** Contrato de isolamento multiempresa de `fleet_driver_attachments`, em
      `test/fleet-schema/tenant-safety.contract.ts`. Aceite: FK composta com `company_id`; a FK
      simples reprova.
- [x] **T008** Migration da tabela, com índice único parcial de um documento vivo por tipo.
- [x] **T009** `fleet.reveal` no catálogo e nos papéis (migration nos dois CHECKs). Aceite: o
      contrato de papéis lista por extenso quem a recebe. ⚠️ Declarar que ela nasce **sem rota**
      até a T011.
- [ ] **T010** `POST` e `DELETE` de anexo sob `fleet.manage`. Tipo decidido pela **assinatura** do
      arquivo, nunca pela extensão. Aceite: JPEG chamado de `.pdf` é recusado.
- [ ] **T011** `GET .../content` sob `fleet.reveal`, devolvendo presigned URL de vida curta.
      Aceite: **contrato negativo** — `fleet.manage` sem `fleet.reveal` recebe 403.
- [ ] **T012** Nome do objeto no bucket sem dado pessoal. Aceite: contrato que falha se CPF, nome ou
      número de CNH aparecerem na chave.

## Fase 3 — Leitura · 🤖 `sonnet`

- [ ] **T013** Fiação ao `document-extraction.gateway.ts`, com PDF em `worker_thread`.
- [ ] **T014** CNH por `extractCnhFields`; comprovante de endereço **sem parser** (D4).
- [ ] **T015** `extracted_fields` zerado no **mesmo `UPDATE`** da decisão (D5). Aceite: contrato que
      falha se forem duas escritas.

## Fase 4 — Ficha · 🤖 `sonnet`

- [ ] **T016** Lista de anexos na ficha sob `fleet.read` — tipo, data e quem anexou, sem conteúdo.
- [ ] **T017** Anexar e substituir com `FileField`. Aceite: `test/design-system/file-field.contract.ts`
      continua verde sem exceção nova.
- [ ] **T018** Sugestão de preenchimento da CNH: oferta campo a campo, só campo vazio, divergência
      avisa e não corrige. Aceite: contrato dos três guardas, no molde da spec 071.
- [ ] **T019** Substituir apaga o objeto anterior **do bucket**. Aceite: verificado contra o bucket,
      não contra a tabela.

## Fase 5 — Auditoria e descarte · 🤖 `sonnet` (remoção revisada por `opus` 🧠)

- [ ] **T020** Trilha em anexar, substituir, remover e revelar.
- [ ] **T021** Remover motorista apaga os objetos na mesma transação. Aceite: falha na remoção do
      objeto **falha a transação**; órfão é o defeito que esta task existe para impedir.
- [ ] **T022** Smoke ponta a ponta: anexar, ver na lista, revelar, substituir, remover.
- [ ] **T023** `docs/SECURITY.md` registra que o documento vive enquanto a ficha viver — e que ficha
      é desativada, não removida.
