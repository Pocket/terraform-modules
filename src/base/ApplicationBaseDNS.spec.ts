import { Testing, TerraformStack } from 'cdktf';
import { ApplicationBaseDNS } from './ApplicationBaseDNS';

test('renders base DNS without tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationBaseDNS(stack, 'testDNS', {
    domain: 'dev.gobowling.info',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders base DNS with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationBaseDNS(stack, 'testDNS', {
    domain: 'dev.gobowling.info',
    tags: {
      name: 'thedude',
      hobby: 'bowling',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
