import { Testing, TerraformStack } from 'cdktf';
import { PocketVPC } from './PocketVPC';

test('renders a VPC with minimal config', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketVPC(stack, 'testPocketVPC');

  expect(Testing.synth(stack)).toMatchSnapshot();
});
