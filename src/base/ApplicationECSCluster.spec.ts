import { Testing, TerraformStack } from 'cdktf';
import { ApplicationECSCluster } from './ApplicationECSCluster';

test('renders an ECS cluster without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSCluster(stack, 'testECSCluster', {
    prefix: 'bowling-',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an ECS cluster with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECSCluster(stack, 'testECSCluster', {
    prefix: 'bowling-',
    tags: {
      name: 'maude',
      description: 'artist',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
