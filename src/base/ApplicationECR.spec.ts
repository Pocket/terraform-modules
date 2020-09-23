import { Testing, TerraformStack } from 'cdktf';
import { ApplicationECR } from './ApplicationECR';

test('renders an ECR without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECR(stack, 'testECR', {
    name: 'bowling',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders an ECR with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationECR(stack, 'testECR', {
    name: 'bowling',
    tags: {
      name: 'rug',
      description: 'tiedtheroomtogether',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
