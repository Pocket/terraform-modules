import { Testing, TerraformStack } from 'cdktf';
import { ApplicationCertificate } from './ApplicationCertificate';

test('throws an error without a zone id or zone domain', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  expect(() => {
    new ApplicationCertificate(stack, 'testCert', {
      domain: 'dev.gobowling.info',
    });
  }).toThrow('You need to pass either a zone id or a zone domain');
});

test('renders a cert with a zone id', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationCertificate(stack, 'testCert', {
    domain: 'dev.gobowling.info',
    zoneId: 'malibu',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a cert with a zone domain', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationCertificate(stack, 'testCert', {
    domain: 'dev.gobowling.info',
    zoneId: 'gobowling.info',
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a cert with tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new ApplicationCertificate(stack, 'testCert', {
    domain: 'dev.gobowling.info',
    zoneId: 'gobowling.info',
    tags: {
      name: 'thedude',
      hobby: 'bowling',
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
