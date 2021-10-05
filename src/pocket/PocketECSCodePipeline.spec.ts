import { Testing } from 'cdktf';
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
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', config);
  });
  expect(synthed).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with tags', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', {
      ...config,
      tags: { yup: 'a tag' },
    });
  });
  expect(synthed).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided code build project name', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', {
      ...config,
      codeBuildProjectName: 'TestBuildName',
    });
  });
  expect(synthed).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided CodeDeploy app name', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', {
      ...config,
      codeDeploy: {
        applicationName: 'TestAppName',
      },
    });
  });
  expect(synthed).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided CodeDeploy deployment group name', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', {
      ...config,
      codeDeploy: {
        deploymentGroupName: 'TestDeploymentGroupName',
      },
    });
  });
  expect(synthed).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided appspec path', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', {
      ...config,
      codeDeploy: {
        appSpecPath: 'testappspec.json',
      },
    });
  });
  expect(synthed).toMatchSnapshot();
});

test('renders a Pocket ECS Codepipeline template with the provided taskdef path', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketECSCodePipeline(stack, 'test-codepipeline', {
      ...config,
      codeDeploy: {
        taskDefPath: 'testtaskdef.json',
      },
    });
  });
  expect(synthed).toMatchSnapshot();
});
