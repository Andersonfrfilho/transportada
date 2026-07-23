# Feature 006 — Regras e cálculo de frete

## Problema e resultado

O TransportAdA já importa NF-e, preserva o XML original, mantém documentos
normalizados tenant-scoped e possui configurações fiscais por empresa. Ainda
falta transformar NF-e importadas em valores de frete reproduzíveis antes da
criação dos lotes de CT-e.

O resultado desta feature é permitir que cada empresa configure regras de frete
versionadas, simule o frete de NF-e elegíveis e persista snapshots de cálculo.
O cálculo inicial obrigatório é percentual sobre o valor total da NF-e, com
suporte a valor mínimo e máximo. Todos os valores monetários e percentuais usam
representação decimal segura; nenhum percentual fica fixo no código.

Esta feature entrega o motor de frete e a experiência de simulação. A seleção de
NF-e em lote, aprovação de lote e emissão CT-e pertencem à próxima feature.

## Premissas decididas

- Bun continua como runtime, package manager e test runner.
- API usa `Bun.serve`; frontend usa React, Vite, TanStack Query, i18n e PWA.
- PostgreSQL e Drizzle continuam como fonte de verdade transacional.
- `companyId` e usuário vêm exclusivamente do contexto autenticado.
- `freight.simulate` autoriza simulação; `settings.manage` autoriza criação e
  alteração de regras.
- `invoices.read` autoriza consulta das NF-e usadas na simulação.
- Dinheiro permanece como `numeric(19,4)` no banco e string decimal nos DTOs.
- Percentuais permanecem como `numeric(9,6)` ou precisão equivalente e string
  decimal nos DTOs.
- O cálculo inicial obrigatório é percentual sobre valor total da NF-e, com
  mínimo e máximo opcionais.
- Cada cálculo persistido salva snapshot imutável da regra e da versão aplicada.
- Alterar regra futura não muda cálculo histórico.
- Nenhuma regra fiscal de CT-e, tomador, CFOP, ICMS ou SEFAZ será inferida aqui.
- Nenhum XML fiscal original entra em log, payload de resposta de cálculo ou
  auditoria.

## Fora do escopo

| Item                                                     | Motivo                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------- |
| Criar lote de emissão CT-e                               | pertence à feature 007                                        |
| Aprovar lote ou iniciar emissão                          | pertence à feature 007                                        |
| Emitir, consultar, cancelar ou inutilizar CT-e           | pertence às features 007 e 008                                |
| Regras complexas por peso, volume, KM, região ou cliente | arquitetura prepara, implementação inicial fica para evolução |
| UI completa de lote com seleção em massa                 | pertence à feature 007                                        |
| Cálculo tributário, CFOP, tomador ou regra legal         | não será inventado nesta feature                              |
| Recalcular documentos históricos automaticamente         | histórico é preservado por snapshot                           |
| Scheduler/worker para cálculo assíncrono em massa        | cálculo inicial é síncrono e bounded na API                   |
| Publicação Railway ou ambiente remoto                    | somente após gates locais e aprovação humana                  |

## Histórias priorizadas

### P1 — Configurar regra percentual vigente

**História:** Como administrador da transportadora, quero configurar uma regra
percentual de frete com vigência para que a empresa calcule valores sem código
fixo.

**Critérios de aceite:**

1. **WHEN** um usuário com `settings.manage` cria uma regra percentual válida
   **THEN** a API **SHALL** persistir a regra tenant-scoped com versão inicial,
   vigência, prioridade, percentual, mínimo e máximo opcionais.
2. **WHEN** o percentual, mínimo, máximo ou vigência são alterados **THEN** a
   API **SHALL** criar nova versão ou registrar versão imutável equivalente,
   preservando versões anteriores.
3. **WHEN** duas regras ativas equivalentes se sobrepõem para a mesma empresa,
   tipo e prioridade **THEN** a API **SHALL** rejeitar com conflito seguro.
4. **WHEN** a regra possui percentual fora do intervalo permitido, mínimo maior
   que máximo ou vigência invertida **THEN** a API **SHALL** rejeitar com erro
   estruturado sem gravar efeito parcial.
5. **WHEN** um usuário sem `settings.manage` tenta criar ou alterar regra
   **THEN** a API **SHALL** negar antes de aplicar validação de negócio.
6. **WHEN** regras de outra empresa existem **THEN** elas **SHALL NOT** afetar
   listagem, seleção vigente ou conflitos da empresa corrente.

**Teste independente:** duas empresas criam regras com os mesmos dados; uma
alteração gera versão histórica, sobreposição tenant-scoped falha e cross-tenant
não enumera dados.

### P1 — Simular frete de NF-e importada

**História:** Como operador fiscal, quero simular o frete de uma NF-e importada
para conferir o valor antes de criar um lote de CT-e.

**Critérios de aceite:**

1. **WHEN** um usuário com `freight.simulate` informa uma NF-e do tenant corrente
   **THEN** a API **SHALL** localizar a regra vigente pela data de emissão da
   NF-e e retornar base, percentual, mínimo, máximo, total e detalhes.
2. **WHEN** a NF-e pertence a outro tenant ou não existe **THEN** a API
   **SHALL** responder o mesmo `404`, sem enumeração.
3. **WHEN** não existe regra vigente aplicável **THEN** a API **SHALL** retornar
   erro de negócio seguro e orientado à configuração.
4. **WHEN** o cálculo percentual gera valor abaixo do mínimo **THEN** o total
   **SHALL** aplicar o mínimo e registrar o ajuste no detalhe.
5. **WHEN** o cálculo percentual gera valor acima do máximo **THEN** o total
   **SHALL** aplicar o máximo e registrar o ajuste no detalhe.
6. **WHEN** a NF-e não é documento completo autorizado ou não possui valor total
   confiável **THEN** a API **SHALL** negar a simulação com motivo estruturado.
7. **WHEN** o cálculo é realizado **THEN** todos os valores monetários no DTO
   **SHALL** ser strings decimais canônicas.

**Teste independente:** NF-e sintética de R$ 10.000,00 com regra de 3,5% retorna
R$ 350,00; casos de mínimo, máximo, ausência de regra e tenant cruzado são
cobertos.

### P1 — Persistir snapshot do cálculo

**História:** Como auditor fiscal/financeiro, quero que cada simulação salva
registre a regra usada para que o valor seja reproduzível no futuro.

**Critérios de aceite:**

1. **WHEN** uma simulação persistente é solicitada **THEN** a API **SHALL** criar
   um `freight_calculation` com empresa, NF-e, regra, versão, snapshot e total.
2. **WHEN** a regra é alterada depois do cálculo **THEN** o cálculo histórico
   **SHALL** manter o percentual, mínimo, máximo, base e resultado originais.
3. **WHEN** a mesma idempotency key é repetida com o mesmo payload **THEN** a API
   **SHALL** retornar o mesmo cálculo sem duplicar registro.
4. **WHEN** a mesma idempotency key é repetida com payload divergente **THEN** a
   API **SHALL** retornar conflito seguro.
5. **WHEN** uma transação falha no meio do cálculo persistente **THEN** nenhum
   snapshot parcial **SHALL** ser observado.
6. **WHEN** um cálculo é criado **THEN** auditoria **SHALL** registrar ação,
   ator, empresa, NF-e, regra, versão, resultado e correlation ID sem XML.

**Teste independente:** uma regra é usada em cálculo, depois alterada; o cálculo
histórico continua reproduzindo o valor original e replay idempotente não duplica.

### P2 — Consultar regras e cálculos

**História:** Como administrador ou operador, quero consultar regras e cálculos
para acompanhar a configuração e a preparação de documentos para lote.

**Critérios de aceite:**

1. **WHEN** um usuário com `settings.manage` lista regras **THEN** somente regras
   do tenant corrente **SHALL** aparecer com paginação e ordenação estável.
2. **WHEN** um usuário com `freight.simulate` consulta cálculos de uma NF-e
   **THEN** somente cálculos do tenant corrente **SHALL** aparecer.
3. **WHEN** uma regra é desativada **THEN** ela **SHALL NOT** ser selecionada em
   novas simulações, mas **SHALL** permanecer visível no histórico.
4. **WHEN** IDs de outro tenant são consultados **THEN** a API **SHALL** usar a
   mesma resposta de ausente.
5. **WHEN** a SPA lista regras/cálculos **THEN** respostas `no-store` e DTOs sem
   payload fiscal sensível **SHALL** ser usados.

**Teste independente:** regras e cálculos de dois tenants são intercalados no
banco e cada usuário enxerga apenas seus próprios registros.

### P2 — Operar pela SPA Vite

**História:** Como usuário do painel, quero configurar regra percentual e simular
frete a partir das NF-e importadas em uma interface responsiva.

**Critérios de aceite:**

1. **WHEN** falta `settings.manage` **THEN** controles de criação/edição de regra
   **SHALL NOT** aparecer; a API continua negando por padrão.
2. **WHEN** falta `freight.simulate` **THEN** controles de simulação **SHALL NOT**
   aparecer; a API continua negando por padrão.
3. **WHEN** uma regra é salva **THEN** a SPA **SHALL** limpar campos sensíveis ou
   temporários e invalidar queries relevantes.
4. **WHEN** uma simulação retorna mínimo ou máximo aplicado **THEN** a UI
   **SHALL** mostrar o ajuste de forma explícita.
5. **WHEN** a tela opera em 375, 768 ou 1280 pixels **THEN** formulários, lista
   de regras e resultado da simulação **SHALL** permanecer utilizáveis sem
   overflow horizontal.

**Teste independente:** Playwright cobre admin, operador e usuário sem permissão
em três viewports, incluindo mínimo/máximo e ausência de controles indevidos.

## Requisitos funcionais e de segurança

| ID      | Requisito                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| FRT-001 | Toda regra, versão, cálculo e consulta usa `companyId` do contexto autenticado.                            |
| FRT-002 | `settings.manage` cria, altera, ativa e desativa regras; `freight.simulate` simula e consulta cálculos.    |
| FRT-003 | A regra inicial suportada é percentual sobre valor total da NF-e, com mínimo e máximo opcionais.           |
| FRT-004 | Percentuais e dinheiro usam decimal seguro; DTOs expõem strings decimais canônicas.                        |
| FRT-005 | Regras possuem vigência, prioridade, status ativo/inativo, versão e timestamps.                            |
| FRT-006 | Regras ativas equivalentes não podem ter vigência sobreposta para a mesma empresa, tipo e prioridade.      |
| FRT-007 | Alterações de configuração preservam histórico por versionamento ou snapshots imutáveis.                   |
| FRT-008 | Seleção de regra vigente usa a data de emissão da NF-e e ordenação determinística.                         |
| FRT-009 | Simulação só aceita NF-e completa, autorizada, tenant-scoped e com valor total decimal válido.             |
| FRT-010 | Cada cálculo persistido salva snapshot completo da regra aplicada e detalhes de arredondamento/ajustes.    |
| FRT-011 | Idempotência de cálculo persistente considera empresa, NF-e, regra efetiva, payload e ator.                |
| FRT-012 | API nunca aceita `companyId` livre para selecionar tenant ou regra.                                        |
| FRT-013 | Erros cross-tenant usam anti-enumeração e não revelam existência de NF-e, regra ou cálculo.                |
| FRT-014 | Auditoria registra alterações de regra e cálculos persistidos sem XML fiscal ou payload sensível.          |
| FRT-015 | Frontend usa TanStack Query, i18n, tokens e PWA sem persistir payload fiscal em storage/cache.             |
| FRT-016 | Migrations são aditivas, possuem rollback manual e constraints tenant-scoped.                              |
| FRT-017 | O motor de cálculo é desacoplado de CT-e, fiscal provider e lote de emissão.                               |
| FRT-018 | O desenho permite evoluir para regras por peso, volume, KM, região e cliente sem quebrar snapshots atuais. |

## Dados e constraints mínimos

- `freight_rules`: empresa, nome, descrição, tipo, status, prioridade,
  versão atual, timestamps e auditoria básica.
- `freight_rule_versions`: empresa + regra, versão, vigência, percentual,
  mínimo, máximo, filtros futuros em JSON validado, status e snapshot canônico.
- `freight_calculations`: empresa, NF-e, regra, versão, idempotency key,
  base, percentual, mínimo, máximo, total, snapshot, detalhes, ator,
  correlation ID e timestamps.
- unique tenant-scoped para nome ativo quando aplicável.
- exclusion/constraint equivalente para evitar sobreposição de vigência em
  regras ativas equivalentes.
- unique `(company_id, freight_rule_id, version)`.
- unique `(company_id, idempotency_key)` para cálculo persistente.
- FKs compostas por empresa entre cálculo, NF-e, regra e versão.
- checks para percentual não negativo, dinheiro não negativo, mínimo menor ou
  igual ao máximo e vigência válida.

## Estados

Regra:

```text
DRAFT → ACTIVE → INACTIVE
ACTIVE → INACTIVE
INACTIVE → ACTIVE somente se não criar sobreposição vigente
```

Cálculo:

```text
SIMULATED → SNAPSHOTTED
SIMULATED → REJECTED
```

A simulação não persistente pode retornar sem gravar cálculo. Cálculo persistido
é imutável; correção cria novo cálculo ou futura revisão associada, nunca altera
snapshot histórico.

## Casos extremos

- percentual `0`, percentual com muitas casas e percentual acima do limite;
- valor da NF-e `0`, negativo por dado inválido ou decimal malformado;
- valor percentual com arredondamento em meio centavo;
- mínimo maior que máximo;
- regra sem vigência final;
- duas regras com mesma prioridade e vigência parcialmente sobreposta;
- múltiplas regras aplicáveis com prioridades diferentes;
- regra alterada entre leitura e persistência do cálculo;
- replay de idempotency key com payload igual e payload divergente;
- NF-e de outro tenant;
- NF-e resumida/evento/sem protocolo tentando simular;
- NF-e importada antes da regra existir;
- data de emissão em timezone diferente;
- tentativa de enviar `companyId`, total da NF-e ou percentual pelo cliente para
  influenciar o cálculo;
- usuário sem permissão com payload grande;
- listagem paginada com registros criados no mesmo timestamp.

## Rastreabilidade

| Requisito | História principal         | Status    |
| --------- | -------------------------- | --------- |
| FRT-001   | Todas                      | Specified |
| FRT-002   | Configuração/Simulação/SPA | Specified |
| FRT-003   | Configuração/Simulação     | Specified |
| FRT-004   | Todas                      | Specified |
| FRT-005   | Configuração               | Specified |
| FRT-006   | Configuração               | Specified |
| FRT-007   | Configuração/Snapshot      | Specified |
| FRT-008   | Simulação                  | Specified |
| FRT-009   | Simulação                  | Specified |
| FRT-010   | Snapshot                   | Specified |
| FRT-011   | Snapshot                   | Specified |
| FRT-012   | Todas                      | Specified |
| FRT-013   | Consulta/Simulação         | Specified |
| FRT-014   | Configuração/Snapshot      | Specified |
| FRT-015   | SPA                        | Specified |
| FRT-016   | Dados                      | Specified |
| FRT-017   | Simulação                  | Specified |
| FRT-018   | Evolução                   | Specified |

## Critérios de sucesso

- empresa configura regra percentual de 3,5% sem valor fixo no código;
- simulação de NF-e de R$ 10.000,00 retorna R$ 350,00 com strings decimais;
- mínimo e máximo são aplicados e aparecem no detalhe do cálculo;
- alteração de regra não muda snapshot de cálculo anterior;
- idempotência não duplica cálculo persistido e detecta payload divergente;
- regras sobrepostas são bloqueadas dentro do tenant e isoladas entre tenants;
- NF-e cross-tenant ou inexistente retorna resposta indistinguível;
- permissões negam configuração/simulação por padrão;
- frontend responsivo permite configurar regra e simular frete sem persistir XML;
- gates locais, migration/rollback e revisão Sol ficam verdes antes da próxima
  feature de lote/CT-e.

## Decisões fechadas e pendências não bloqueantes

- A feature começa com cálculo síncrono e bounded na API; cálculo em massa via
  worker fica para lote/CT-e caso o volume exija.
- A regra percentual é obrigatória; demais tipos entram como evolução usando o
  mesmo snapshot.
- A data de emissão da NF-e é a referência inicial de vigência porque reproduz o
  momento comercial do documento; se a operação exigir data de coleta ou data de
  aprovação, isso vira nova regra configurável.
- A política de arredondamento inicial será definida no plano técnico como
  decimal canônico com duas casas para dinheiro de saída e preservação de quatro
  casas no banco.
- Não há dúvida bloqueante.
