# 186 — O CEP corre em paralelo

## Problema e resultado

Medido em staging em 24/09/2026 (`GET /postal-codes/{cep}`, log HTTP do serviço `api`):

| CEP        | tempo na API | por quê                                     |
| ---------- | ------------ | ------------------------------------------- |
| `01310100` | 96 ms        | nosso banco sabia                           |
| `20040020` | 2071 ms      | banco não sabia → BrasilAPI `/cep/v2`       |
| `14412314` | 2084 ms      | banco em 15 ms, BrasilAPI aberta por 2,06 s |

A BrasilAPI `/cep/v2` resolve a coordenada do CEP, e é isso que custa ~2,3 s quando o CEP não está no
cache dela (medido: `14412314` v2 2,29 s × v1 0,09 s). A v2 fica — a coordenada é necessária (o
worker a usa na geocodificação, ADR-0044, e o produto quer a coordenada do CEP no cadastro também).
O que sai é a **espera em fila**: a spec 050 fixou `banco → BrasilAPI → ViaCEP` em sequência, e o
operador olha "Consultando o CEP…" durante a BrasilAPI inteira.

**Resultado:** a busca corre em paralelo — o banco e os provedores partem juntos — e entra na corrida
um terceiro provedor público, a **AwesomeAPI** (`cep.awesomeapi.com.br/json/{cep}`): medida em
0,06–0,08 s, devolve logradouro, bairro, cidade, UF e coordenada no mesmo corpo, sem token.

## O que muda da spec 050

- **Degraus 1, 2 e 3 viram uma corrida só.** Banco e provedor externo partem juntos; entre os
  provedores, BrasilAPI, AwesomeAPI e ViaCEP partem juntos.
- **Vence a primeira resposta completa** (logradouro, cidade e UF — `isCompletePostalCodeSuggestion`),
  a mesma regra que a 050 já usa dentro do banco. Resposta parcial nunca vence a corrida.
- **Ninguém completo:** o parcial do provedor vale mais que o parcial do banco (como hoje), e entre
  provedores vale a ordem configurada — BrasilAPI, AwesomeAPI, ViaCEP.
- **Os provedores perdedores são abortados** quando um vence. O banco não é abortado (ele termina em
  milissegundos, e a porta não recebe `AbortSignal`).
- **Banco quebrado continua subindo para a fronteira** — mas só se nenhuma resposta completa já tiver
  vencido. Antes, com o banco na frente, a falha dele nunca deixava o provedor ser chamado; agora o
  provedor já foi chamado, e um endereço completo na mão não é descartado por causa do banco.

## O Google também corre (decidido pelo usuário em 24/09/2026)

Com `GOOGLE_MAPS_API_KEY` presente, o **Google Geocoding** entra na mesma corrida, em todo CEP — a
opção "só quando os gratuitos falham" foi oferecida e recusada. Medido com a chave de staging:
`14412-314` em 0,70 s, logradouro por extenso em `long_name`, bairro em `sublocality`, UF em
`short_name`. Sem variável nova: a chave é a mesma do lote de medição (ADR-0061).

- **Resposta de outro CEP é vazia.** Filtrado por `postal_code`, o Google ainda devolve o vizinho
  quando não acha o exato; aceitar seria preencher a rua de outro CEP.
- **Custo:** toda busca de CEP vira uma chamada paga, inclusive quando o banco ou a AwesomeAPI já
  sabiam — a ADR-0044 tinha limitado o custo do Google a endereço **novo**.
- **Licença:** os termos do Google Maps Platform não permitem armazenamento permanente do resultado
  (ADR-0044 §3), e o que o CEP preenche é gravado na ficha. Risco aceito na decisão; fica registrado
  em `docs/SECURITY.md`.

## Consequências aceitas

- **Todo CEP consultado sai para três terceiros**, inclusive quando o banco sabia. A 050 registrou o
  acerto local como "transferência a terceiro que não acontece" (`docs/SECURITY.md`). O dado é **oito
  dígitos de CEP** e mais nada — sem empresa, sem nome, sem número da casa; a porta do provedor
  continua sem `companyId`.
- **O achado de 2026-08-21 (rota de CEP sem limitador) pesa três vezes mais**: um cliente em laço
  vira três chamadas externas por requisição. Fica registrado no `docs/SECURITY.md`, sem mudar a
  prioridade do limitador.
- **AwesomeAPI é serviço gratuito sem SLA.** Ela é um provedor a mais na corrida, não o único:
  fora do ar, a BrasilAPI e o ViaCEP seguem respondendo. Vazio no ambiente desliga.

## Fora do escopo

- Devolver a coordenada na resposta de `GET /postal-codes` — a corrida já escolhe um provedor que a
  traz, mas o contrato da rota e o formulário mudam numa spec própria, depois de decidir onde ela é
  gravada.
- O worker e a sua BrasilAPI `/cep/v2` da geocodificação — não mudam.

## Critérios de aceite

- [ ] Banco e provedor são consultados ao mesmo tempo (contrato do caso de uso)
- [ ] Os três provedores são consultados ao mesmo tempo, e o perdedor é abortado (contrato do gateway)
- [ ] AwesomeAPI lida pelo formato real (`address`, `district`, `city`, `state`), `404` é vazio
- [ ] `POSTAL_CODE_AWESOME_API_URL` no schema de ambiente, no `.env.example` e no `.railway/railway.ts`
- [ ] Google na corrida quando há chave; resposta de outro CEP e `status` diferente de `OK` são vazias
- [ ] `docs/SECURITY.md` registra os destinos e o efeito no achado do limitador
