# ADR 0003 — Matriz RBAC conservadora

- Status: aceito
- Data: 2026-07-19
- Decisores: mantenedor do projeto e revisão Codex Sol

## Contexto

O projeto lista roles fixas e permissões do MVP, mas não autoriza
`company-admin` a executar automaticamente operações fiscais ou financeiras.
Inferir acesso amplo pelo nome da role violaria o princípio de menor privilégio
e dificultaria separar responsabilidades em empresas maiores.

Também existem permissões com semântica ainda limitada:

- `users.manage` administra somente memberships locais; administração de
  usuários no Keycloak continua fora do escopo;
- `invoices.*` representa NF-e, enquanto `billing.*` representa faturamento;
- operações que exigem múltiplas permissões ainda não possuem semântica
  `allOf`/`anyOf` definida.

## Decisão

1. `platform-admin`, em `PlatformContext`, recebe somente `companies.manage`.
2. `company-admin` recebe gestão local, configurações, auditoria e leituras,
   mas nenhuma emissão, cancelamento, importação ou faturamento por implicação.
3. `finance` recebe leitura de CT-e e criação, cancelamento e leitura de
   faturamento.
4. `fiscal` recebe importação/leitura de NF-e, lotes, simulação e emissão,
   cancelamento e leitura de CT-e.
5. `operator` recebe importação/leitura de NF-e, criação de lotes, simulação e
   leitura de CT-e, sem aprovação, emissão ou cancelamento.
6. `viewer` recebe somente leitura de NF-e e CT-e.
7. Múltiplas roles locais produzem a união determinística das permissões.
8. Ausência de política, incompatibilidade de escopo e permissão não concedida
   falham com o mesmo `403 FORBIDDEN`.
9. Toda permissão não declarada explicitamente permanece negada.

## Consequências

- Empresas podem combinar roles para separar ou acumular responsabilidades sem
  transformar `company-admin` em superusuário operacional.
- `platform-admin` nunca acessa dados tenant sem uma membership local ativa.
- Ampliar uma role ou introduzir `allOf`/`anyOf` exige nova decisão e contratos.
- A matriz é tipada, exaustiva, congelada e versionada junto da API.

## Segurança e rollback

Claims de roles tenant do JWT não participam da matriz. As permissões nascem
somente das roles da membership ativa no PostgreSQL.

Rollback reverte o commit da matriz antes de qualquer rota depender das novas
permissões. Depois que consumidores existirem, a correção deve ser aditiva e
revisada para não conceder acesso silencioso.
