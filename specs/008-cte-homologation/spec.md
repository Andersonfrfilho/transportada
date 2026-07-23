# Feature 008 — Homologação CT-e

## Problema e resultado

O TransportAdA já consegue importar NF-e, calcular frete, montar lotes de CT-e e
submeter esses lotes em fluxo controlado. A lacuna atual é transformar essa
submissão em uma jornada fiscal homologável, executada por worker, usando apenas
contratos públicos de `@adatechnology/fiscal-provider`, preservando XML/protocolo
e classificando rejeições, retries e falhas sem vazar dados fiscais sensíveis.

O resultado desta feature é permitir que uma empresa:

1. submeta lotes aprovados para emissão CT-e em ambiente de homologação controlado;
2. gere comandos fiscais por item com numeração reservada e snapshot imutável;
3. processe emissão pelo worker com retry seguro e idempotência persistente;
4. armazene XML assinado/autorizado, protocolo e resposta fiscal em storage;
5. acompanhe autorização, rejeição e falha técnica por lote e item;
6. reprocessar rejeições ou falhas recuperáveis sem duplicar CT-e.

## Premissas

- `companyId`, certificado A1, ambiente fiscal, série e numeração vêm das
  configurações fiscais tenant-scoped já persistidas.
- A emissão CT-e real passa por gateway interno que adapta os exports públicos
  do pacote Ada; nenhuma aplicação importa internals `src/sefaz/*`.
- O HTTP apenas agenda ou consulta trabalho; emissão fiscal ocorre no worker.
- XML fiscal completo nunca aparece em logs, responses de listagem, auditoria
  textual ou storages do navegador.
- Homologação real contra SEFAZ exige aprovação humana, certificado válido e
  ambiente fiscal explicitamente configurado como homologação.
- Produção permanece fora do escopo desta feature.

## Fora do escopo

- Emissão CT-e em produção.
- Geração oficial de DACTE, pois o suporte público ainda não foi confirmado no
  inventário do pacote fiscal.
- MDF-e, averbação, seguros, rastreamento e baixa operacional.
- Regras fiscais estaduais avançadas além dos dados mínimos exigidos pelo
  contrato de CT-e 4.00 já exposto pelo provider.
- Alteração de regra comercial de frete ou recálculo de snapshots.

## Histórias priorizadas

### P1 — Emitir itens de lote em homologação

**História:** Como operador autorizado, quero que um lote aprovado seja emitido
em homologação item a item para obter autorização fiscal rastreável.

1. **WHEN** um lote `SUBMITTED` possuir itens elegíveis **THEN** o worker deve
   criar comandos de emissão tenant-scoped e processar cada item isoladamente.
2. **WHEN** um item for autorizado **THEN** o sistema deve persistir protocolo,
   chave, XML autorizado e estado final do item sem sobrescrever histórico.
3. **WHEN** um item falhar **THEN** o lote deve continuar processando os demais
   itens e registrar erro classificado.
4. **WHEN** todos os itens chegarem a estado terminal **THEN** o lote deve
   consolidar `DONE` ou `ERROR` conforme resultado dos itens.

### P1 — Classificar rejeições e retries

**História:** Como analista fiscal, quero diferenciar rejeição fiscal de falha
técnica para decidir correção, retry ou reprocessamento.

1. **WHEN** o provider retornar rejeição SEFAZ **THEN** o item fica rejeitado com
   código, motivo sanitizado e sem retry automático infinito.
2. **WHEN** ocorrer timeout, conexão ou indisponibilidade recuperável **THEN** o
   worker agenda retry com backoff persistido e limite configurado.
3. **WHEN** a mesma mensagem for reentregue **THEN** idempotência persistente deve
   impedir emissão duplicada.
4. **WHEN** o erro for permanente ou exceder tentativas **THEN** o item vai para
   falha terminal com evento auditável.

### P1 — Preservar XML e protocolo fiscal

**História:** Como usuário fiscal, quero acessar metadados e documentos fiscais
de CT-e autorizado sem expor XML sensível indevidamente.

1. **WHEN** CT-e autorizado for persistido **THEN** XML original/assinado e
   protocolo devem ser armazenados em object storage create-only.
2. **WHEN** usuário consultar o item **THEN** a API retorna metadados seguros e
   URLs temporárias apenas com permissão adequada.
3. **WHEN** storage confirmar hash divergente para a mesma chave **THEN** a
   operação deve falhar de forma segura e exigir reconciliação.
4. **WHEN** logs e eventos forem emitidos **THEN** devem conter somente IDs,
   códigos, hashes e mensagens sanitizadas.

### P2 — Reprocessar itens com controle fiscal

**História:** Como operador autorizado, quero reprocessar itens rejeitados ou com
falha técnica após correção para concluir o lote sem recriar tudo.

1. **WHEN** item rejeitado for reprocessado **THEN** deve haver nova tentativa
   auditada e vinculada ao item original.
2. **WHEN** item autorizado for reprocessado **THEN** a API deve negar para evitar
   duplicidade fiscal.
3. **WHEN** payload de reprocessamento divergir da tentativa gravada sem nova
   revisão permitida **THEN** deve retornar conflito seguro.
4. **WHEN** usuário não tiver permissão fiscal **THEN** a autorização nega antes
   do parse do payload.

## Requisitos funcionais

| ID      | Requisito                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------- |
| CTH-001 | Emissão CT-e deve ser executada pelo worker, nunca diretamente na request HTTP.                                |
| CTH-002 | Gateway CT-e deve usar somente exports públicos de `@adatechnology/fiscal-provider`.                           |
| CTH-003 | Todo comando fiscal deve derivar `companyId`, certificado, ambiente, série e numeração do contexto persistido. |
| CTH-004 | Numeração fiscal deve ser reservada de forma transacional e idempotente por item.                              |
| CTH-005 | Cada tentativa de emissão registra request sanitizado, response sanitizada, correlation ID e `cause` interno.  |
| CTH-006 | XML assinado/autorizado e protocolo devem ser armazenados em storage create-only com hash verificável.         |
| CTH-007 | Rejeição fiscal, falha técnica, timeout e erro permanente possuem taxonomia interna distinta.                  |
| CTH-008 | Retry usa backoff persistido, limite finito e DLQ para falhas não recuperadas.                                 |
| CTH-009 | Reentrega de mensagem e retry não podem emitir CT-e duplicado para o mesmo item/lote/empresa.                  |
| CTH-010 | Consulta de lote/item mantém anti-enumeração para IDs inexistentes ou cross-tenant.                            |
| CTH-011 | UI mostra autorização/rejeição/falha por item sem persistir XML em cache, storage ou DOM.                      |
| CTH-012 | Produção fiscal exige gate manual futuro e não é habilitada por padrão nesta feature.                          |

## Requisitos não funcionais

- Logs devem ser estruturados, sanitizados e correlacionáveis por lote, item,
  tentativa, job e usuário.
- Migrations são aditivas, reversíveis por rollback manual e compatíveis com
  banco baseline/vazio.
- Testes devem cobrir isolamento multiempresa negativo em API, worker e storage.
- O worker deve conseguir reiniciar sem perder tentativas em voo nem repetir
  efeitos fiscais concluídos.
- Respostas HTTP de consulta fiscal usam `Cache-Control: no-store`.

## Casos extremos e falhas

- Provider fiscal indisponível antes de emitir.
- Timeout após envio com status fiscal desconhecido.
- Rejeição SEFAZ com código conhecido e mensagem extensa.
- Mensagem duplicada no RabbitMQ durante processamento.
- Storage indisponível depois de emissão autorizada.
- Hash divergente no storage create-only.
- Certificado vencido, inválido ou de CNPJ divergente.
- Série/numeração ausente ou reserva concorrente.
- Lote com parte dos itens autorizados e parte rejeitada.

## Critérios de aceite

- Given um lote `SUBMITTED` com itens elegíveis, when o worker processa emissão,
  then cada item termina como autorizado, rejeitado ou falha terminal com evento.
- Given uma reentrega da mesma mensagem, when já existe emissão concluída, then o
  worker retorna replay seguro sem chamar o provider novamente.
- Given erro técnico recuperável, when limite de retry ainda não foi excedido,
  then o backoff persistido agenda nova tentativa sem loop em memória.
- Given CT-e autorizado, when usuário autorizado consulta documento, then recebe
  metadados e URL temporária, sem XML em listagem.
- Given usuário de outro tenant, when consulta lote/item/documento, then recebe
  ausência segura indistinguível.
- Given configuração fiscal em produção, when esta feature tentar emitir, then a
  operação é bloqueada por gate de homologação.

## Dúvidas

Nenhuma dúvida bloqueante para iniciar a especificação e contratos. As incertezas
de UF, contingência e DACTE ficam registradas como riscos e não bloqueiam a
homologação mínima de emissão CT-e.
