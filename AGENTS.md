# Regras para agentes

## Ordem de leitura

1. `PROJECT.MD`;
2. `docs/spec/constitution.md`;
3. `docs/spec/README.md`;
4. a pasta da feature em `specs/<id>-<nome>/`;
5. contratos reais de `@adatechnology/fiscal-provider` antes de trabalho fiscal.

## Processo obrigatório

- Trabalhe em uma única task identificada em `tasks.md`.
- Não implemente enquanto a spec tiver marcador `[NEEDS CLARIFICATION]`.
- Registre decisões arquiteturais relevantes em `docs/adr/`.
- Escreva primeiro os testes de aceite ou contrato aplicáveis.
- Preserve o XML fiscal original e nunca registre certificados, senhas ou XML
  sensível em logs.
- Obtenha `companyId` do contexto autenticado. Nunca confie no valor enviado
  livremente pelo cliente.
- Use transações, restrições e idempotência nos limites definidos na spec.
- Ao concluir: typecheck, lint, testes da unidade alterada e testes de
  isolamento multiempresa.

## Arquitetura

- Monorepo com Bun workspaces; Bun é runtime, package manager e test runner.
- TypeScript estrito, sem `any`.
- Aplicações separáveis: `apps/api-transportada`, `apps/worker-transportada` e
  `apps/frontend-transportada`, cada uma com scripts e dependências próprias.
- API HTTP usa `Bun.serve`, baseado internamente em uWebSockets; não importe o
  addon V8 `uWebSockets.js`.
- Frontend usa React, Vite, TanStack Query, `shadcn/ui`, i18n, design tokens e
  PWA.
- Todo app frontend deste repositório deve ser PWA e adotar `shadcn/ui` como
  base de componentes, evitando UI paralela fora do design system salvo ADR.
- Toda tabela com muitas informações (listagens/grids densos) segue o contrato
  obrigatório de `docs/frontend/data-tables.md`: ordenação por cabeçalho,
  filtros multi-valor, filtro simples + avançado (grupos E/OU aninhados,
  operadores por tipo), seleção em massa, reordenação/visibilidade de colunas
  persistida em `localStorage` e evidência de teste de contrato.
- PostgreSQL com Drizzle/Bun SQL, RabbitMQ para jobs críticos e storage S3
  compatível.
- Não crie bibliotecas reutilizáveis neste repositório. Implemente-as e
  versione-as em `/Users/anderson.filho/Documents/personal/adatechnology-packages`.
- Nenhuma aplicação importa código-fonte de outra aplicação.
- Módulos separam `domain`, `application`, `infrastructure` e `presentation`
  quando a complexidade justificar.
- Dinheiro usa `Decimal`/`numeric`, nunca ponto flutuante binário.

## Fiscal

O inventário inicial confirmou no pacote fiscal:

- `FiscalProvider.emit`, `cancel` e `testConnection`;
- `createFiscalProvider({ model: "cte", ... })`;
- tipos `CteConfig`, `CteData`, `FiscalResult` e erros fiscais especializados;
- `NfeDistribuicaoProvider`, `consultarCnpj` e `importarNfeXml`;
- `validateCertificate`;
- emissão CT-e 4.00 síncrona dentro do provider.

Esses nomes são evidência do checkout local inspecionado. Antes de codificar,
confirme a versão instalada e seus `.d.ts`; encapsule tudo em gateways da
aplicação. Não importe internals `src/sefaz/*`.

## Política de modelos

- Haiku (`haiku`, baixo): mudanças repetitivas, documentação curta,
  exploração, testes simples e tarefas mecânicas pequenas.
- Sonnet (`sonnet`, médio): implementação padrão.
- Opus (`opus`, alto): arquitetura, fiscal, concorrência, segurança,
  migrations críticas e revisão de release.

Se o modelo econômico falhar duas vezes no mesmo critério, escale; não consuma
contexto repetindo a mesma tentativa.

## Proibições

- Não inventar regra legal ou método do pacote fiscal.
- Não fazer deploy em production sem gates e aprovação humana.
- Não criar migration destrutiva automaticamente.
- Não misturar dados de tenants, ambientes fiscais ou buckets.
- Não marcar task concluída sem evidência de teste.
