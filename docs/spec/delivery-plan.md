# Plano de entrega

## Fases

| Fase | Objetivo               | Entregável / gate                                 |
| ---- | ---------------------- | ------------------------------------------------- |
| 0    | fundação Bun           | apps separáveis, CI, health, Docker, ADRs         |
| 1    | identidade e tenant    | auth/RBAC + prova de isolamento                   |
| 2    | empresas/fiscal config | certificado criptografado e sequência             |
| 3    | NF-e                   | upload/ZIP, storage, parser, duplicidade, jobs    |
| 4    | frete                  | regra percentual versionada, snapshot e simulação |
| 5    | lote/CT-e              | aprovação, idempotência, worker e gateway mock    |
| 6    | homologação CT-e       | pacote Ada, rejeição/retry, XML/protocolo         |
| 7    | faturamento            | seleção segura, totais, PDF e cancelamento        |
| 8    | painel/auditoria       | UI ponta a ponta, SSE e trilha                    |
| 9    | hardening/release      | carga, segurança, backup e runbooks               |

Cada fase possui demo independente, migration reversível e testes de aceite.

## Backlog por épico

- E01 Plataforma: workspace, config, CI, observabilidade.
- E02 IAM: login, roles, permissions, contexto de empresa.
- E03 Empresas: cadastro, settings, certificado e ambiente.
- E04 NF-e: distribuição, upload, normalização e consulta.
- E05 Frete: regras, vigência, cálculo e snapshots.
- E06 CT-e: lotes, sequência, emissão, eventos e reprocessamento.
- E07 Billing: elegibilidade, fatura, PDF, exportação e e-mail.
- E08 Operação: dashboard, jobs, auditoria, alertas e runbooks.

## Definition of Done

- critérios da spec automatizados quando possível;
- TypeScript strict, lint, unit e integração verdes;
- teste de tenant negativo;
- migrations e rollback revisados;
- logs sem segredo e métricas relevantes;
- OpenAPI e documentação atualizados;
- evidência anexada à task; revisão Sonnet/Opus conforme risco.

## Primeira sequência executável

1. preservar `specs/001-foundation` como baseline histórico;
2. concluir `002-bun-foundation-migration`;
3. criar `003-tenant-auth`;
4. criar `004-company-fiscal-settings`;
5. criar `005-nfe-xml-import`;
6. só então iniciar frete e emissão.
