/* Copyright (c) 2026 Ada Technology. MIT License. */
export const DEPLOYMENT_ENVIRONMENTS = ['local', 'staging', 'production'] as const
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number]

type ResolveDeploymentEnvironmentParams = {
  readonly declared: string | undefined
  readonly isDevelopmentBuild: boolean
}

function isDeploymentEnvironment(value: string): value is DeploymentEnvironment {
  return DEPLOYMENT_ENVIRONMENTS.some((environment) => environment === value)
}

/**
 * Variável ausente ou desconhecida cai em `production`: o pior desfecho não é staging sem aviso, é a
 * instalação do cliente exibindo obra em andamento por causa de um valor esquecido no painel.
 */
export function resolveDeploymentEnvironment(
  input: ResolveDeploymentEnvironmentParams,
): DeploymentEnvironment {
  const declared = input.declared?.trim().toLowerCase() ?? ''

  if (isDeploymentEnvironment(declared)) {
    return declared
  }

  return input.isDevelopmentBuild ? 'local' : 'production'
}

export function getDeploymentEnvironment(): DeploymentEnvironment {
  return resolveDeploymentEnvironment({
    declared: import.meta.env.VITE_APP_ENV,
    isDevelopmentBuild: import.meta.env.DEV,
  })
}
