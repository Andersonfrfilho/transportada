# ADR 0029 — NFS-e municipal pela API v2 da Nota RP, com autorização confirmada por consulta

- Status: aceito
- Data: 2026-08-11
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

Para os destinatários atendidos em Ribeirão Preto a transportadora não emite CT-e: emite nota fiscal
de serviço eletrônica municipal. Hoje esse documento nasce fora do produto — o operador soma as notas
à mão e redigita a descrição no portal. O serviço é o mesmo e o frete é calculado pela mesma regra
versionada, então o que falta é o trilho fiscal, não o cálculo.

Três fatos delimitam a decisão:

1. `@adatechnology/fiscal-provider` expõe `NotaRpNfseProvider` falando **só a v3**
   (`POST /api/v3/nota/emitir`), e a própria coleção oficial da Nota RP diz que a v3 _"aplica-se
   apenas aos municípios atendidos pelo emissor nacional, **exceto Ribeirão Preto** … enquanto isso
   utilize a nossa versão 2"_. O provider do pacote devolve erro explícito para município não
   migrado: ele não atende o caso de uso hoje.
2. A v2 é **assíncrona**: `POST /emitir` devolve `id_nota` na hora e a autorização da prefeitura chega
   depois. CT-e e MDF-e não têm esse estado intermediário — os dois trilhos existentes concluem
   dentro da própria chamada.
3. O payload v2 exige `CallbackUrl`. O repositório não tem hoje rate limit nem validação de
   assinatura de webhook; uma rota pública que escrevesse estado fiscal a partir do corpo recebido
   seria a superfície mais frágil do produto.

## Decisão

1. **A NFS-e usa a API v2 da Nota RP, não a v3, e o cliente HTTP vive no transportada.** A porta é
   `NfseFiscalGateway` (`issue` · `cancel` · `fetchStatus` · `fetchDocuments`), com outcomes tipados
   e nenhuma exceção escapando — molde literal de
   `worker-transportada/src/mdfe-issuance/infrastructure/mdfe-fiscal-gateway.ts`. A v2 entra como
   adaptador `nota-rp-v2.client.ts` por trás dela. O adaptador trata **o corpo, não o status**: a v2
   responde erro como HTTP 200 com `success:false`, e ler só o status HTTP gravaria falha como
   sucesso.
2. **A autorização se confirma por consulta autenticada, nunca por postback.** O job de cron
   `nfse.status.pull` lê `GET /notas/?id_nota=` e é a única fonte de verdade do status. A rota
   anônima `POST /public/nfse-callbacks/:token` (`defineAnonymousRoute`, sem contexto e sem tenant)
   compara um token opaco por `timingSafeEqual` sobre `callback_token_sha256`, antecipa
   `next_status_check_at` e responde 204 invariável. Ela não lê o corpo e não escreve estado fiscal.
3. **A NFS-e é o terceiro trilho do mesmo desenho assíncrono, não um subsistema novo.** Use-case
   grava nota, vínculos, encargos, payload congelado, evento e linha de outbox numa transação; o
   `OutboxRelayLoop` existente publica; o consumidor de `nfse-issuance.v1` chama o gateway e faz
   write-back guardado por status não liquidado. O valor vem de `composeCharge` e
   `roundChargeToFiscalScale` (`cte-profiles/domain/charge-composition.service.ts`), reusados sem
   alteração — eles são puros e não conhecem CT-e.
4. **Nada é cravado em Ribeirão Preto.** Município IBGE, CNAE, item da LC 116, código de tributação
   municipal e alíquota de ISS são colunas de `nfse_emission_profiles`. O produto é instalado por
   transportadora (ADR-0021); o município é configuração.
5. **CT-e e NFS-e se excluem para a mesma NF-e.** O vínculo vive em
   `nfse_service_invoice_documents` com índice parcial único sobre `cancelled_at is null` — o mesmo
   desenho de `billing_invoice_items_active_cte_document_unique`, que é o que permite ao cancelamento
   devolver a nota à fila sem apagar histórico.

## Alternativas rejeitadas

**Usar o `NotaRpNfseProvider` do pacote.** É v3-only e a v3 não atende Ribeirão Preto. Adaptá-lo
exigiria publicar uma versão nova do pacote (PR, changeset, CI, bump em duas apps) antes de qualquer
teste — e carregaria, para todo consumidor do pacote, um cliente de versão legada de um município
específico. Quando a v3 passar a atender RP, a troca é do adaptador, atrás da porta que já existe.

**Tratar o webhook como fonte de verdade.** Seria menos código e um ciclo mais curto, mas aceitaria
transição de estado fiscal a partir de um POST não autenticado, num serviço sem rate limit e sem HMAC
validado. O custo do desenho escolhido é a latência de um ciclo de cron; o custo do outro é gravar
"autorizada" a partir de um corpo que qualquer um pode enviar.

**Entrar no faturamento.** Descartado por decisão do usuário em 11/08/2026: a nota de serviço já é o
documento de cobrança, e duplicá-la em `billing_invoices` produziria duas cobranças do mesmo serviço.

## Consequências

- Existe um estado que os outros trilhos não têm: `pending_authorization`. Uma nota parada nele além
  de N ciclos gera evento `reconciliation_required`, o mesmo nome que o MDF-e usa quando o XML não
  vem.
- Chega **PDF** ao storage. Hoje nenhum trilho arquiva `application/pdf`; entra o purpose
  `'nfse_document'` em `STORAGE_OBJECT_PURPOSES` e no `check` da tabela.
- O teto de caracteres da `Discriminacao` na v2 não está documentado. Fica como
  `description_max_length` no perfil (padrão 2000, o da ABRASF), com truncagem na fronteira da lista
  de notas, e será medido com a credencial real antes de emitir em volume.
- `company_fiscal_profiles` ganha janela de retry própria da NFS-e: a tolerância da prefeitura não é
  a da SEFAZ.
- A regra de exclusão mútua acrescenta duas razões ao vocabulário de bloqueio já usado pelo CT-e:
  `already_linked_to_nfse` e `linked_to_active_cte_batch`.

## Segurança e rollback

O token da Nota RP e o segredo de webhook ficam em `secret_envelope` (ADR-0004), AAD
`transportada:nfse-credential:v1:${companyId}:${credentialId}`, plaintext zerado no `finally`. Nenhuma
rota devolve o token — o `GET` responde máscara e status. Nenhum log carrega token, payload fiscal ou
dado do tomador; erro de parse loga `code@path`, como o `deadLetterUndecodableMessage` do MDF-e. XML e
PDF em bucket privado, entregues por URL assinada de vida curta.

A migration é aditiva. O rollback é
`apps/api-transportada/drizzle/<ts>_nfse_service_invoices/rollback.sql`, escrito à mão, sem `CASCADE`,
com o `DELETE` do journal guardado por `name` + `hash` e `GET DIAGNOSTICS` exigindo exatamente uma
linha. Rodar a reversão devolve `stored_objects.purpose` ao check anterior e derruba as tabelas do
módulo em ordem reversa de dependência; nada fora de `nfse_*` é tocado.

Guardam a decisão: `test/nfse-schema/tenant-safety.contract.ts`,
`test/nfse-domain/selection.contract.ts` (exclusão mútua e paridade de valor com a prévia de CT-e),
`test/nota-rp-v2-client.contract.test.ts` (HTTP 200 com `success:false` é falha) e o bloco novo de
`test/database-migration/static-migration.contract.ts`.
