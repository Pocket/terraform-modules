import { Testing } from 'cdktf';
import { PocketSyntheticCheck, PocketSyntheticProps } from './PocketSynthetic';

const config: PocketSyntheticProps = {
  config: {
    url: 'acme.getpocket.dev',
    path: '/healthz',
    port: '443',
    protocol: 'https:',
  },
  environment: 'test',
  artifactS3Location: 's3://not-a-real-thing',
};

test('renders a Pocket Synthetic check for acme.getpocket.dev', () => {
  const synthed = Testing.synthScope((stack) => {
    new PocketSyntheticCheck(stack, 'test-synthetic', config);
  });
  expect(synthed).toMatchSnapshot();
});

test('pass a completely custom test for synthetics', () => {
  delete config.config;
  config.check = `
  console.log('I am a synthetic-check');
`;
  const synthed = Testing.synthScope((stack) => {
    new PocketSyntheticCheck(stack, 'test-synthetic', config);
  });
  expect(synthed).toMatchSnapshot();
});
