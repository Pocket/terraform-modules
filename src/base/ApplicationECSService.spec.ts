import { Testing, TerraformStack } from 'cdktf';
import {
  ApplicationECSService,
  ApplicationECSServiceProps,
} from './ApplicationECSService';

const BASE_CONFIG: ApplicationECSServiceProps = {
  prefix: 'abides-',
  name: 'ecsiguess',
  ecsCluster: 'gorp',
  vpcId: 'myhouse',
  taskDefinition: {
    port: 8080,
    containerName: 'dudescar',
    containerDefinitions: [
      {
        containerName: 'dudescar',
      },
    ],
  },
};

test('renders an ECS service with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSService(stack, 'testECSService', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an ECS service with full container definition props', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.taskDefinition.containerDefinitions = [
    {
      containerName: 'dudescar',
      containerImage: 'beverage-here/0.1',
      envVars: {
        rug: 'tiedtheroomtogether',
      },
      secretEnvVars: {
        donnie: 'throwinrockstonight',
      },
    },
  ];

  new ApplicationECSService(stack, 'testECSService', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an ECS service with full container definition props and ALB security group config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.taskDefinition.containerDefinitions = [
    {
      containerName: 'dudescar',
      containerImage: 'beverage-here/0.1',
      envVars: {
        rug: 'tiedtheroomtogether',
      },
      secretEnvVars: {
        donnie: 'throwinrockstonight',
      },
    },
  ];

  BASE_CONFIG.albSecurityGroupConfig = {
    containerPort: 3000,
    albSecurityGroupId: 'strike',
  };

  new ApplicationECSService(stack, 'testECSService', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});
