import { Testing } from 'cdktf';
import { PocketVPC } from './PocketVPC';
import { VPC } from '@cdktf/provider-aws';
import 'cdktf/lib/testing/adapters/jest';

test('renders a VPC with minimal config', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketVPC(stack, 'testPocketVPC');
  });

  expect(synthed).toMatchSnapshot();
  expect(synthed).toHaveDataSource(VPC.DataAwsVpc);
});
