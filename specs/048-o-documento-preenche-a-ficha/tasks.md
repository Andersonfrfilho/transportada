# 048 — O documento preenche a ficha · tasks

> **Só a Fase CRLV anda.** A spec tem dois `[NEEDS CLARIFICATION]` abertos (amostra de CNH e de
> carteira ANTT). Nada de motorista e nada de RNTRC se implementa aqui — sem arquivo não se escreve
> mapa de campo, e mapa escrito de cabeça é o que faz o formulário de motorista abrir com dado de
> veículo.

## Estado das dependências (verificado no código, 2026-08-26)

| Dependência                                     | Estado                                | Consequência para esta spec                                                                                                                              |
| ----------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aggregate-document-ocr` (API)                  | ✅ existe                             | **Não é reaproveitável aqui.** É gateway HTTP para OCR de terceiro, no backend. A 048 é o oposto: o PDF não sai da máquina do operador (§ Privacidade). |
| `checkDigit.service.ts` (T001)                  | ✅ feito                              | O verificador que decide o que não se preenche já está no módulo, com 17 contratos.                                                                      |
| `FleetVehicleFormState`                         | ✅ existe                             | É o alvo do mapeamento. `tareWeightKilograms` existe no formulário, mas o CRLV **não imprime tara** — ver T006.                                          |
| Amostra de CRLV-e em PDF                        | ⛔ não está no repositório            | As medições de 19–20/08 estão na spec; os arquivos, não. A verificação usa PDF **gerado** com a geometria medida — ver § Buraco declarado.               |

## Buraco declarado, e por que ele não invalida a fase

Os dois CRLV-e medidos (`GCQ8E47`, `FFV2D95`) não estão versionados — são documentos de veículo real,
com CPF de proprietário, e commitar PII num repositório é exatamente o que a § Privacidade da spec
recusa. A verificação desta fase roda contra um **PDF gerado no teste**, com camada de texto de
verdade, lido pelo pdf.js de verdade: prova o encanamento inteiro (bytes → fragmento → geometria →
campo), e não prova que o layout gerado é idêntico ao do Detran. Essa última milha é conferência
manual com um arquivo real, e entra no `evidence.md` como o que ficou de fora.

## Fase 0 — O que não fecha não se preenche

> 🤖 Modelo: `sonnet`

### T001 ✅ — Dígito verificador e formatos fechados

CPF, CNPJ alfanumérico (IN RFB 2229/2024), RENAVAM, placa, chassi e UF. Entregue em `f4ed14d`.

- **Arquivos:** `src/modules/document-intake/shared/checkDigit.service.ts`
- **Aceite:** `111.111.111-11` recusado; CNPJ com letra na base aceito; chassi com `I`/`O`/`Q` recusado
- **Verificação:** `bun run --cwd apps/frontend-transportada test` (17 contratos)

## Fase 1 — A leitura, que é geométrica ou não é

> 🤖 Modelo: `opus` 🧠 (T002 decide build, worker e CSP; errar aqui quebra a política publicada)

### T002 🧠 — O PDF vira fragmento com posição

`pdfjs-dist` lendo `ArrayBuffer` e devolvendo `{ text, x, y, height }` por fragmento, com
`isEvalSupported: false` (a CSP publicada é `script-src 'self'`) e o worker servido da **nossa
origem** — `worker-src 'self'` já está publicado, e CDN é proibida.

Três coisas que só aparecem com a biblioteca na mão, não no papel:

- o build padrão do pdf.js 6 **quebra em Node** (`DOMMatrix is not defined`); teste usa `legacy/`,
  bundle usa o normal — e o serviço recebe o carregador por parâmetro para os dois caberem;
- `getTextContent()` devolve fragmentos de string **vazia** (marcas de posicionamento), que entram na
  conta geométrica como vizinho fantasma se não forem descartados;
- PDF sem camada de texto devolve zero caractere. Isso não é erro: é o caso `scanned` da P3, que a
  tela nomeia em vez de fingir que leu.

- **Arquivos:** `src/modules/document-intake/shared/pdfTextLayer.service.ts`
- **Aceite:** PDF gerado com texto em coordenada conhecida devolve os fragmentos naquela coordenada; PDF sem texto devolve `scanned`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T003 — Rótulo casa com valor por geometria

`PLACA` seguido de `EXERCÍCIO` em ordem de leitura é o motivo de a ordem não servir. O valor de um
rótulo é o fragmento **abaixo** dele (até 26pt), **alinhado** na horizontal (menos de 6pt de
distância entre os inícios), e o mais próximo vence.

- **Arquivos:** `src/modules/document-intake/shared/labelGeometry.service.ts`
- **Aceite:** com dois rótulos lado a lado, cada um recebe o valor da própria coluna; valor a 30pt não casa
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

## Fase 2 — Que documento é aquele, e o que ele diz

> 🤖 Modelo: `sonnet`

### T004 — A identificação é pelo título, no topo

`CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO` no terço superior da página → CRLV-e. Nada
casou → `unknown`, e o produto diz isso. O contrato que trava a regressão é o rodapé promocional da
CDT: um CRLV **contém a palavra "CNH"**, e classificador por palavra solta chama todo CRLV de
habilitação.

- **Arquivos:** `src/modules/document-intake/shared/documentKind.service.ts`
- **Aceite:** CRLV com "CNH" no rodapé é reconhecido como CRLV; página sem título conhecido é `unknown`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T005 — O CRLV vira ficha de veículo

Mapa rótulo → campo, com as normalizações: `MARCA / MODELO / VERSÃO` parte no **primeiro** `/`,
`BRANCA` → `branca`, `ALCOOL/GASOLINA` → flex, `FURGAO` → tpCar `02`, UF fechada em 27.

O que ele **não** preenche, e o motivo, é tão normativo quanto o que ele preenche:

- **`capacityKilograms` não sai do PBT.** O CRLV imprime peso bruto total (tara + carga) e não
  imprime a tara. Capacidade é PBT menos tara; faltando metade da conta, campo em branco.
- **`EIXOS` pode vir `*`** — o Detran não informou. Asterisco é campo vazio, nunca `0`.
- Campo cujo dígito verificador não fecha fica vazio **com o motivo à vista** (P1).

- **Arquivos:** `src/modules/document-intake/shared/crlvVehicle.service.ts`
- **Aceite:** os 16 campos medidos mapeados; PBT ignorado; `*` em eixos vira vazio; CPF inválido vira motivo
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T006 — O orquestrador: arquivo entra, ficha e avisos saem

`File` → `ArrayBuffer` → fragmentos → tipo → campos + avisos. Um caso de uso, sem React, sem rede e
sem log de PII — nem em `debug`.

- **Arquivos:** `src/modules/document-intake/shared/documentIntake.service.ts`
- **Aceite:** CRLV gerado devolve campos e tipo; PDF vazio devolve `scanned`; PDF de outro documento devolve `unknown`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

## Fase 3 — A tela

> 🤖 Modelo: `sonnet`

### T007 — O hook que lê o arquivo

Estado da leitura (ocioso, lendo, lido, não reconhecido, imagem), o resultado e o erro. Nada de
`useEffect` para carregar: é evento de arquivo solto.

- **Arquivos:** `src/modules/document-intake/hooks/useDocumentIntake.hook.ts`
- **Aceite:** o hook não importa React fora de `useState`; leitura falha não derruba a tela
- **Verificação:** contrato + smoke da T010

### T008 — A área de soltar, e a marca de origem

Área de arrastar-e-soltar (com botão de escolher arquivo, porque arrastar não é acessível por
teclado) no topo do formulário de veículo. O que veio do documento chega **marcado**; editar o campo
à mão apaga a marca, porque a partir daí o dado é do operador.

- **Arquivos:** `src/modules/document-intake/components/DocumentIntakeDropZone.component.tsx`, `src/modules/fleet/components/VehicleForm.component.tsx`, `VehicleIdentityFields`, `VehicleModelFields`, `VehicleOperationFields`, `VehicleOwnerFields`, `FleetField.component.tsx`, `hooks/useVehicleForm.hook.ts`
- **Aceite:** teclado alcança o seletor de arquivo; marca some ao editar o campo; nenhum valor hardcoded (tokens do §8)
- **Verificação:** contrato + smoke da T010

### T009 — Texto em pt e en

Nenhum texto na tag. Escopo próprio (`documentIntake.locale.json`), com paridade de chaves.

- **Arquivos:** `src/modules/document-intake/locales/documentIntake.locale.json`, `documentIntake.en.locale.json`
- **Aceite:** as duas línguas com o mesmo conjunto de chaves
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

## Fase 4 — A verificação que exercita o caminho real

> 🤖 Modelo: `sonnet`

### T010 — Smoke: o operador solta o PDF e a ficha se preenche

Playwright no painel, com um CRLV gerado em memória e entregue ao `input[type=file]`. É o teste que
pega o que typecheck e contrato não pegam: hook depois de `return`, worker que não carrega, campo que
não recebe o valor.

- **Arquivos:** `test/responsive.smoke.spec.ts` (ou cena própria de document-intake)
- **Aceite:** placa e RENAVAM aparecem preenchidos na tela depois de soltar o arquivo
- **Verificação:** `cd apps/frontend-transportada && ENV_FILE=../../.env bun run smoke`

### T011 — `evidence.md`

O que rodou, o que passou e **o que ficou de fora**: a conferência contra CRLV real, a fase de CNH, a
fase de ANTT e o OCR de imagem.

- **Arquivos:** `specs/048-o-documento-preenche-a-ficha/evidence.md`
- **Aceite:** revisão humana
- **Verificação:** —
