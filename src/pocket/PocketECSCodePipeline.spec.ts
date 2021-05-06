import { TerraformStack, Testing } from 'cdktf';
import {
  PocketECSCodePipeline,
  PocketECSCodePipelineProps,
} from './PocketECSCodePipeline';

const config: PocketECSCodePipelineProps = {
  prefix: 'Test-Env',
  source: {
    repository: 'string',
    branchName: 'test',
    codeStarConnectionArn: 'arn:codestart-connection:*',
  },
};

test('renders a Pocket ECS Codepipeline template', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', {
    ...config,
    tags: { yup: 'a tag' },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided code build project name', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', {
    ...config,
    codeBuildProjectName: 'TestBuildName',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided CodeDeploy app name', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', {
    ...config,
    codeDeploy: {
      applicationName: 'TestAppName',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided CodeDeploy deployment group name', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', {
    ...config,
    codeDeploy: {
      deploymentGroupName: 'TestDeploymentGroupName',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided appspec path', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', {
    ...config,
    codeDeploy: {
      appSpecPath: 'testappspec.json',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided taskdef path', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketECSCodePipeline(stack, 'test-codepipeline', {
    ...config,
    codeDeploy: {
      taskDefPath: 'testtaskdef.json',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
