# 071 — Tasks

✅ **Liberada.** Nenhum `[NEEDS CLARIFICATION]` aberto na `spec.md`.

⚠️ A fase 1 depende de um **release do `adatechnology-packages`** — ver a decisão de código
partilhado na `spec.md`.

## Fase 0 — O pacote

> 🤖 Modelo: `opus` 🧠 — atravessa dois repositórios

- [x] T001 ADR registrando a decisão de pacote e a forma neutra que ele expõe
- [x] T002 `readCrlv` no `@adatechnology/document-intake`, devolvendo campos do documento e **não**
      `FleetVehicleFormState` — repositório `adatechnology-packages`
- [x] T003 `extractCnhFields` e o cliente do `tesseract-server` no mesmo pacote
- [x] T004 Versão publicada e instalada na api, no worker, no painel e na landing
- [x] T005 O painel passa a consumir o parser do pacote e a cópia local sai

## Fase 1 — O CRLV preenche o que ele diz

> 🤖 Modelo: `sonnet`

- [x] T006 Campo de CRLV na landing, lendo local e enviando o rascunho
- [x] T007 Merge pelo mapa da spec, atravessando bloco — Veículo, nome, documento e cidade
- [x] T008 Contratos: preenche só o vazio; proprietário divergente avisa e não corrige; documento de
      outro tipo não preenche nada

## Fase 2 — Os documentos abrem o formulário

> 🤖 Modelo: `sonnet`

- [x] T009 Etapa de documentos no topo, um campo por tipo, todos opcionais
- [x] T010 O bloco Empresa passa a aparecer pelo CNPJ lido **ou** digitado
- [x] T011 O CCMEI passa a preencher também o bloco Endereço e o campo de documento
- [x] T012 Contratos: a ordem da tela e a lista de anexos com estado por linha

## Fase 3 — Os tipos novos e o OCR da CNH

> 🤖 Modelo: `sonnet` (T015 é 🧠 — amplia o trilho da 070)

- [x] T013 Tipos novos na fronteira (`address_proof`, documento da empresa) — CHECK, Zod e catálogo
      dos dois lados
- [x] T014 Campos de CNH e comprovante enviando; o comprovante **não escreve campo nenhum**
- [x] T015 O consumidor da 070 escolhe entre camada de texto e OCR pelo tipo e pela assinatura, e
      alcança o `tesseract-server`
- [x] T016 Campos lidos da CNH aparecem na revisão do operador, nunca no formulário do candidato
- [x] T017 A fila de revisão aceita os tipos novos sem rótulo cru

## Estado

✅ **As 17 tasks fechadas**, com evidência em `evidence.md` — o comando que rodou e o número que ele
deu, mais a falsificação de todo teste central que passou de primeira.

⚠️ **A `0.1.0-rc.4` do `@adatechnology/document-intake` não foi publicada.** O pedido foi parar antes
de publicar. As quatro apps já apontam para ela e a versão construída está instalada localmente, o
que faz o gate inteiro rodar; o que **não** roda até a publicação é qualquer alvo que passe por
`bootstrap` (`bun install --frozen-lockfile`), incluindo `make worker-integration`. Ver a última
seção do `evidence.md`.

## Gates de toda task

- `bun run format:check`, `lint`, `typecheck` na raiz
- contrato antes da implementação
- evidência em `evidence.md`
