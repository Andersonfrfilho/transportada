# 035 — Cadastro completo de veículo

> O diretório nasceu como "marca, modelo e eixos". O escopo cresceu por decisão do produto: além da
> identidade do veículo, entram **custo e consumo** (insumo de frete e controle de frota) e
> **documentos com vencimento e anexo**. A tela inicial de avisos que consome os vencimentos é
> feature própria — spec 036 —, porque ela agrega alerta de várias origens, não só de frota.

## Problema

O cadastro de veículo (`fleet_vehicles`) guarda placa, RENAVAM, papel, tara, capacidade, rodado,
carroceria, UF e o bloco de proprietário. Três lacunas, em três planos diferentes:

**1. Identidade.** Não há marca, modelo nem quantidade de eixos. Quem opera a frota identifica o
veículo pela placa e pelo par marca/modelo — "a Scania R450" é como o veículo é chamado no pátio, e
"MDG-1234" é como ele é chamado no sistema. Sem marca e modelo, a tela da frota é uma lista de
placas, e conferir se o veículo certo foi escalado exige sair do produto. A quantidade de eixos é o
que determina a categoria de pedágio de um conjunto e é insumo de tabela de frete em boa parte do
mercado; hoje ela não existe em lugar nenhum. `wheel_type` (o `tpRod` do MDF-e) diz _tipo de rodado_
(truck, toco, cavalo mecânico), que não é número de eixos.

**2. Custo.** Nada no sistema sabe quanto custa rodar um quilômetro. O motor de cálculo de frete
(`freight-calculation-engine.service.ts`) implementa **um único tipo de regra**,
`percentage_of_invoice_total`: o frete é um percentual do valor da nota. Não existe caminho para
precificar por distância, porque não existe custo por quilômetro para comparar. A transportadora
também não tem onde registrar o que o veículo consome de fixo por mês — parcela, IPVA, seguro —, e
esse é o número que diz se a viagem pagou o caminhão.

**3. Documento.** CRLV, apólice de seguro, aferição de tacógrafo e RNTRC vencem em datas diferentes,
por veículo. Hoje isso vive em planilha ou na memória de quem despacha, e a descoberta do vencimento
acontece na fiscalização, com a carga na rua. Não há campo de vencimento, não há anexo, não há aviso.

Três problemas menores aparecem junto, no mesmo formulário:

1. **A consulta por placa já devolve marca, modelo e ano, e nós jogamos os três fora.**
   `vehicle-lookup-payload.policy.ts` normaliza `marca`, `modelo`, `anomodelo` e até o campo
   combinado `"MARCA/MODELO"` que vários provedores mandam num campo só; o frontend descarta os três
   de propósito, em `VEHICLE_LOOKUP_FORM_KEYS`, porque não havia campo onde pousar.
2. **O botão de consulta estava depois dos dez campos que ele preencheria** — corrigido na Fase 0.
3. **Dá para salvar um veículo que não consegue emitir MDF-e.** O `wheel_type` é opcional no
   cadastro, mas o `mdfe-payload.builder.ts` lança `MdfePayloadMissingWheelTypeError` sem ele. O erro
   nasce no cadastro e explode semanas depois, na emissão, com a carga já na rua.

## Objetivo

O veículo passa a carregar o que a operação usa para reconhecê-lo, o que o financeiro usa para
custeá-lo e o que a fiscalização cobra na estrada:

- **identidade** — marca, modelo, ano, eixos e número de frota, com marca e modelo escolhidos em
  lista servida pela nossa API a partir da tabela FIPE e pré-preenchidos pela consulta por placa;
- **custo e consumo** — consumo médio, custo variável por quilômetro e os componentes do custo fixo
  mensal (valor de aquisição, parcela, IPVA anual, seguro anual), com o custo fixo mensal **derivado**
  e nunca armazenado;
- **documentos** — CRLV/licenciamento, seguro, RNTRC/ANTT e tacógrafo, cada um com data de vencimento
  e arquivo anexado no bucket que já guarda os XMLs fiscais, e um selo de vencimento na listagem.

## Decisões

### Catálogo de marca e modelo

1. **A FIPE é consultada ao vivo, e só pela nossa API.** O browser nunca fala com o provedor
   externo: a CSP do frontend recusaria, o cache precisa ser compartilhado entre todos os operadores
   da empresa, e um token futuro do provedor não pode viver no bundle. A porta é
   `FleetVehicleCatalogPort` (`listBrands` / `listModels`), no mesmo desenho de
   `FleetVehicleLookupPort`, que já existe e já é assim.
2. **O vocabulário da FIPE não vaza para fora do gateway.** A rota recebe `role` e `wheelType` — o
   que o nosso domínio já tem — e o gateway traduz para o tipo de veículo do provedor. Rodado `04`
   (VAN) e `05` (utilitário) são automóveis; `01`, `02`, `03` e `06` são caminhões. Se amanhã o
   provedor mudar de nome ou de esquema, muda o adaptador.
3. **Reboque não tem lista, e isso é comportamento declarado.** A FIPE cobre apenas veículo
   motorizado: semirreboque, carreta e implemento (Randon, Facchini, Librelato, Guerra) não existem
   lá. Para `role: 'trailer'` a rota responde lista vazia com um motivo explícito, e o formulário
   degrada para texto livre. Lista vazia sem motivo seria lida como falha, e o operador ficaria
   esperando um carregamento que nunca termina.
4. **A indisponibilidade da FIPE nunca impede cadastrar veículo.** O provedor é gratuito e sem SLA —
   na verificação desta spec o espelho da BrasilAPI respondeu `429` na primeira chamada. Timeout,
   `429` e `5xx` degradam o campo para texto livre com aviso, e o `POST`/`PUT` do veículo não
   consulta a FIPE em momento nenhum: ele aceita o texto que veio. O catálogo é conveniência de
   digitação, não autoridade sobre o dado.
5. **A consulta por placa manda mais que o catálogo.** Marca, modelo e ano vindos da placa são o
   dado mais fiel que temos — vêm do registro do veículo, não de uma escolha em tabela de referência
   — e já chegam normalizados. Eles preenchem o campo; a lista da FIPE serve para quem digita à mão.

### Eixos

6. **Quantidade de eixos é campo nosso, inteiro.** `0` significa "não informado" e é o default, para
   que a coluna nasça sem quebrar os veículos já cadastrados; informado, vale de `2` a `9`. Vale
   para os dois papéis: uma carreta tem eixos tanto quanto um cavalo.
7. **Eixos não vai para o documento fiscal, porque não há onde.** Conferido no
   `@adatechnology/fiscal-provider`: o `veicTracao` expõe `cInt`, `placa`, `RENAVAM`, `tara`,
   `capKG`, `capM3`, `tpProp`, `tpVeic`, `tpRod`, `tpCar` e `UF`, e o pacote não modela `valePed`
   nem `categCombVeic`. O campo do MDF-e que carrega essa informação hoje é o `tpRod`, que já está
   no cadastro. Inventar campo que o layout não tem vira rejeição na SEFAZ.

### Custo e consumo

8. **Dinheiro é `numeric` e passa pelo `decimal.service.ts`.** Nenhum valor monetário desta feature
   toca float binário, em nenhuma camada, incluindo a soma que deriva o custo fixo mensal. Consumo é
   `numeric(6,2)` em km/l; custo por quilômetro é `numeric(12,4)` — quatro casas, porque um centavo
   por quilômetro em dez mil quilômetros é cem reais.
9. **O custo fixo mensal é derivado, nunca armazenado.**
   `parcela + (IPVA anual + seguro anual) / 12`, calculado com escala decimal explícita e exposto no
   view-model. Guardar o total seria guardar duas versões da verdade, e a que envelhece em silêncio
   é sempre a derivada.
10. **`0` é "não informado" em todo campo de custo, e é o default.** A coluna nasce em base com
    veículos cadastrados; obrigar valor seria inventar dado. O view-model diz explicitamente quando
    o custo está incompleto, em vez de mostrar `R$ 0,00` como se fosse um caminhão de graça.
11. **Custo é foto do estado atual, não histórico.** IPVA muda de ano, seguro muda na renovação — e
    ainda assim nada no produto lê custo de veículo no passado, porque o cálculo de frete versiona a
    **regra**, não o veículo. Uma tabela de histórico agora seria estrutura sem consumidor. O que
    entra é `costs_updated_at`, para quem olha saber de quando é o número.
12. **Nada nesta feature precifica frete por quilômetro.** O motor tem um tipo só de regra hoje
    (`percentage_of_invoice_total`); precificar por distância exige tipo novo de regra, versionamento
    e a decisão em aberto sobre eixos do conjunto — feature própria, dependente desta. Aqui o custo
    nasce visível e correto na frota; quem vai ler é a feature seguinte.

### Documentos

13. **O arquivo vai para o bucket, não para o Postgres.** O logo da empresa mora em coluna
    (`company_logo`, teto de 256 KiB) porque o gerador de PDF o lê em cada fatura. Documento de
    veículo é arquivo de arquivo morto, lido raramente e por download: vai para o
    `@adatechnology/object-storage-provider`, na mesma trilha dos XMLs, com chave
    `tenants/${companyId}/fleet-vehicles/${vehicleId}/documents/${documentId}/${objectId}` e registro
    em `stored_objects` com `purpose: 'fleet_document'`. O `companyId` no prefixo da chave é o que
    torna impossível uma empresa endereçar objeto da outra.
14. **O tipo do arquivo é decidido pela assinatura, não pelo `content-type` do cliente.** Mesmo
    princípio de `detectCompanyLogoMimeType`, com PDF (`%PDF-`) somado a PNG e JPEG. Declarar
    `application/pdf` e mandar outra coisa é entrada não confiável.
15. **Teto de 1 MiB por arquivo, e a tela diz isso antes do upload.** O gate global do
    `request-handler.service.ts` recusa acima de `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES`
    (1.048.576 bytes) **antes** de escolher a rota — levantar o teto para uma rota exige inverter a
    ordem entre o gate e o `matchRoute`, o que é mudança no núcleo do HTTP e não cabe aqui. O CRLV
    em PDF baixado do Detran tem ~200 KB e a apólice em PDF fica na mesma ordem; foto de celular
    estoura, e a mensagem de erro diz o que fazer em vez de só recusar. Fica registrado como item
    aberto.
16. **Vencimento é obrigatório; anexo é opcional.** O valor da feature é o aviso, e o aviso vem da
    data. Exigir o arquivo travaria o cadastro de quem tem a data na mão e o papel na gaveta.
17. **Um documento ativo por tipo e por veículo, com o anterior arquivado.** Unicidade por índice
    parcial sobre `archived_at is null`, no mesmo molde de
    `billing_invoice_items_active_cte_document_unique`. Renovar não apaga o CRLV vencido: ele sai do
    ativo e continua existindo, porque a fiscalização pergunta pelo passado.
18. **A faixa do aviso é constante do domínio, não configuração.** `expired` (venceu),
    `critical` (≤ 7 dias), `warning` (≤ 30 dias), `ok`. Uma faixa por empresa é tela de configuração
    e migration para servir a um número que ninguém pediu ainda; a constante fica num lugar só, e
    virar setting depois é troca de fonte, não de desenho.
19. **O feed de vencimento é endpoint da frota, e a tela inicial é outra feature.** Esta spec entrega
    `GET /fleet/document-alerts`; a spec 036 desenha a tela que junta esse feed a outras origens de
    aviso. Assim o dado nasce testado por contrato antes de existir tela, e a tela não vira o único
    consumidor possível.

## Campos novos — o que entra e o que fica de fora

| Campo                                     | Entra? | Por quê                                                                                                   |
| ----------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `brand` — marca                           | ✅     | pedido; a consulta por placa já devolve                                                                   |
| `model` — modelo                          | ✅     | pedido; a consulta por placa já devolve                                                                   |
| `axle_count` — eixos                      | ✅     | pedido; nenhuma fonte externa informa, é digitado                                                         |
| `model_year` — ano do modelo              | ✅     | **a consulta já devolve e é descartado.** Custo de digitação zero, e separa duas carretas iguais no pátio |
| `fleet_number` — número de frota          | ✅     | é o `cInt` do `veicTracao`, campo do layout do MDF-e que hoje sai vazio ("frota 42")                      |
| `average_consumption` — km/l              | ✅     | pedido; base do custo de combustível por quilômetro                                                       |
| `cost_per_kilometer` — custo variável/km  | ✅     | pedido; combustível + manutenção + pneu, informado pela transportadora                                    |
| `acquisition_amount` — valor de aquisição | ✅     | pedido; é a referência de depreciação e de decisão de troca                                               |
| `monthly_installment_amount` — parcela    | ✅     | pedido; componente do custo fixo mensal                                                                   |
| `annual_vehicle_tax_amount` — IPVA anual  | ✅     | pedido; componente do custo fixo mensal                                                                   |
| `annual_insurance_amount` — seguro anual  | ✅     | pedido; componente do custo fixo mensal                                                                   |
| `costs_updated_at`                        | ✅     | custo sem data de referência não se sabe se é deste ano                                                   |
| documentos com vencimento e anexo         | ✅     | pedido; tabela própria (`fleet_vehicle_documents`), não coluna                                            |
| custo fixo mensal somado                  | ❌     | derivado — decisão 9                                                                                      |
| histórico de custo                        | ❌     | decisão 11; nenhum consumidor hoje                                                                        |
| preço do litro de combustível             | ❌     | é parâmetro da empresa, não do veículo, e só serve à precificação por quilômetro, que está fora           |
| chassi                                    | ❌     | nenhum documento nosso pede, nenhuma regra lê. Identidade única já é a placa, com `unique` por empresa    |
| cor                                       | ❌     | mesma razão; e não sabemos se o provedor de placa devolve — assumir que devolve é adivinhar               |
| combustível                               | ❌     | só serviria para categoria de pedágio, que depende da decisão em aberto lá embaixo                        |

## Comportamento

### Organização do formulário

A Fase 0 já quebrou o formulário em três blocos (identificação com a consulta ao lado da placa,
capacidade e operação, propriedade). Passa a haver seis, na ordem em que o trabalho acontece:

1. **Identificação** — placa **com o botão de consulta ao lado**, RENAVAM, UF, número de frota.
2. **Modelo** — marca, modelo, ano do modelo, eixos. Os três primeiros costumam vir prontos da
   consulta.
3. **Capacidade e operação** — papel, rodado, carroceria, tara, capacidade em kg, capacidade em m³.
4. **Propriedade** — o select de `ownership` e, quando não é próprio, o bloco de proprietário.
5. **Custo e consumo** — consumo, custo por quilômetro, valor de aquisição, parcela, IPVA, seguro,
   com o custo fixo mensal derivado mostrado como resumo do bloco, em leitura.
6. **Documentos** — só na edição de veículo já salvo: linha por tipo, com vencimento, selo de
   estado e o anexo. No cadastro novo o bloco explica que ele abre depois de salvar — documento
   pende de `vehicleId`, e inventar upload sem entidade seria inventar estado órfão.

Nenhum bloco inventa largura ou altura de campo: `--layout-width` e os tokens `--field-*` como
manda `docs/frontend/fields.md`. Bloco longo em tela pequena quebra por `grid-cols-1`.

### Aviso de campo exigido pelo MDF-e

Veículo de tração sem rodado continua podendo ser salvo — bloquear quebraria o cadastro rápido por
placa, que é o fluxo comum. Mas o formulário passa a dizer, ao lado do campo, que sem ele o veículo
não emite MDF-e; e a listagem marca o veículo como incompleto. O erro passa a aparecer onde tem
conserto.

### Catálogo

- `GET /fleet/vehicle-catalog/brands?role=<papel>&wheelType=<rodado>` — `fleet.read`. Devolve
  `{ items: [{ code, name }], source }`. Para `role: 'trailer'`, `items` vazio e `source: 'none'`.
- `GET /fleet/vehicle-catalog/models?role=&wheelType=&brand=<code>` — `fleet.read`. Mesma forma.
- Resposta cacheada em memória por 24 h (a tabela FIPE muda uma vez por mês). Falha entra em cache
  negativo curto, de 60 s, para que uma indisponibilidade não vire enxurrada de chamadas.
- A capacidade aparece em `FleetCapabilities` como `vehicleCatalog`, no mesmo lugar onde
  `vehicleLookup` já aparece. Sem `FLEET_VEHICLE_CATALOG_URL` configurada, ela é `false` e o
  formulário mostra os campos como texto livre desde o primeiro render — sem piscar.

### Campos de marca e modelo

- **Marca**: select de `@/components/ui/select` alimentado pelo catálogo; aceita valor fora da lista
  quando o catálogo está indisponível ou o papel é `trailer`.
- **Modelo**: select dependente da marca, com a mesma degradação. Trocar a marca limpa o modelo —
  modelo de outra marca é dado errado com cara de certo.
- A consulta por placa preenche marca, modelo e ano, e prevalece sobre o que estiver escolhido.
  Não preenche eixos, número de frota, custo nem documento.

### Custo e consumo

- Os seis campos são opcionais e aceitam `0` como "não informado".
- O bloco mostra, em leitura, o **custo fixo mensal** derivado
  (`parcela + (IPVA + seguro) / 12`) e o **custo por quilômetro** informado, um ao lado do outro,
  com a data de referência (`costs_updated_at`).
- Salvar qualquer campo de custo atualiza `costs_updated_at`; salvar só a placa não atualiza.
- Valor negativo é recusado na validação da rota, com todos os erros de uma vez.

### Documentos

- `GET /fleet/vehicles/:vehicleId/documents` — `fleet.read`. Lista os ativos e, por tipo, se há
  anterior arquivado.
- `PUT /fleet/vehicles/:vehicleId/documents/:type` — `fleet.manage`. `multipart/form-data` com os
  campos de metadado (`reference`, `issuedAt`, `expiresAt`) e o arquivo opcional. Arquiva o ativo
  anterior do mesmo tipo e cria o novo, na mesma transação.
- `DELETE /fleet/vehicles/:vehicleId/documents/:type` — `fleet.manage`. Arquiva; não apaga.
- `GET /fleet/vehicles/:vehicleId/documents/:type/file` — `fleet.read`. Responde `302` para URL
  assinada de vida curta, com `disposition: 'attachment'` e nome de arquivo definido por nós. A URL
  nunca é montada no cliente.
- `GET /fleet/document-alerts?withinDays=<1..90>` — `fleet.read`. Devolve os documentos ativos com
  vencimento dentro da janela ou já vencidos, ordenados por data, com placa, tipo, dias restantes e
  faixa. É o que a spec 036 consome.
- Tipos aceitos: `crlv`, `insurance`, `antt`, `tachograph`, `other`. Vocabulário fechado em
  constante, não ENUM nativo do Postgres.

### Listagem da frota

- Marca, modelo, ano e eixos entram como colunas, ocultáveis e persistidas como as demais
  (`docs/frontend/data-tables.md`). Marca e modelo visíveis; ano e eixos ocultos por padrão.
- Custo por quilômetro e custo fixo mensal entram como colunas ocultas por padrão.
- Uma coluna **Documentos** mostra a faixa mais grave entre os documentos ativos do veículo, com o
  selo de vencimento — vermelho para vencido, âmbar para crítico. É onde o problema encontra quem
  resolve, sem depender da tela inicial.

## Fora de escopo

- **A tela inicial de avisos** — spec 036. Aqui sai o endpoint que ela lê.
- **Preço de frete por quilômetro ou por eixo** — exige tipo novo de regra no motor de cálculo e a
  decisão em aberto abaixo. Nada nesta feature lê eixos ou custo para calcular valor.
- **Histórico de custo** e **preço de combustível por empresa** (decisão 11 e tabela de campos).
- Catálogo editável pelo operador (marcas próprias de implemento cadastradas à mão).
- Qualquer campo novo no XML fiscal — o `cInt` que o `fleet_number` alimenta já existe no layout.
- Notificação por e-mail ou push de vencimento: depende da spec 034, que não está implementada.
- Upload acima de 1 MiB (decisão 15) e OCR de documento.

## Decisões em aberto

- **Frete por eixo.** Para a quantidade de eixos alimentar o cálculo falta responder **o que conta
  como "os eixos do transporte"**: o conjunto tem cavalo mecânico e uma ou duas carretas, cada um com
  o seu número, e a tabela de pedágio cobra pela soma do que toca o solo. Enquanto isso não estiver
  decidido, implementar é adivinhar. É feature própria, dependente desta: sem a coluna, não há o que
  somar.
- **Teto de upload.** Passar de 1 MiB exige o gate de tamanho consultar a rota, o que muda a ordem do
  `request-handler.service.ts`. Registrado na decisão 15; vira feature quando alguém precisar anexar
  foto de celular.

## Critérios de aceite

### Identidade e catálogo

- [ ] `fleet_vehicles` tem `brand`, `model`, `model_year`, `axle_count` e `fleet_number`, com
      migration e `rollback.sql` escrito à mão ao lado.
- [ ] Contrato de tenant-safety do schema de frota continua verde, incluindo as colunas novas.
- [ ] `GET /fleet/vehicle-catalog/brands` e `/models` respondem com `fleet.read` e recusam sem ela.
- [ ] `role: 'trailer'` responde lista vazia com motivo, e não erro.
- [ ] Timeout, `429` e `5xx` do provedor não derrubam a rota nem impedem salvar o veículo.
- [ ] Salvar veículo nunca chama o provedor externo.
- [x] ~~A consulta por placa preenche marca, modelo e ano no formulário.~~ Sem efeito: o trilho de
      consulta por placa foi removido do produto pela ADR-0032 (não há fonte pública e gratuita).
- [ ] Trocar a marca limpa o modelo.
- [ ] O formulário tem os blocos na ordem descrita, com `ownership` no bloco de propriedade (o
      botão de consulta junto da placa saiu com a ADR-0032).
- [ ] Veículo de tração sem rodado aparece como incompleto no formulário e na listagem.
- [ ] `fleet_number` chega ao `cInt` do `veicTracao` no payload do MDF-e.
- [ ] Nenhum outro campo novo no payload do MDF-e ou do CT-e.

### Custo e consumo

- [ ] As seis colunas de custo e consumo são `numeric`, com default `0` e check de não-negatividade.
- [ ] O custo fixo mensal é derivado com `decimal.service.ts` e **não** existe como coluna.
- [ ] `costs_updated_at` só muda quando algum campo de custo muda.
- [ ] Valor negativo é recusado com `400` e todos os erros de uma vez.
- [ ] O bloco de custo mostra "não informado" em vez de `R$ 0,00` quando o campo é `0`.

### Documentos

- [ ] `fleet_vehicle_documents` tem `company_id`, `vehicle_id`, `type`, `expires_at`, `archived_at` e
      referência ao objeto, com índice parcial de unicidade sobre o ativo.
- [ ] Contrato negativo de tenant: empresa A não lê, não baixa e não arquiva documento da empresa B.
- [ ] `PUT` sem arquivo cria documento só com metadado; com arquivo, grava no bucket e em
      `stored_objects` com `purpose: 'fleet_document'`.
- [ ] Arquivo com assinatura fora de PDF/PNG/JPEG é recusado, mesmo com `content-type` declarado.
- [ ] Arquivo acima de 1 MiB é recusado com mensagem que diz o teto.
- [ ] Renovar um tipo arquiva o anterior na mesma transação, e o arquivado continua consultável.
- [ ] `GET .../file` responde `302` para URL assinada de vida curta; a chave do objeto tem o
      `companyId` no prefixo e nunca é montada no cliente.
- [ ] `GET /fleet/document-alerts` devolve vencidos e a vencer na janela, ordenados, com a faixa.
- [ ] A listagem da frota mostra o selo da faixa mais grave por veículo.
- [ ] Nenhum log com nome de arquivo, conteúdo ou URL assinada.

### Fechamento

- [ ] Texto pt-BR acentuado nos `*.locale.json`, com o contrato de acentuação verde.
- [ ] `make check` verde.
