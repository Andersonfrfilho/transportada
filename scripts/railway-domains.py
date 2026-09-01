#!/usr/bin/env python3
"""
Copyright (c) 2026 Ada Technology. All rights reserved.

This source code is proprietary and confidential. Unauthorized copying,
modification, distribution, or use of this file, via any medium, is
strictly prohibited without prior written permission from Ada Technology.

Garante os dominios proprios de um ambiente no Railway e imprime os registros de DNS que faltam
criar na zona.

    ./scripts/railway-domains.py staging
    ./scripts/railway-domains.py production

Idempotente: dominio que ja existe e apenas consultado. Nada aqui mexe em DNS — a zona
`fernandes-transportadora.com.br` responde pela KingHost (`dns1`/`dns2.kinghost.com.br`) e so muda
por la. O apex nao entra: ele serve o site institucional, e CNAME na raiz e proibido pelo RFC 1034.

Por que nao e `railway domain <dominio>`: a CLI responde `Unauthorized` em dominio customizado,
enquanto a mesma operacao passa pela API GraphQL. E a CLI tambem nao mostra o estado do registro,
que e justamente o que se quer olhar enquanto o DNS propaga.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from typing import Optional

RAILWAY_CONFIG = os.path.expanduser("~/.railway/config.json")
GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "62de4c69-216a-4335-93a0-4942c6a95c54"
ZONE = "fernandes-transportadora.com.br"

ENVIRONMENT_IDS = {
    "staging": "3cd99844-5712-40d2-aca7-75b25965419e",
    "production": "4e24a47a-1514-4106-9d38-52420bd4cef6",
}

# Nome do servico e rotulo de dominio sao campos independentes: o servico pertence ao projeto (é o
# mesmo nos dois ambientes), o dominio pertence ao par servico/ambiente.
SERVICE_IDS = {
    "api": "6b1a144c-b02c-4ef6-b70e-728c0932cd61",
    "frontend": "2455acc6-045d-452a-9fc4-f6cddc2cf652",
    "keycloak": "ad34c958-05ef-4cca-a0a5-9937d36028f6",
    "landing": "44d3d4b8-5ad4-4c26-a452-6740985bde35",
}

# Servico interno (`worker`, `cron`, `rabbitmq`, bancos) nao recebe dominio: fala so por
# `*.railway.internal`. Dominio publico neles entrega a topologia da infra a quem perguntar.
DOMAINS = {
    "production": (
        ("api", f"api.{ZONE}"),
        ("frontend", f"app.{ZONE}"),
        ("keycloak", f"auth.{ZONE}"),
        # A landing de production e o apex (`fernandes-transportadora.com.br`), e ele so entra aqui
        # depois de dois passos: o primeiro deploy de production (dominio em servico sem instancia
        # responde `ServiceInstance not found`) e a zona na Cloudflare (CNAME na raiz e proibido
        # pelo RFC 1034; sem flattening o apex nao aponta para o Railway).
    ),
    "staging": (
        ("api", f"api.staging.{ZONE}"),
        ("frontend", f"app.staging.{ZONE}"),
        ("keycloak", f"auth.staging.{ZONE}"),
        # A landing e o dominio, sem rotulo de servico: em staging isso e o proprio `staging.<zona>`.
        ("landing", f"staging.{ZONE}"),
    ),
}


def call(query: str, variables: Optional[dict] = None) -> dict:
    # O token e o da sessao da CLI (`railway login`); nunca e impresso nem gravado em outro lugar.
    token = json.load(open(RAILWAY_CONFIG))["user"]["accessToken"]
    request = urllib.request.Request(
        GRAPHQL_ENDPOINT,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            # Sem User-Agent proprio a borda do Railway responde 403 antes do GraphQL.
            "User-Agent": "transportada/railway-domains",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"HTTP {error.code}: {error.read().decode()[:400]}")

    if "errors" in payload:
        raise SystemExit(json.dumps(payload["errors"], indent=2))

    return payload["data"]


def list_custom_domains(environment: str, service: str) -> list:
    return call(
        """
        query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
          domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
            customDomains {
              domain
              status {
                certificateStatus
                verified
                verificationDnsHost
                verificationToken
                dnsRecords { hostlabel recordType requiredValue currentValue status }
              }
            }
          }
        }
        """,
        {
            "projectId": PROJECT_ID,
            "environmentId": ENVIRONMENT_IDS[environment],
            "serviceId": SERVICE_IDS[service],
        },
    )["domains"]["customDomains"]


def create_custom_domain(environment: str, service: str, domain: str) -> None:
    # `targetPort` fica de fora de proposito: os dominios gerados do projeto tem `targetPort: null`
    # e o Railway infere a porta do processo. Cravar 8080 aqui divergiria do que ja funciona.
    call(
        """
        mutation ($input: CustomDomainCreateInput!) {
          customDomainCreate(input: $input) { id }
        }
        """,
        {
            "input": {
                "domain": domain,
                "environmentId": ENVIRONMENT_IDS[environment],
                "projectId": PROJECT_ID,
                "serviceId": SERVICE_IDS[service],
            }
        },
    )


def short(value: str) -> str:
    return value.rsplit("_", 1)[-1].lower()


def print_table(header: tuple, rows: list) -> None:
    if not rows:
        return
    widths = [
        max([len(row[column]) for row in rows] + [len(header[column])])
        for column in range(len(header))
    ]
    print()
    print("  ".join(header[column].ljust(widths[column]) for column in range(len(header))))
    print("  ".join("-" * widths[column] for column in range(len(header))))
    for row in rows:
        print("  ".join(row[column].ljust(widths[column]) for column in range(len(header))))


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in DOMAINS:
        raise SystemExit(f"uso: {sys.argv[0]} {'|'.join(DOMAINS)}")
    environment = sys.argv[1]

    routing_rows = []
    verification_rows = []

    for service, domain in DOMAINS[environment]:
        existing = {item["domain"]: item for item in list_custom_domains(environment, service)}
        if domain not in existing:
            create_custom_domain(environment, service, domain)
            print(f"--> criado {domain} ({environment}/{service})")
            existing = {item["domain"]: item for item in list_custom_domains(environment, service)}

        status = existing[domain]["status"]
        for record in status["dnsRecords"]:
            routing_rows.append(
                (
                    record["hostlabel"] or "@",
                    short(record["recordType"]),
                    record["requiredValue"],
                    short(record["status"]),
                    short(status["certificateStatus"]),
                )
            )

        # Sem o TXT de posse o certificado fica preso em `validating_ownership` para sempre: o CNAME
        # apontando certo prova roteamento, nao propriedade do nome.
        if not status["verified"]:
            verification_rows.append(
                (status["verificationDnsHost"], "txt", status["verificationToken"])
            )

    print_table(("host", "tipo", "valor", "dns", "certificado"), routing_rows)
    print_table(("host", "tipo", "valor"), verification_rows)

    print(f"\ncrie estes registros na zona {ZONE} (KingHost).")
    print("nada acima altera apex, MX ou SPF — o e-mail do dominio continua na KingHost.")


if __name__ == "__main__":
    sys.exit(main())
