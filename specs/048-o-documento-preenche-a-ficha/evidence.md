# 048 — O documento preenche a ficha · evidência

> Fase CRLV concluída em 2026-08-26. **As fases CNH e ANTT não foram implementadas** — a spec tem
> `[NEEDS CLARIFICATION]` para as duas, e sem amostra não se escreve mapa de campo.

## O que rodou

| Comando                                                     | Resultado                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `bun run --cwd apps/frontend-transportada test`             | **2012 contratos**, 0 falhas — 41 deles novos (37 de leitura de documento, 4 de placa) |
| `bun run --cwd apps/frontend-transportada typecheck`        | limpo                                                                                |
| `bun run --cwd apps/frontend-transportada lint`             | limpo                                                                                |
| `bun run --cwd apps/frontend-transportada build`            | `built in 2.87s`                                                                     |
| `cd apps/frontend-transportada && ENV_FILE=../../.env bun run smoke` | **36 smokes**, 0 falhas — 2 novos                                            |

## O que cada verificação provou

| Item                                                                    | Evidência                                                                                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A CSP **não mudou** (§ "o produto lê o PDF sem afrouxar nada")          | `dist/content-security-policy.txt` sai do build com `script-src 'self'` (sem `unsafe-eval`), `worker-src 'self'` (sem `blob:`) e `connect-src` intocado |
| O pdf.js roda sem `eval`                                                | `isEvalSupported: false` em `readPdfTextLayer`; os 37 contratos extraem texto com ele ligado                                                          |
| O worker é da nossa origem                                              | `dist/assets/pdf.worker.min-*.mjs` (1,26 MB) emitido pelo Vite via `?url` — nenhuma CDN, nenhum `blob:`                                               |
| O custo não cai em quem digita                                          | `pdf-*.js` (434 kB, 129 kB gzip) e o worker saem em **chunk próprio**, carregados por `import()` só quando um arquivo é solto                        |
| A ordem de leitura não serve                                            | contrato "lê o valor da coluna do rótulo, não o rótulo seguinte" — `PLACA`/`EXERCÍCIO` lado a lado, cada um com o próprio valor                       |
| O CRLV contém "CNH" e continua sendo CRLV                               | o PDF do teste imprime o rodapé promocional da CDT por extenso; o documento é classificado pelo título                                                |
| Palavra solta não classifica                                            | página só com o rodapé da CDT → `unknown`; título fora do topo → `unknown`                                                                            |
| O que não fecha não se preenche                                         | CPF com dígito trocado → campo vazio + `checkDigitFailed`                                                                                             |
| Capacidade não sai do PBT                                               | contrato exige a ausência do campo **e** a ressalva `notPrinted`                                                                                      |
| `EIXOS` com `*` vira vazio, nunca `0`                                   | contrato próprio                                                                                                                                     |
| O encanamento do navegador                                              | smoke: PDF entregue ao `input[type=file]` da tela real, placa e RENAVAM chegam preenchidos, a marca "veio do documento" aparece e some ao editar      |
| Placa repetida abre a ficha existente (P2)                              | smoke com a **listagem vazia** e o veículo só na consulta por placa — o caso que a busca em memória perderia                                          |

O smoke foi o que pegou o defeito que typecheck e contrato não pegariam: o seletor de campo colidindo
com o filtro da tabela (dois elementos com nome acessível "Placa"). Nenhuma verificação estática
acusaria — o produto compilava e os 2012 contratos passavam.

## O que ficou de fora, e é para a próxima pessoa saber

1. **Nenhum CRLV real foi lido nesta verificação.** Os dois arquivos medidos em 19–20/08 (`GCQ8E47`,
   `FFV2D95`) não estão versionados: são documentos de veículo com CPF de proprietário impresso, e a
   § Privacidade da spec recusa PII no repositório. O teste gera um PDF **de verdade**, com camada de
   texto de verdade, lido pelo pdf.js de verdade — prova bytes → fragmento → geometria → campo. O que
   ele **não** prova é que os rótulos do Detran são exatamente os que o mapa espera. **A conferência
   com um arquivo real é manual e ainda não foi feita.** Se um rótulo divergir, o campo virá vazio —
   nunca errado, porque o casamento é por igualdade de rótulo.
2. **CNH e ANTT não existem.** `identifyDocumentKind` só conhece CRLV; qualquer outro documento é
   `unknown`, e `owner.rntrc` e `owner.taxRegime` continuam sendo digitação do operador.
3. **OCR de imagem não existe.** PDF sem camada de texto é reconhecido e nomeado (`scanned`), com o
   cadastro manual intacto — mas nada é extraído dele. É a P3 da spec, e continua aberta.
4. **A marca de origem cobre os campos de texto e de seleção**, não os quatro que usam componente
   próprio (marca, modelo, cor, e o proprietário, que vem do seletor de motorista). Esses aparecem na
   lista "Preenchido pelo documento" da área de leitura, não com etiqueta no campo.
5. **O worker do pdf.js não entra no precache do PWA** (1,26 MB). Ler documento offline não funciona;
   o cadastro manual, sim.
6. **`DIESEL` preenche `diesel-s10` com ressalva.** O documento não distingue S10 de S500, e o
   catálogo não tem "diesel" genérico. O padrão da frota entra, e a ressalva vai à tela — mas é uma
   escolha nossa, não uma leitura.

## Auditoria de segurança (§15 do `code-standart.md`)

- O arquivo **não sai da máquina**: `File` → `ArrayBuffer` → pdf.js. Nenhuma requisição nova, nenhuma
  origem nova na CSP, nada gravado em bucket, nenhuma coluna nova.
- **Nenhum log**, em nível nenhum. O `catch` do hook descarta o erro de propósito: a mensagem do
  pdf.js carrega trecho do arquivo, e o arquivo é PII.
- Nenhum valor arbitrário na tela: os estilos novos usam `--color-*` e `--space-*` (§8 do `web.md`).
- Nenhum texto na tag: escopo `documentIntake` com paridade de chaves travada por contrato.
