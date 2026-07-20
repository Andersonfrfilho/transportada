# Evidência — Importação e distribuição de NF-e

## T001 — ADRs, spec, plano e decomposição

Data: 2026-07-20

### Escopo executado

- mapeamento read-only da arquitetura existente por Graphify;
- confirmação independente dos padrões de auth/tenant, router, Drizzle,
  RabbitMQ, worker, Makefile e apps separáveis;
- inspeção do contrato público instalado de
  `@adatechnology/fiscal-provider@0.1.0`;
- inventário estrutural seguro de `example/`, sem imprimir payload ou copiar
  dados para fixtures;
- criação de spec, plano, 31 tasks e dois ADRs;
- definição de modelos por risco e de gates exclusivamente locais.

### Evidência do package fiscal

O artefato instalado, usado como fonte normativa, confirma:

- `importarNfeXml(xml: string): DfeItem`;
- `NfeDistribuicaoProvider` separado de `FiscalProvider`;
- `consultarDFe`, `consultarPorNsu`, `consultarPorChave`, `importarXml` e
  `consultarCnpj`;
- config `model: 'nfe-distribuicao'` com CNPJ, UF, ambiente e A1;
- cursor inicial `000000000000000`, páginas de até 50, `ultNSU`, `maxNSU` e
  `temMais`;
- filtros locais, proteção vazia/anti-656 apenas em memória e ausência de
  persistência/idempotência/tenant no provider;
- `DfeItem` possui resumo/XML, mas não toda a normalização exigida pelo
  `PROJECT.MD`;
- o checkout não possui contract público específico de importação/distribuição
  NF-e.

Arquivos inspecionados:

```text
node_modules/.bun/@adatechnology+fiscal-provider@0.1.0/
  node_modules/@adatechnology/fiscal-provider/dist/index.d.ts
  node_modules/@adatechnology/fiscal-provider/dist/types.d.ts
  node_modules/@adatechnology/fiscal-provider/dist/providers/NfeDistribuicaoProvider.d.ts
../adatechnology-packages/packages/backend/fiscal-provider/package.json
../adatechnology-packages/packages/backend/fiscal-provider/test/contract/
  fiscal-provider.contract.test.ts
```

Nenhum internal `src/sefaz/*` foi adotado como dependência do projeto.

### Evidência da arquitetura atual

- router autentica e resolve `CompanyContext` antes de autorizar/parsear rotas;
- permissões `invoices.import` e `invoices.read` já existem na matriz;
- migrations são explícitas e schemas/queries existentes filtram empresa;
- RabbitMQ provider e worker sintético já provam main, retry/DLX, DLQ, confirm,
  prefetch e shutdown;
- o efeito/idempotência sintético atual usa memória e foi explicitamente
  rejeitado para jobs reais;
- MinIO/config S3 existem, mas nenhum provider/storage module foi encontrado;
- não existem tabelas, rotas, outbox, NF-e, cursor NSU ou consumers da feature;
- frontend é Vite e não existe requisito de SSR/SEO que justifique Next.js;
- apps possuem manifests, scripts, builds e composition roots independentes.

### Decisões registradas

- `docs/adr/0006-immutable-fiscal-xml-object-storage.md`;
- `docs/adr/0007-nfe-outbox-idempotency-and-distribution-cursor.md`;
- `@adatechnology/object-storage-provider` será criado no repositório de
  packages;
- package fiscal será evoluído de modo aditivo antes de qualquer schema/app que
  dependa da normalização;
- API grava outbox; worker executa relay/consumers com estado persistente;
- importação e distribuição possuem topologias RabbitMQ separadas e
  versionadas;
- XML original fica em S3/MinIO, nunca no envelope/log/cache;
- frontend permanece Vite;
- nenhuma SEFAZ, PFX, Railway ou infraestrutura remota participa desta task.

### Revisão Sol independente

A primeira revisão encontrou cinco inconsistências, todas corrigidas:

- uniques de outbox/mensagem agora incluem empresa;
- tenant/ator do envelope são claims não autoritativos e precisam coincidir com
  o agregado persistido;
- T019 depende do schema que contém a agenda de backoff;
- pack fiscal exige compatibilidade Bun real, sem presumir ESM inexistente;
- mudança no boundary do router recebe revisão Sol.

A revalidação encontrou três lacunas adicionais, também corrigidas:

- NSU/ambiente possuem persistência e unique parcial tenant-scoped, com testes
  de página sobreposta/replay;
- object storage exige create-only, conflito por hash e reconciliador com lease
  que nunca remove objeto final;
- T010 depende do contract fiscal empacotado e T024 depende da versão publicada
  e pinada.

A revisão Sol final declarou zero bloqueador ou achado alto remanescente.

### Delegação e revisão

- Codex Terra medium: inventários read-only delimitados de arquitetura e
  contrato público;
- Codex Sol high: cruzamento das evidências e decisões fiscal, tenant, storage,
  concorrência, filas e release;
- OpenCode/Luna ficam reservados a tarefas mecânicas futuras conforme
  `tasks.md`; nenhuma decisão crítica será delegada a modelo econômico.

### Gates

| Comando                                                   | Resultado |
| --------------------------------------------------------- | --------- |
| `graphify query "...feature 005..." --budget 2500`        | aprovado  |
| `bunx prettier --check docs/adr specs/005-nfe-xml-import` | aprovado  |
| `git diff --check`                                        | aprovado  |
| busca de decisão bloqueante na spec                       | zero      |
| inventário de tasks/requisitos                            | 31 / 24   |

T001 está concluída com gates documentais verdes.

## T002 — Contracts públicos de normalização NF-e

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
da8693f test(fiscal-provider): define nfe xml import contract
```

Arquivos:

```text
packages/backend/fiscal-provider/test/contract/nfe-import.contract.test.ts
packages/backend/fiscal-provider/test/fixtures/nfe-xml.fixture.ts
```

O contract usa apenas NF-e 4.00 sintética e fixa o comportamento público de
`importarNfeXml`:

- retorno discriminado para `nfeProc` autorizada, `NFe` sem protocolo e
  `procEventoNFe`;
- preservação do resumo `DfeItem` existente;
- documento normalizado com emitente, destinatário, transportador, endereços,
  produtos, volumes, protocolo e informações adicionais;
- todos os valores monetários, quantidades e pesos normalizados como strings
  decimais;
- chave de 44 dígitos válida e coerente entre `infNFe` e protocolo;
- lista de CNPJs relacionados;
- zero I/O de rede para importação local;
- erros estáveis e seguros para DTD/ENTITY, raiz não suportada, chave
  inválida/divergente e XML acima de 5 MiB.

### Evidência vermelha esperada

| Gate                                                                   | Resultado esperado                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `bun test test/contract/nfe-import.contract.test.ts`                   | 1 passou, 8 falharam nas capacidades novas                                |
| `bun run test:contract`                                                | 6 passaram, 8 falharam; os 5 contracts CT-e existentes continuaram verdes |
| `bunx prettier --check test/contract/... test/fixtures/...`            | aprovado                                                                  |
| `git diff --cached --check`                                            | aprovado                                                                  |
| inclusão pelo script agregado `test:contract = bun test test/contract` | confirmada                                                                |

O RTK resumiu corretamente os contadores, mas retornou exit code zero para o
teste vermelho e roteou `rtk diff --check` ao utilitário `diff`. Por isso os
gates de falha/whitespace foram repetidos com Bun/Git brutos.

Nenhum source, manifest, lockfile, XML real, certificado ou arquivo sujo
preexistente entrou no commit. O commit vermelho permanece apenas local até a
T003 deixá-lo verde; assim a branch remota não recebe uma pipeline
intencionalmente quebrada.

## T003 — Importação NF-e normalizada e aditiva

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
8f478ec feat(fiscal-provider): normalize imported nfe xml
```

O contrato público existente `importarNfeXml` foi preservado e ampliado de
forma aditiva. O retorno continua compatível com `DfeItem` e agora é uma união
discriminada que separa NF-e autorizada, NF-e sem protocolo e evento.

Arquivos de implementação:

```text
packages/backend/fiscal-provider/src/errors/NfeXmlImport.error.ts
packages/backend/fiscal-provider/src/providers/NfeXmlImporter.service.ts
packages/backend/fiscal-provider/src/providers/NfeDistribuicaoProvider.ts
packages/backend/fiscal-provider/src/types.ts
packages/backend/fiscal-provider/src/index.ts
```

Comportamentos verificados:

- normalização integral do contrato sintético sem I/O de rede;
- dinheiro, quantidades e pesos preservados como strings decimais;
- limite público de 5 MiB antes do parse;
- rejeição de DTD/ENTITY, raiz não suportada e chave inválida/divergente;
- chave de acesso validada inclusive pelo dígito verificador;
- protocolo de autorização vinculado somente à mesma chave da NF-e;
- resposta de evento vinculada somente quando `chNFe`, `tpEvento` e
  `nSeqEvento` coincidem com a solicitação;
- erros fiscais especializados com códigos estáveis e mensagens sem payload;
- exports disponíveis exclusivamente pela raiz pública do package;
- compatibilidade CommonJS/Bun existente preservada.

### Revisão Sol independente

A revisão encontrou um P1: um `procEventoNFe` adulterado poderia combinar a
identidade de `evento.infEvento` com protocolo/status de
`retEvento.infEvento`. A implementação passou a exigir igualdade exata dos
três campos de identidade e o contract ganhou regressão individual para cada
divergência. A revalidação declarou zero P0/P1 remanescente.

### Gates

| Comando                                              | Resultado             |
| ---------------------------------------------------- | --------------------- |
| `bun run check`                                      | aprovado              |
| `bun test test/contract/nfe-import.contract.test.ts` | 10 passaram, 0 falhou |
| `bun run test:contract`                              | 15 passaram, 0 falhou |
| `bun test`                                           | 15 passaram, 0 falhou |
| `bun run build`                                      | aprovado              |
| `bunx prettier --write <arquivos T003>`              | aprovado              |
| `git diff --cached --check`                          | aprovado              |
| smoke do `dist` pela raiz pública                    | aprovado              |

Nenhum manifest, lockfile, XML real, certificado ou alteração preexistente foi
incluído no commit.

## T004 — Pack e consumo Bun limpo do fiscal-provider

Data: 2026-07-20

Commit local no repositório `adatechnology-packages`:

```text
b8be05e test(fiscal-provider): verify clean bun package consumption
```

O package agora executa `bun run build` no lifecycle `prepack` e expõe o gate
`test:package`. O contract de distribuição:

- remove temporariamente `dist/` para provar que o pack não depende de
  artefato residual;
- preserva e restaura integralmente qualquer `dist/` preexistente;
- valida no dry-run a presença de `dist/index.js` e `dist/index.d.ts`;
- rejeita source `src/` no conteúdo publicado;
- gera o tarball real em diretório temporário;
- instala o `.tgz` com Bun em consumidor isolado;
- faz typecheck de valor e tipo importados somente pela raiz pública;
- executa a raiz empacotada e confirma resolução dentro do `node_modules` do
  consumidor, nunca para o checkout;
- remove tarball, consumidor e backups temporários no cleanup.

### Delegação e revisão

Codex Terra medium produziu a primeira versão. A revisão do agente principal
encontrou falsos positivos de lifecycle, typecheck, descoberta do teste e
timeout, assumiu a implementação após a execução delegada ficar sem resposta e
fechou os gates. A revisão Sol encontrou um P1 de higiene porque o primeiro
teste removia `dist/` sem restaurá-lo. O cleanup foi corrigido com
backup/restauração e a revalidação declarou zero P0/P1.

### Gates

| Comando                        | Resultado             |
| ------------------------------ | --------------------- |
| `bunx prettier --check ...`    | aprovado              |
| `bun run check`                | aprovado              |
| `bun run test:contract`        | 15 passaram, 0 falhou |
| `bun run test:package`         | 1 passou, 0 falhou    |
| `bun run build`                | aprovado              |
| `npm pack --dry-run --json`    | aprovado              |
| hashes de `dist/` antes/depois | idênticos             |
| `git diff --cached --check`    | aprovado              |

Nenhuma versão foi alterada ou publicada e nenhum lockfile entrou no commit.
