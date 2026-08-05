# ADR-0016: Frota, condutores e o manifesto MDF-e como viagem

## Contexto

`T026` da feature 012 pede MDF-e (modelo 58): modelagem do manifesto, vínculo N:1 com CT-es e o
ciclo emitir/encerrar/cancelar. A emissão já existe no `@adatechnology/fiscal-provider`
(`SefazMdfeProvider`, layout 3.00, `MDFeRecepcaoSinc` na SVRS), mas o TMS não tem **nada** do que o
`MdfeData` exige:

| exigência do MDF-e                                                    | origem hoje                         |
| --------------------------------------------------------------------- | ----------------------------------- |
| `<veicTracao>` placa, RENAVAM, tara, capacidade, `tpRod`, `tpCar`, UF | não existe                          |
| `<condutor>` nome + CPF (1..10)                                       | não existe                          |
| `<infANTT><RNTRC>`                                                    | `company_fiscal_profiles.rntrc` ✅  |
| `<infMunDescarga>` + chaves de CT-e                                   | derivável de `cte_fiscal_documents` |
| `<prodPred>`, `<tot>`                                                 | derivável dos CT-es do manifesto    |

Ou seja: antes de emitir manifesto é preciso **cadastro de frota e de condutores**. E o cadastro de
condutor toca identidade — o motorista, mais adiante, vai logar num app de campo para mandar posição,
evento de carga, foto e documento. Fazer o cadastro agora sem pensar nesse app significa refazê-lo
depois.

## Decisão

### 1. Motorista é cadastro operacional; usuário é identidade. São tabelas diferentes

`fleet_drivers` guarda nome, CPF e CNH — **dado fiscal**, exigido pelo `<condutor>` do MDF-e e
congelado no XML. `identity_users` + `user_company_memberships` continuam sendo a identidade de
login, que mora no Keycloak e não tem nome nem documento no nosso banco (ADR-0002).

O vínculo é `fleet_drivers.membership_id`, **anulável**, com unique parcial por empresa:

- motorista sem login existe, aparece no `<condutor>` e roda o MDF-e inteiro — é o caso normal hoje;
- quando o app chegar, liga-se a linha existente ao membership; nenhum dado fiscal se move.

A direção do vínculo importa: um motorista **pode** ganhar um usuário; um usuário **nunca** vira
motorista por ter o papel. Sem linha em `fleet_drivers`, não há motorista — e não há `<condutor>`.

### 2. `driver` é um papel de empresa, com o menor conjunto de permissões do sistema

`COMPANY_ROLES` ganha `driver`. Permissões novas:

| permissão                                   | quem recebe                             |
| ------------------------------------------- | --------------------------------------- |
| `fleet.read`                                | company-admin, fiscal, operator, viewer |
| `fleet.manage`                              | company-admin, operator                 |
| `mdfe.read`                                 | company-admin, fiscal, operator, viewer |
| `mdfe.manage`                               | company-admin, fiscal, operator         |
| `mdfe.issue` / `mdfe.close` / `mdfe.cancel` | fiscal                                  |
| `trip.read` / `trip.report`                 | **driver** (e só ele)                   |

O papel `driver` recebe **exclusivamente** `trip.read` e `trip.report`. Um motorista autenticado não
enxerga nota, CT-e, faturamento nem a frota — o membership dele passa no `tenantContext`, mas as
rotas que ele alcança são só as da própria viagem.

### 3. O escopo do motorista é a linha dele, não o tenant

`companyId` já vem do contexto autenticado e nunca do payload. Para o app, a mesma regra desce um
nível: o `driverId` é resolvido a partir do `membership_id` do token, nunca de parâmetro do cliente,
e toda query de viagem filtra por `(company_id, driver_id)`. Isso entra nos testes de
`test/*-schema/tenant-safety.contract.ts` como caso próprio — motorista A não lê viagem do motorista
B da mesma empresa.

### 4. Veículo é um cadastro só, com papel

`fleet_vehicles.role` ∈ `traction | trailer`. Tara, capacidade, `tpRod`, `tpCar`, UF e RENAVAM saem
daqui direto para `<veicTracao>` / `<veicReboque>` — sem digitação no momento da emissão, que é onde
erro de placa vira rejeição.

O grupo `<prop>` (proprietário) é opcional e só é emitido quando o veículo **não é da
transportadora**: agregado ou terceiro, com CNPJ/CPF, RNTRC e `tpProp` próprios. Veículo próprio não
emite `<prop>` — emitir com o CNPJ do emitente é rejeição.

### 5. O manifesto é a viagem

> **Emendado pelo ADR-0023.** A viagem passou a ser `trips`, entidade própria; `mdfe_manifests`
> referencia uma viagem em vez de ser uma. O restante desta seção é histórico — mantido para
> registrar o raciocínio original, não a regra vigente.

`mdfe_manifests` já nasce com `vehicle_id`, condutor principal, UF de início e fim. Esse é
deliberadamente o mesmo agregado que o app de campo vai chamar de "viagem": quando os eventos
chegarem, entram em `trip_events` (append-only, `manifest_id` + `driver_id` + tipo + payload +
`occurred_at` do dispositivo e `recorded_at` do servidor), e foto/canhoto/documento reusam
`stored_objects`, que já é create-only e isolado por tenant (ADR-0006).

Nada disso é construído agora. O que a decisão garante é que construir depois **não mexe no
manifesto**: a tabela nova referencia `mdfe_manifests(company_id, id)` e pronto.

### 6. O vínculo N:1 com CT-e é por documento fiscal, não por item de lote

`mdfe_manifest_items` referencia `cte_fiscal_documents` — só entra CT-e que já tem chave e
protocolo. Item de lote em `pending` ou `rejected` não tem chave para pôr no `<infCTe>`.

Unique por `(company_id, cte_fiscal_document_id)` restrito a manifesto não cancelado: um CT-e não
pode estar em dois manifestos vivos ao mesmo tempo. Cancelou o manifesto, o CT-e volta a ser
elegível.

### 7. Município de descarga sai do CT-e — não é digitado

`<infMunDescarga>` agrupa as chaves por município de destino. Nós derivamos do próprio CT-e e
congelamos em `mdfe_manifest_items.discharge_city_code` / `discharge_city_name`. Digitar abriria
divergência entre o manifesto e um CT-e que já está autorizado no fisco.

Pela mesma razão, `UFIni` é a UF do emitente e `UFFim` é a UF do último município de descarga — não
são campos de formulário.

### 8. Totais são soma congelada, em `numeric`

`qCTe` é contagem; `vCarga` e `qCarga` são soma dos CT-es do manifesto, gravadas em `numeric` e
formatadas na borda (`vCarga` 2 casas, `qCarga` 4 casas — `TDec_1104`). `cUnid` é `01` (KG). Nada de
float binário, e nada de recalcular na emissão: o que foi congelado é o que vai no XML.

### 9. O ciclo emitir/encerrar/cancelar espelha o do CT-e

Mesmo desenho do ADR-0010 e do ADR-0015, sem inventar caminho novo: a API agenda e o worker executa,
com outbox, `mdfe_issuance_attempts`, `mdfe_issuance_events`, e XML em storage create-only. O
envelope do RabbitMQ carrega só identificadores — chave, protocolo e justificativa o worker lê da
linha, filtrando por `company_id`.

Estados do manifesto: `draft → issuing → authorized → closed`, com `rejected` e `cancelled` como
saídas. Duas regras de domínio que a SEFAZ impõe e nós replicamos antes de gastar a chamada:

- **encerrado não cancela** — depois do 110112, o 110111 é rejeitado;
- **cancelamento tem prazo** — fora da janela legal só resta o encerramento.

### 10. Encerramento é evento, não status local

O 110112 exige município e UF de encerramento e a data. Marcar `closed` sem transmitir seria a mesma
mentira contábil que o ADR-0015 corrigiu no cancelamento do CT-e: o manifesto continuaria aberto no
fisco, e MDF-e aberto trava a emissão do próximo pela regra de não-encerrados.

## Consequências

- entram três cadastros novos (`fleet_vehicles`, `fleet_drivers`, vínculo motorista↔veículo) antes de
  qualquer manifesto ser emitido;
- `COMPANY_ROLES` deixa de ser fechado nos cinco papéis de escritório — `driver` é o primeiro papel
  de campo, e o frontend precisa acompanhar a allowlist (é a família de bug já registrada no projeto);
- o pacote fiscal precisa dos eventos 110112 e 110111 do MDF-e, hoje inexistentes —
  `SefazMdfeProvider.cancel` devolve `MDFE_EVENTO_NAO_SUPORTADO`;
- `mdfe_manifests` passa a ser um agregado com dois consumidores futuros (fisco e app de campo);
  mudança nele tem custo maior que o normal;
- o app de rastreamento fica desenhado mas não construído: `trip_events` e as permissões `trip.*`
  existem no papel, e a primeira feature do app só precisa criar a tabela.

## Alternativas consideradas

1. **Dados do veículo e do condutor no payload de criação do manifesto.** Entrega mais rápida e sem
   cadastro. Rejeitada: a mesma placa seria redigitada a cada viagem, com erro de digitação virando
   rejeição da SEFAZ, e o app de campo não teria a quem vincular o login.
2. **Motorista como `identity_users` com nome e CPF.** Rejeitada: colocaria PII no banco de
   identidade, que hoje é deliberadamente vazio (ADR-0002), e obrigaria todo motorista a ter conta no
   Keycloak antes de aparecer num MDF-e.
3. **Manifesto derivado automaticamente do lote de CT-e (1 lote = 1 manifesto).** Rejeitada: lote é
   agrupamento fiscal por cliente e perfil; viagem é agrupamento físico por veículo. Um caminhão leva
   CT-es de vários lotes, e um lote se espalha por várias viagens.
4. **Encerrar só no status local, transmitindo depois.** Rejeitada pelo ADR-0015 — divergência com o
   fisco é o defeito que aquele ADR existe para não repetir.
