import { TerraformStack, Testing } from 'cdktf';
import { ApplicationRDSCluster } from './ApplicationRDSCluster';

test('renders a RDS cluster', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationRDSCluster(stack, 'testRDSCluster', {
    prefix: 'bowling-',
    vpcId: 'rug',
    subnetIds: ['0', '1'],
    rdsConfig: {
      masterUsername: 'walter',
      databaseName: 'walter',
    },
    tags: {
      whodis: 'walter',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
