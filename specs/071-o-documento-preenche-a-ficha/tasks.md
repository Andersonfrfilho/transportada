# 071 — Tasks

✅ **Liberada.** Nenhum `[NEEDS CLARIFICATION]` aberto na `spec.md`.

⚠️ A fase 1 depende de um **release do `adatechnology-packages`** — ver a decisão de código
partilhado na `spec.md`.

## Fase 0 — O pacote

> 🤖 Modelo: `opus` 🧠 — atravessa dois repositórios

- [ ] T001 ADR registrando a decisão de pacote e a forma neutra que ele expõe
- [ ] T002 `readCrlv` no `@adatechnology/document-intake`, devolvendo campos do documento e **não**
      `FleetVehicleFormState` — repositório `adatechnology-packages`
- [ ] T003 `extractCnhFields` e o cliente do `tesseract-server` no mesmo pacote
- [ ] T004 Versão publicada e instalada na api, no worker, no painel e na landing
- [ ] T005 O painel passa a consumir o parser do pacote e a cópia local sai

## Fase 1 — O CRLV preenche o que ele diz

> 🤖 Modelo: `sonnet`

- [ ] T006 Campo de CRLV na landing, lendo local e enviando o rascunho
- [ ] T007 Merge pelo mapa da spec, atravessando bloco — Veículo, nome, documento e cidade
- [ ] T008 Contratos: preenche só o vazio; proprietário divergente avisa e não corrige; documento de
      outro tipo não preenche nada

## Fase 2 — Os documentos abrem o formulário

> 🤖 Modelo: `sonnet`

- [ ] T009 Etapa de documentos no topo, um campo por tipo, todos opcionais
- [ ] T010 O bloco Empresa passa a aparecer pelo CNPJ lido **ou** digitado
- [ ] T011 O CCMEI passa a preencher também o bloco Endereço e o campo de documento
- [ ] T012 Contratos: a ordem da tela e a lista de anexos com estado por linha

## Fase 3 — Os tipos novos e o OCR da CNH

> 🤖 Modelo: `sonnet` (T015 é 🧠 — amplia o trilho da 070)

- [ ] T013 Tipos novos na fronteira (`address_proof`, documento da empresa) — CHECK, Zod e catálogo
      dos dois lados
- [ ] T014 Campos de CNH e comprovante enviando; o comprovante **não escreve campo nenhum**
- [ ] T015 O consumidor da 070 escolhe entre camada de texto e OCR pelo tipo e pela assinatura, e
      alcança o `tesseract-server`
- [ ] T016 Campos lidos da CNH aparecem na revisão do operador, nunca no formulário do candidato
- [ ] T017 A fila de revisão aceita os tipos novos sem rótulo cru

## Gates de toda task

- `bun run format:check`, `lint`, `typecheck` na raiz
- contrato antes da implementação
- evidência em `evidence.md`
