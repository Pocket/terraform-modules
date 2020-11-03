import { TerraformStack, Testing } from 'cdktf';
import {
  ApplicationECSService,
  ApplicationECSServiceProps,
} from './ApplicationECSService';

let BASE_CONFIG: ApplicationECSServiceProps;

describe('AppliationECSService', () => {
  beforeEach(() => {
    BASE_CONFIG = {
      prefix: 'abides-',
      name: 'ecsiguess',
      ecsCluster: 'gorp',
      vpcId: 'myhouse',
      containerConfigs: [],
      privateSubnetIds: ['1.1.1.1', '2.2.2.2'],
      ecsIamConfig: {
        prefix: 'abides-',
        name: 'ecsiam?',
        taskExecutionDefaultAttachmentArn: 'someArn',
        taskExecutionRolePolicyStatements: [],
        taskRolePolicyStatements: [],
      },
    };
  });

  it('renders an ECS service with minimal config', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    new ApplicationECSService(stack, 'testECSService', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an ECS service with full container definition props', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.launchType = 'ROCKET';
    BASE_CONFIG.deploymentMaximumPercent = 400;
    BASE_CONFIG.deploymentMinimumHealthyPercent = 80;
    BASE_CONFIG.desiredCount = 4;
    BASE_CONFIG.lifecycleIgnoreChanges = ['bowling', 'donnie', 'autobahn'];
    BASE_CONFIG.containerConfigs = [
      {
        containerPort: 3002,
        hostPort: 3001,
        logGroup: 'test/log/group',
        containerImage: 'beverage-here/0.1',
        name: 'lebowski',
        repositoryCredentialsParam: 'someArn',
        envVars: [
          {
            name: 'rug',
            value: 'tiedtheroomtogether',
          },
        ],
        secretEnvVars: [
          {
            name: 'donnie',
            valueFrom: 'throwinrockstonight',
          },
        ],
      },
    ];

    new ApplicationECSService(stack, 'testECSService', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });

  it('renders an ECS service with full container definition props and ALB security group config', () => {
    const app = Testing.app();
    const stack = new TerraformStack(app, 'test');

    BASE_CONFIG.containerConfigs = [
      {
        containerPort: 3002,
        hostPort: 3001,
        logGroup: 'test/log/group',
        containerImage: 'beverage-here/0.1',
        name: 'lebowski',
        repositoryCredentialsParam: 'someArn',
        envVars: [
          {
            name: 'rug',
            value: 'tiedtheroomtogether',
          },
        ],
        secretEnvVars: [
          {
            name: 'donnie',
            valueFrom: 'throwinrockstonight',
          },
        ],
      },
    ];

    BASE_CONFIG.albConfig = {
      containerPort: 3000,
      containerName: 'runme',
      targetGroupArn: 'targetonmyback',
      albSecurityGroupId: 'strike',
    };

    new ApplicationECSService(stack, 'testECSService', BASE_CONFIG);

    expect(Testing.synth(stack)).toMatchSnapshot();
  });
});
