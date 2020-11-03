export const JSON_TEMPLATE = `
{
  "dnsSearchDomains": null,
  "environmentFiles": null,
  "logConfiguration": {
    "logDriver": "awslogs",
    "secretOptions": [],
    "options": {
      "awslogs-group": "[[LOG_GROUP]]",
      "awslogs-region": "us-east-1",
      "awslogs-stream-prefix": "ecs"
    }
  },
  "entryPoint": null,
  "portMappings": [
    {
      "hostPort": [[HOST_PORT]],
      "protocol": "tcp",
      "containerPort": [[CONTAINER_PORT]]
    }
  ],
  "command": [[COMMAND]],
  "linuxParameters": null,
  "cpu": 0,
  "environment": [[ENV_VARS]],
  "resourceRequirements": null,
  "ulimits": null,
  "repositoryCredentials": {
    "credentialsParameter": "[[REPOSITORY_CREDENTIALS_PARAMETER]]"
  },
  "dnsServers": null,
  "mountPoints": [],
  "workingDirectory": null,
  "secrets": [[SECRET_ENV_VARS]],
  "dockerSecurityOptions": null,
  "memory": null,
  "memoryReservation": null,
  "volumesFrom": [],
  "stopTimeout": null,
  "image": "[[CONTAINER_IMAGE]]",
  "startTimeout": null,
  "firelensConfiguration": null,
  "dependsOn": null,
  "disableNetworking": null,
  "interactive": null,
  "healthCheck": null,
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
  "name": "[[NAME]]"
}`;

interface EnvironmentVariable {
  name: string;
  value: string;
}

interface SecretEnvironmentVariable {
  name: string;
  valueFrom: string;
}

export interface ApplicationECSContainerDefinitionProps {
  containerImage?: string;
  logGroup?: string;
  hostPort: number;
  containerPort: number;
  envVars?: EnvironmentVariable[];
  secretEnvVars?: SecretEnvironmentVariable[];
  command?: string[];
  name: string;
  repositoryCredentialsParam: string;
}

export function buildDefinitionJSON(
  config: ApplicationECSContainerDefinitionProps
): string {
  let templateInstance = JSON_TEMPLATE;

  // env vars default is [], whereas secrets default is null. makes sense.
  const envVarsValue = config.envVars ? JSON.stringify(config.envVars) : '[]';
  const secretEnvVarsValue = config.secretEnvVars
    ? JSON.stringify(config.secretEnvVars)
    : 'null';

  if (config.command) {
    templateInstance = templateInstance.replace(
      '[[COMMAND]]',
      '[' + config.command.map((c) => `"${c}"`).join(',') + ']'
    );
  } else {
    templateInstance = templateInstance.replace('"command": [[COMMAND]],', '');
  }

  templateInstance = templateInstance.replace('[[LOG_GROUP]]', config.logGroup);
  templateInstance = templateInstance.replace(
    '[[HOST_PORT]]',
    config.hostPort.toString()
  );
  templateInstance = templateInstance.replace(
    '[[CONTAINER_PORT]]',
    config.containerPort.toString()
  );
  templateInstance = templateInstance.replace(
    '[[CONTAINER_IMAGE]]',
    config.containerImage
  );
  templateInstance = templateInstance.replace('[[NAME]]', config.name);
  templateInstance = templateInstance.replace(
    '[[REPOSITORY_CREDENTIALS_PARAMETER]]',
    config.repositoryCredentialsParam
  );
  templateInstance = templateInstance.replace('[[ENV_VARS]]', envVarsValue);
  templateInstance = templateInstance.replace(
    '[[SECRET_ENV_VARS]]',
    secretEnvVarsValue
  );

  // strip out whitespace and newlines and return
  return templateInstance.replace(/\n/g, '');
  //return templateInstance;
}
