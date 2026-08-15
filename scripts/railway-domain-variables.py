#!/usr/bin/env python3
"""
Copyright (c) 2026 Ada Technology. All rights reserved.

This source code is proprietary and confidential. Unauthorized copying,
modification, distribution, or use of this file, via any medium, is
strictly prohibited without prior written permission from Ada Technology.

Aplica as variaveis acopladas a dominio de um ambiente.

    ./scripts/railway-domain-variables.py staging            # so mostra o diff
    ./scripts/railway-domain-variables.py staging --apply     # escreve

Idempotente: so escreve o que difere. Sem `--apply` nao muda nada.

Mudar variavel no Railway dispara **build**, nao restart — e por isso que o frontend pega os
`VITE_*` novos, que sao `ARG` de build e ficam inlinados no bundle.

Antes de rodar isto, acrescente a origem nova ao client do Keycloak com
`./scripts/keycloak-client-origins.py <ambiente> add-origin <origem>`: `FRONTEND_ORIGIN` aceita
**uma** origem so (o regex de `environment.schema.ts` rejeita lista), entao a virada do CORS e
seca, e o client precisa aceitar a origem nova antes de o frontend passar a usa-la.
"""

import json
import os
import sys
import urllib.error
import urllib.request

RAILWAY_CONFIG = os.path.expanduser("~/.railway/config.json")
GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2"
PROJECT_ID = "62de4c69-216a-4335-93a0-4942c6a95c54"
ZONE = "fernandes-transportadora.com.br"

ENVIRONMENT_IDS = {
    "staging": "3cd99844-5712-40d2-aca7-75b25965419e",
    "production": "4e24a47a-1514-4106-9d38-52420bd4cef6",
}
SERVICE_IDS = {
    "api": "6b1a144c-b02c-4ef6-b70e-728c0932cd61",
    "frontend": "2455acc6-045d-452a-9fc4-f6cddc2cf652",
    "keycloak": "ad34c958-05ef-4cca-a0a5-9937d36028f6",
}
PREFIX = {"staging": "staging.", "production": ""}
REALM = "transportada"


def call(query, variables=None):
    token = json.load(open(RAILWAY_CONFIG))["user"]["accessToken"]
    request = urllib.request.Request(
        GRAPHQL_ENDPOINT,
        data=json.dumps({"query": query, "variables": variables or {}}).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token,
            "User-Agent": "transportada/railway-domains",
        },
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"HTTP {error.code}: {error.read().decode()[:600]}")
    if "errors" in payload:
        raise SystemExit(json.dumps(payload["errors"], indent=2))
    return payload["data"]


def desired(environment):
    prefix = PREFIX[environment]
    api = f"https://api.{prefix}{ZONE}"
    app = f"https://app.{prefix}{ZONE}"
    auth = f"https://auth.{prefix}{ZONE}"
    return {
        "keycloak": {
            "KC_HOSTNAME": auth,
            "KEYCLOAK_FRONTEND_ORIGIN": app,
        },
        "api": {
            "FRONTEND_ORIGIN": app,
            "KEYCLOAK_ISSUER": f"{auth}/realms/{REALM}",
            "KEYCLOAK_JWKS_URI": f"{auth}/realms/{REALM}/protocol/openid-connect/certs",
        },
        "frontend": {
            "VITE_API_URL": api,
            "VITE_APP_URL": app,
            "VITE_KEYCLOAK_URL": auth,
        },
    }


def main():
    environment = sys.argv[1]
    apply_changes = len(sys.argv) > 2 and sys.argv[2] == "--apply"

    for service, wanted in desired(environment).items():
        current = call(
            """
            query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
              variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
            }
            """,
            {
                "projectId": PROJECT_ID,
                "environmentId": ENVIRONMENT_IDS[environment],
                "serviceId": SERVICE_IDS[service],
            },
        )["variables"]

        changes = {key: value for key, value in wanted.items() if current.get(key) != value}
        print(f"== {environment} / {service}")
        if not changes:
            print("   nada a mudar")
            continue
        for key, value in changes.items():
            print(f"   {key}\n      de:   {current.get(key)}\n      para: {value}")

        if apply_changes:
            call(
                """
                mutation ($input: VariableCollectionUpsertInput!) {
                  variableCollectionUpsert(input: $input)
                }
                """,
                {
                    "input": {
                        "projectId": PROJECT_ID,
                        "environmentId": ENVIRONMENT_IDS[environment],
                        "serviceId": SERVICE_IDS[service],
                        "variables": changes,
                    }
                },
            )
            print("   aplicado")


if __name__ == "__main__":
    main()
