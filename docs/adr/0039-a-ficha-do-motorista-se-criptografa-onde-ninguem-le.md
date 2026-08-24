# ADR 0039 — A ficha do motorista se criptografa onde ninguém lê

- Status: aceito
- Data: 2026-08-20
- Decisores: mantenedor do projeto e revisão Opus
- Fecha a decisão 3 da spec 046 (T009) e o achado "data de nascimento do motorista em claro" de
  `docs/SECURITY.md`, 2026-08-20
- Emendada em 2026-08-23 pelo adendo no fim deste arquivo: o trio do RG entra no mesmo envelope,
  e a contração passa a derrubar treze colunas, não dez

## Contexto

O §5 do baseline de segurança manda criptografar campo sensível em repouso "com chave de aplicação
separada da chave do banco" e **nomeia data de nascimento** entre eles. A spec 046 acrescentou
`birth_date`, `license_number`, `license_expires_at` e sete colunas de endereço a `fleet_drivers`, e
todas nasceram em `text`/`date` em claro. O `tax_id` do motorista — CPF — já estava assim desde
antes.

A T009 pedia a escolha consciente: criptografar, ou registrar por que a instalação dedicada e a rede
fechada bastam. Ela também dizia **quando** decidir: "antes de o MDF-e passar a ler esses campos:
com leitor, migrar para coluna criptografada deixa de ser mudança de uma app só."

A leitura coluna por coluna mostrou que não existe uma resposta para a tabela inteira. São quatro
grupos com exposição, custo e prazo muito diferentes.

### O campo mais sensível é o único que não dá para proteger

`tax_id` é CPF, o primeiro nome da lista do §5 — e é o único da ficha que **já tem leitor**:
`mdfe-payload.builder.ts:72` monta `condutores` com `cpf: driver.taxId`, e o payload congelado vai
para `mdfe_issuance_payloads.payload`, coluna `jsonb` comprometida por `payload_sha256`. Daí o CPF
segue para o XML, que a regra do produto **preserva**. Ou seja: para todo motorista que já entrou num
manifesto, o CPF está em claro numa tabela vizinha, dentro de um documento que não pode ser
recriptografado sem quebrar o hash nem reescrito sem quebrar a preservação do XML fiscal.

Criptografar `fleet_drivers.tax_id` protegeria, então, **o CPF de quem nunca rodou** — e cobraria por
isso o `unique(company_id, tax_id)` (que hoje virá `FleetDriverTaxIdTakenError` no formulário), o
CHECK de onze dígitos, um índice cego novo e a abertura do envelope no caminho do MDF-e, que é
justamente o "deixa de ser mudança de uma app só" que a T009 queria evitar. A janela que a task
pedia para decidir **já estava fechada** para este campo: o leitor existe.

### Três campos têm exposição sem nenhum uso

`birth_date`, `license_number` e o endereço residencial não têm consumidor nenhum. Nem MDF-e, nem
relatório, nem notificação — o `CLAUDE.md` já diz isso, e continua verdade. Nenhuma consulta os
filtra: `drizzle-fleet-driver.repository.ts` filtra `statusEq` e `ilike(name)`, e nada mais. São o
caso mais barato que vai existir para criptografar: um caminho de escrita e um de leitura, sem
relatório para reescrever e sem filtro para substituir.

### Dois campos precisam continuar legíveis pelo banco

`name` alimenta `ilike(fleetDrivers.name, '%…%')` e o índice `(company_id, status, name)`. Não há
índice cego para busca por trecho: criptografar o nome é acabar com a busca do formulário. E `name`
não está na lista do §5.

`license_expires_at` é a data que o aviso de CNH a vencer vai varrer — a feature que a spec 046
declarou fora de escopo e que é o próximo leitor óbvio da ficha. Criptografada, "quais CNHs vencem em
30 dias" passa a ser abrir o envelope de toda a frota a cada ciclo de cron.

### O que a criptografia compra aqui, exatamente

A chave vive em `ENCRYPTION_KEYRING_JSON`, no ambiente da própria API. Quem toma a aplicação lê tudo.
O que isso defende é **leitura do banco sem a aplicação**: credencial somente-leitura vazada, Adminer
ou Metabase mal configurado, `pg_dump` indevido, backup restaurado em outro lugar. É exatamente a
ameaça que o §5 descreve quando pede chave separada da do banco — e é menos do que a palavra
"criptografado" sugere. Fica escrito para ninguém ler esta ADR como blindagem.

## Decisão

### 1. `birth_date`, `license_number`, endereço e telefone entram num envelope só

Um `person_envelope jsonb` em `fleet_drivers`, A256GCM por `@adatechnology/secret-envelope`, no
mesmo formato que as credenciais de NFS-e já usam (`{algorithm, ciphertext, keyId, nonce, version}`).
Um envelope para o conjunto, não um por coluna: os campos são sempre lidos juntos — a ficha abre
inteira — e um nonce e um AAD por motorista é menos superfície para errar do que dez.

O telefone entra de carona. O §5 não o nomeia, mas o §1 o trata como PII, nenhuma consulta o filtra e
o envelope já está aberto.

### 2. O AAD amarra o envelope ao motorista

`transportada:fleet-driver:v1:${companyId}:${driverId}`, na forma que o produto já usa. Envelope
copiado para outra empresa ou outro motorista **não abre**. Consequência de projeto: o id precisa
existir antes do selo — vale, porque o UUID é gerado pela aplicação antes da escrita.

### 3. A CNH mantém a unicidade por índice cego, e a chave dele é obrigatória

`license_number_hmac text`, HMAC-SHA256 com chave própria do chaveiro, e
`unique(company_id, license_number_hmac)`. CNH vazia grava `null`, o que substitui de graça o índice
parcial `where length(license_number) > 0` — o Postgres já aceita muitos `null` num índice único.

A chave é o que faz o índice funcionar: um sha256 puro de onze dígitos se quebra por força bruta em
10^11 tentativas, que não é nada. Com HMAC, sem a chave não há dicionário. O índice cego revela
**igualdade** e só ela — que é precisamente o que a restrição precisa revelar.

A chave nova entra em `CryptographicConfiguration` ao lado de `notificationSuppressionHmacKey`, que é
o precedente da casa, e herda a recusa de reuso de chave que aquele schema já faz.

### 4. `tax_id`, `linked_tax_id`, `name` e `license_expires_at` ficam em claro, e o motivo é este

- **`tax_id`** — tem leitor, e o mesmo CPF está em claro no `mdfe_issuance_payloads.payload`,
  comprometido por hash, e no XML preservado. Criptografar aqui protegeria o motorista que nunca
  entrou em manifesto e cobraria a restrição de unicidade, o CHECK e o caminho do MDF-e. É desvio
  consciente do §5, registrado nesta linha, não omissão.
- **`linked_tax_id`** — é CNPJ, pessoa jurídica, e `driver-vehicle-ownership.policy.ts` compara ele
  com o documento do proprietário do veículo. Criptografado, a comparação morre.
- **`name`** — busca por trecho no formulário e índice de ordenação. Índice cego não faz `ilike`.
  Não está na lista do §5.
- **`license_expires_at`** — é a data que o aviso de CNH a vencer vai varrer. Vencimento é o que se
  consulta; o número da habilitação é o que se guarda.

### 5. A migração é expansão e contração, e o backfill é aplicação, não SQL

Expansão acrescenta `person_envelope` e `license_number_hmac`; um passo one-shot da aplicação sela o
que já existe (SQL não sela — a chave está no processo, e a casa proíbe `INSERT`/`UPDATE` bruto para
esse tipo de trabalho); a contração derruba as dez colunas em claro e os CHECKs delas.

A contração é **destrutiva** e exige aprovação humana, pelas regras que não se negociam. O
`rollback.sql` devolve as colunas e **não devolve os valores** — a mesma honestidade do
`cost_per_kilometer` da spec 038.

### 6. Saem quatro CHECKs, e a fronteira Zod passa a ser a única guarda

`fleet_drivers_license_number_check`, `fleet_drivers_postal_code_check`,
`fleet_drivers_address_state_check` e `fleet_drivers_address_length_check` deixam de existir — não se
valida ciphertext. `fleet_drivers_dates_check` é **reescrito** para cobrir só `license_expires_at`; o
piso de 1900 de `birth_date` passa a ser só do Zod.

Isso é perda real: o banco para de ser a última linha para esses campos. Fica assim porque a
alternativa é não criptografar.

### 7. Quem abre o envelope é o use case, não o mapper

O repositório devolve o envelope; a camada `application/` o abre, como
`nfse-credential-secret.service.ts` faz. `mapDriver` e `toDriverColumns` são síncronos e puros;
torná-los `async` contaminaria todo chamador e poria criptografia em `infrastructure/`, onde a casa
não a coloca.

## Consequências

- Os campos criptografados **não podem ser filtrados, ordenados nem agregados**. Aceito porque não há
  consumidor: no dia em que "motoristas por UF" for pedido, ou nasce um índice cego para a UF, ou a
  UF sai do envelope — decisão daquela spec, não desta.
- O aviso de CNH a vencer continua possível pela data, que ficou em claro. Se a mensagem quiser
  **imprimir o número** da habilitação, o `cron-transportada` precisa do chaveiro no deploy de
  `notification.schedules.run`, que hoje não o tem. O parser de chaveiro já está copiado lá para o
  trilho de NFS-e; o que falta é a variável.
- **Não existe rotação de chave neste repositório**, para nenhum envelope — nem para as credenciais de
  NFS-e. O `keyId` no envelope deixa a porta aberta; o trabalho de re-selar linha não está escrito.
  Isto passa a ser lacuna conhecida do produto, não desta ficha.
- O CPF do motorista continua em claro em dois lugares, por decisão. Qualquer varredura futura de
  conformidade vai achá-lo, e vai achar esta linha explicando.
- **Execução é spec própria.** Esta ADR fecha a decisão da T009; migração, backfill, índice cego,
  contração aprovada e os contratos de teste são trabalho com `tasks.md` e `evidence.md` próprios.

## Alternativas consideradas

- **Não criptografar nada e registrar que a instalação dedicada basta.** É o outro lado que a T009
  admitia. Rejeitada porque o §5 nomeia data de nascimento, o custo hoje é o menor que vai existir
  (nenhum leitor) e adiar reproduz exatamente o cenário que a task queria evitar — decidir depois de
  o leitor existir, como já aconteceu com o CPF.
- **Apagar os campos que ninguém lê** (minimização do art. 6º). Rejeitada: eles são funcionalidade
  desejada, mantida de propósito na spec 046, com formulário e ADR-0037 construídos em volta.
- **`pgcrypto` / criptografia na coluna pelo banco.** Rejeitada: a chave passaria a viver no banco, o
  que anula o "chave de aplicação separada da chave do banco" do §5.
- **Criptografia de volume/disco.** Rejeitada como substituta: defende furto de disco, não credencial
  somente-leitura nem `pg_dump` indevido, que é a ameaça deste achado. Complementar, não alternativa.
- **Coluna por coluna, um envelope cada.** Rejeitada: dez nonces e dez AADs para campos que sempre se
  leem juntos, sem ganho de granularidade — não há caminho que leia só o bairro.

## Adendo 2026-08-23 — o RG entra no mesmo envelope

A ficha ganhou `identity_document`, `identity_document_issuer` e `identity_document_state`: o trio
"DOC. IDENTIDADE / ÓRG. EMISSOR / UF" que a CNH imprime, pedido para a ficha reproduzir a carteira.
Ele nasceu em `text` em claro, e **também não tem leitor** — nem MDF-e, nem relatório, nem
notificação, exatamente como `birth_date` e `license_number`.

O número do RG é documento de identificação civil: o §5 não o nomeia, mas ele é da mesma classe que a
lista nomeia, e a decisão 1 já vale por analogia. **Os três entram no `person_envelope`**, não só o
número: órgão e UF sozinhos não identificam ninguém, mas são sempre lidos com o número — a ficha abre
inteira —, e deixá-los fora criaria a granularidade que a última alternativa rejeitada já descartou.

Consequências para o que estava escrito:

- A decisão 5 passa a derrubar **treze** colunas em claro na contração, não dez.
- A decisão 6 recebe mais uma baixa: `fleet_drivers_identity_document_issuer_check`, o CHECK que hoje
  amarra o órgão ao catálogo fechado de dezessete siglas, deixa de existir — não se valida ciphertext.
  A guarda passa a ser só a lista fechada do Zod na fronteira, e a paridade dela com o frontend
  continua sendo `test/fleet/identity-document.contract.ts`. Perda real, pelo mesmo motivo da 6: a
  alternativa é não criptografar.
- **Não há índice cego novo.** O RG não é único no produto — a unicidade da ficha é o CPF, e o RG
  colide legitimamente entre estados —, então o trio só precisa abrir e fechar.

O que **não** muda: o AAD, o algoritmo, o formato do envelope e a regra de que quem abre é o use case.
E a janela continua sendo a que a T009 nomeou — este campo entrou hoje sem leitor, e é agora que sair
de claro custa uma app só. Quem for escrever o primeiro leitor do RG passa a ter de abrir envelope.
