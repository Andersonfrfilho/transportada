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

- Monorepo pnpm + Turborepo.
- TypeScript estrito, sem `any`.
- Monólito modular: `apps/api`, `apps/worker`, `apps/web`.
- NestJS, Next.js, PostgreSQL, Prisma, Redis/BullMQ e storage S3 compatível.
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

- OpenCode gratuito: exploração, documentação, testes simples e tarefas
  mecânicas pequenas.
- Codex Terra (`gpt-5.6-terra`, medium): implementação padrão.
- Codex Sol (`gpt-5.6-sol`, high): arquitetura, fiscal, concorrência,
  segurança, migrations críticas e revisão de release.
- Codex Luna (`gpt-5.6-luna`, low): mudanças repetitivas e documentação curta.

Se o modelo econômico falhar duas vezes no mesmo critério, escale; não consuma
contexto repetindo a mesma tentativa.

## Proibições

- Não inventar regra legal ou método do pacote fiscal.
- Não fazer deploy em production sem gates e aprovação humana.
- Não criar migration destrutiva automaticamente.
- Não misturar dados de tenants, ambientes fiscais ou buckets.
- Não marcar task concluída sem evidência de teste.
