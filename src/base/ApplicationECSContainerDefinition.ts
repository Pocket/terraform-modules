export const JSON_TEMPLATE = `
{
  "dnsSearchDomains": null,
  "environmentFiles": null,
  "logConfiguration": {
    "logDriver": "awslogs",
    "secretOptions": [],
    "options": {
      "awslogs-group": [[LOG_GROUP]],
      "awslogs-region": "us-east-1",
      "awslogs-stream-prefix": "ecs"
    }
  },
  "entryPoint": null,
  "portMappings": [[PORT_MAPPINGS]],
  "command": [[COMMAND]],
  "linuxParameters": null,
  "cpu": [[CPU]],
  "environment": [[ENV_VARS]],
  "resourceRequirements": null,
  "ulimits": null,
  "repositoryCredentials": [[REPOSITORY_CREDENTIALS_PARAMETER]],
  "dnsServers": null,
  "mountPoints": [[MOUNT_POINTS]],
  "workingDirectory": null,
  "secrets": [[SECRET_ENV_VARS]],
  "dockerSecurityOptions": null,
  "memory": null,
  "memoryReservation": [[MEMORY_RESERVATION]],
  "volumesFrom": [],
  "stopTimeout": null,
  "image": [[CONTAINER_IMAGE]],
  "startTimeout": null,
  "firelensConfiguration": null,
  "dependsOn": null,
  "disableNetworking": null,
  "interactive": null,
  "healthCheck": [[HEALTH_CHECK]],
  "essential": true,
  "links": null,
  "hostname": null,
  "extraHosts": null,
  "pseudoTerminal": null,
  "user": null,
  "readonlyRootFilesystem": false,
  "dockerLabels": null,
  "systemControls": null,
  "privileged": null,
  "name": [[NAME]]
}`;

interface EnvironmentVariable {
  name: string;
  value: string;
}

interface SecretEnvironmentVariable {
  name: string;
  valueFrom: string;
}

interface HealthcheckVariable {
  command: string[];
  interval: number;
  retries: number;
  startPeriod: number;
  timeout: number;
}

interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol: string;
}

interface MountPoint {
  containerPath: string;
  readOnly: boolean;
  sourceVolume: string;
}

export interface ApplicationECSContainerDefinitionProps {
  containerImage?: string;
  logGroup?: string;
  portMappings?: PortMapping[];
  envVars?: EnvironmentVariable[];
  mountPoints?: MountPoint[];
  secretEnvVars?: SecretEnvironmentVariable[];
  command?: string[];
  name: string;
  repositoryCredentialsParam?: string;
  memoryReservation?: number;
  protocol?: string;
  cpu?: number;
  healthCheck?: HealthcheckVariable;
}

export function buildDefinitionJSON(
  config: ApplicationECSContainerDefinitionProps
): string {
  let templateInstance = JSON_TEMPLATE;

  if (config.command) {
    templateInstance = templateInstance.replace(
      '[[COMMAND]]',
      JSON.stringify(config.command)
    );
  } else {
    templateInstance = templateInstance.replace('"command": [[COMMAND]],', '');
  }

  templateInstance = templateInstance.replace(
    '[[LOG_GROUP]]',
    JSON.stringify(config.logGroup)
  );
  templateInstance = templateInstance.replace(
    '[[PORT_MAPPINGS]]',
    JSON.stringify(config.portMappings ?? [])
  );
  templateInstance = templateInstance.replace(
    '[[CONTAINER_IMAGE]]',
    JSON.stringify(config.containerImage)
  );
  templateInstance = templateInstance.replace(
    '[[NAME]]',
    JSON.stringify(config.name)
  );
  templateInstance = templateInstance.replace(
    '[[REPOSITORY_CREDENTIALS_PARAMETER]]',
    JSON.stringify(
      config.repositoryCredentialsParam
        ? { credentialsParameter: config.repositoryCredentialsParam }
        : null
    )
  );

  // env vars default is [], whereas secrets default is null. makes sense.
  templateInstance = templateInstance.replace(
    '[[ENV_VARS]]',
    JSON.stringify(config.envVars ?? [])
  );
  templateInstance = templateInstance.replace(
    '[[SECRET_ENV_VARS]]',
    JSON.stringify(config.secretEnvVars ?? null)
  );

  templateInstance = templateInstance.replace(
    '[[CPU]]',
    JSON.stringify(config.cpu ?? 0)
  );

  templateInstance = templateInstance.replace(
    '[[MEMORY_RESERVATION]]',
    JSON.stringify(config.memoryReservation ?? null)
  );

  templateInstance = templateInstance.replace(
    '[[HEALTH_CHECK]]',
    JSON.stringify(config.healthCheck ?? null)
  );

  templateInstance = templateInstance.replace(
    '[[MOUNT_POINTS]]',
    JSON.stringify(config.mountPoints ?? [])
  );

  // strip out whitespace and newlines and return
  return templateInstance.replace(/\n/g, '');
  //return templateInstance;
}
