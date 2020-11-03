import { TerraformStack, Testing } from 'cdktf';
import { ApplicationECSIAM, ApplicationECSIAMProps } from './ApplicationECSIAM';

const BASE_CONFIG: ApplicationECSIAMProps = {
  prefix: 'abides-dev',
  taskExecutionDefaultAttachmentArn: 'someArn',
  taskExecutionRolePolicyStatements: [],
  taskRolePolicyStatements: [],
};

test('renders ECS IAM with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSIAM(stack, 'testECSService', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders ECS IAM with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  BASE_CONFIG.tags = {
    letsgo: 'bowling',
    donnie: 'throwinrockstonight',
  };

  new ApplicationECSIAM(stack, 'testECSService', BASE_CONFIG);

  expect(Testing.synth(stack)).toMatchSnapshot();
});
