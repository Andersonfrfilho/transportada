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
