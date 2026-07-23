# Feature 007 — Lotes e emissão de CT-e

## Problema e resultado

O TransportAdA já possui importação de NF-e, regras de frete e simulação por
documento, além de contexto de tenant e RBAC. A lacuna atual é transformar
documentos simulados e selecionados em lotes de CT-e com trilha de estado,
controle de concorrência e status de emissão rastreável, sem vazar dados entre
empresas.

O resultado desta feature é permitir que uma empresa:

1. monte e revise lotes de CT-e a partir de NF-es elegíveis;
2. submeta lote para emissão (ou simulação de submissão) com idempotência;
3. acompanhe status em fluxo seguro tenant-scoped;
4. reverta/annule lote em estados permitidos.

Esta feature não cobre homologação fiscal real com emissão autorizada nem
integração de assinaturas avançadas; essas etapas permanecem da fase seguinte.

## Premissas

- Bun continua como runtime de API/worker, PostgreSQL com Drizzle e frontend React/Vite.
- O cálculo de frete permanece como snapshot imutável do valor já calculado.
- `companyId` e identificação de usuário vêm exclusivamente do contexto autenticado.
- CT-e ainda seguirá em mock/adapter controlado por feature flags até revisão de
  homologação formal.
- O XML fiscal original não deve ser persistido em logs, auditoria ou resposta
  de lote.
- A API não deve aceitar escopo via query/body (`companyId`, `platformId`) para
  consultas.

## Fora do escopo

- Emissão real em ambiente de homologação/produção da SEFAZ nesta etapa.
- Cancelamento em massa sem trilha de decisão e sem estado explícito.
- Reprocessamento automático global de falhas já processadas.
- Alteração de regras fiscais de CTe além do contrato de lote.

## Histórias priorizadas

### P1 — Criar e gerenciar rascunho de lote

**História:** Como operador com permissão de lote, quero criar um lote de CT-e com
documentos elegíveis para revisar composição e validar pré-requisitos antes do envio.

1. **WHEN** o usuário cria lote com NF-es elegíveis da empresa **THEN** a API
   deverá persistir versão de rascunho, operador e itens normalizados.
2. **WHEN** houver documento inegível (tenant diferente, status inválido, cálculo faltante)
   **THEN** a criação falha com erro estruturado sem criar lote parcial.
3. **WHEN** lote é criado **THEN** cada item fica com snapshot do cálculo atual.
4. **WHEN** itens são alterados **THEN** rascunho registra revisão/histórico mínimo.

### P1 — Submeter lote para emissão

**História:** Como operador autorizado, quero submeter um lote para emissão
com idempotência para evitar duplicidade por retry de UI/rede.

1. **WHEN** a submissão ocorre com `Idempotency-Key` válida **THEN** a API deve
   aceitar uma vez e retornar estado inicial do processamento.
2. **WHEN** a mesma key e payload forem repetidos **THEN** o lote não deve ser duplicado.
3. **WHEN** a key for repetida com payload divergente **THEN** retorno deve ser conflito seguro.
4. **WHEN** payload for parcial ou inválido **THEN** submissão não deve avançar estados.

### P2 — Consultar lote e status

**História:** Como operador e analista, quero acompanhar em tempo real o estado do lote e seus itens.

1. **WHEN** consulta por lote do tenant corrente **THEN** retorna timeline de estado e itens.
2. **WHEN** consulta por lote de outro tenant/ID inexistente **THEN** comportamento
   anti-enumeração retorna ausência segura.
3. **WHEN** lote avança de estado (aceito, emitindo, erro, finalizado) **THEN** a API
   retorna estados consistentes sem perder histórico.
4. **WHEN** lote não tiver autorização necessária **THEN** a API nega antes do parse intenso.

### P2 — Reverter e cancelar lote em estado permitido

**História:** Como operador, quero cancelar lote antes da emissão efetiva para
evitar envios indevidos.

1. **WHEN** lote ainda não foi enviado **THEN** cancelamento é permitido e registrado.
2. **WHEN** estado não permite cancelamento **THEN** operação retorna erro de estado.
3. **WHEN** cancelado **THEN** itens permanecem auditáveis e não reaparecem em nova submissão sem nova seleção.

## Requisitos

| ID      | Requisito                                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CTE-001 | RBAC `cte.manage` controla criação e edição de lote.                                                                              |
| CTE-002 | RBAC `cte.submit` controla submissão e consulta de status do lote.                                                                |
| CTE-003 | Todo id no escopo de lote é tenant-scoped e derivado de contexto autenticado.                                                     |
| CTE-004 | Idempotência de submissão usa tenant + key + fingerprint do payload.                                                              |
| CTE-005 | O snapshot de cálculo é imutável por item de lote.                                                                                |
| CTE-006 | Erros de ausência/cross-tenant são indistinguíveis e não enumeram dados.                                                          |
| CTE-007 | Estados de lote são explicitamente validados em máquina finita (`DRAFT`, `SUBMITTED`, `IN_FLIGHT`, `DONE`, `ERROR`, `CANCELLED`). |
| CTE-008 | UI respeita permissões, invalida cache local e evita persistência de payload fiscal sensível.                                     |
