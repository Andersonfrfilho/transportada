# 043 — Tarefas

## Fase 1 — Domínio da API

> 🤖 Modelo: `sonnet`

- [x] **T001** — Contrato do endereço completo.
      `test/nfse-domain/taker-address.contract.ts`, importado por `test/nfse-domain.contract.test.ts`:
      completo canonicaliza; CEP mascarado perde a máscara e UF em caixa baixa sobe; complemento e
      telefone ausentes viajam vazios; participante sem linha, campo obrigatório em branco, CEP fora de
      oito dígitos e UF que não é sigla devolvem `null`.
      **Aceite:** vermelho registrado.

- [x] **T002** — `nfse-taker-address.policy.ts`.
      `NfsePartyAddress` (oito campos anuláveis, como o banco devolve) → `NfseTakerAddress` (oito
      campos resolvidos) ou `null`. Nenhum I/O.
      **Aceite:** T001 verde.

- [x] **T003** — Bloqueio na seleção.
      `NFSE_SELECTION_BLOCK_REASON.missingTakerAddress`; `NfseSelectionDocument` ganha
      `recipientAddress`/`senderAddress`; `selectNfseCandidates` resolve pelo `taker` do perfil e
      bloqueia antes de virar candidato. Suíte de seleção cobre os dois papéis.
      **Aceite:** `nfse-domain` verde.

- [x] **T004** — Projeção carrega o endereço.
      `NfseProjectionDocument` e `NfseProjection` ganham `takerAddress`; `projectGroup` usa o da
      primeira nota — o grupo é o mesmo CNPJ de tomador, então o endereço é um só.
      **Aceite:** typecheck limpo e `nfse-domain` verde.

---

## Fase 2 — Leitura e congelamento

> 🤖 Modelo: `sonnet`

- [x] **T005** — A query projeta o endereço.
      `loadParties` passa a selecionar `complement · district · number · phone · postalCode · street`
      junto do que já lia; participante sem linha no join vira endereço todo nulo, que a política
      recusa. O join tenant-safe (`companyId` + `participantId`) não muda.
      **Aceite:** typecheck limpo.

- [x] **T006** — `taker.address` no payload congelado.
      `freezeNfseIssuancePayload` grava `taker: { address, legalName, taxId }`, dentro do hash.
      `buildNfseProviderConfig` continua fora.
      **Aceite:** teste de congelamento verde em `nfse-invoices-application`.

---

## Fase 3 — Worker

> 🤖 Modelo: `sonnet`

- [x] **T007** — Contrato do RPS com endereço.
      `test/nfse-fiscal-gateway.contract.test.ts`: os seis campos obrigatórios saem no corpo;
      `Complemento` e `Telefone` são omitidos quando vazios; payload **sem** `taker.address` é
      transmitido e não vira `invalid_payload`.
      **Aceite:** vermelho registrado.

- [x] **T008** — `buildTakerAddressFields` em `nfse-fiscal-gateway.ts`.
      `taker.address` opcional no `payloadSchema`; `buildRps` espalha os campos do bloco. `Cidade` é
      nome e `Estado` é sigla — não códigos IBGE.
      **Aceite:** T007 verde e `nota-rp-parity` intacto.

---

## Fase 4 — Frontend

> 🤖 Modelo: `haiku`

- [x] **T009** — Código novo virando frase.
      `NFSE_DOCUMENT_MISSING_TAKER_ADDRESS → documentMissingTakerAddress` no mapa de feedback, verbete
      acentuado nos dois `*.locale.json`, e o código na lista de `API_ERROR_CODES` do contrato — é ela
      que reprova código sem tradução.
      **Aceite:** `nfse-invoice` e `locale-accents` verdes.

---

## Fase 5 — Produção

> 🤖 Modelo: `sonnet`

- [ ] **T010** — Destravar as 16 notas de Ribeirão Preto (sucede a T017 da 042).
      Com a 043 no ar, **descartar** a fatura rejeitada e emitir de novo. Reemitir não serve: o payload
      congelado dela não tem endereço, e a reemissão o retransmite igual. O descarte devolve as 16 NF-e
      à seleção; a emissão nova nasce com o bloco de endereço.
      Se alguma das 16 sair da seleção com `NFSE_DOCUMENT_MISSING_TAKER_ADDRESS`, o cadastro do tomador
      na NF-e está incompleto — aí o caminho é a origem, não a nota.
      Sem `UPDATE` manual: a correção é ação de produto, com trilha de auditoria.
      **Aceite:** nota autorizada, com número e código de verificação.
