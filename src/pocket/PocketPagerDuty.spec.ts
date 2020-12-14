import { Testing, TerraformStack } from 'cdktf';
import { PocketPagerDuty, PocketPagerDutyProps } from './PocketPagerDuty';

const config: PocketPagerDutyProps = {
  prefix: 'Test-Env',
  service: {
    criticalEscalationPolicyId: 'critical-id',
    nonCriticalEscalationPolicyId: 'non-critical-id',
  },
};

test('renders a Pocket PagerDuty for critical and non-critical actions', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketPagerDuty(stack, 'test-pagerduty', config);

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket PagerDuty with custom auto resolve timeout', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketPagerDuty(stack, 'test-pagerduty', {
    ...config,
    service: {
      ...config.service,
      autoResolveTimeout: 4,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket PagerDuty with custom acknowledgement timeout', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketPagerDuty(stack, 'test-pagerduty', {
    ...config,
    service: {
      ...config.service,
      acknowledgementTimeout: 100,
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket PagerDuty with sns topic tags', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketPagerDuty(stack, 'test-pagerduty', {
    ...config,
    sns: {
      topic: {
        tags: {
          Test: 'Topic',
        },
      },
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});

test('renders a Pocket PagerDuty with custom sns topic subscription confirmation timeout in minutes', () => {
  const app = Testing.app();
  const stack = new TerraformStack(app, 'test');

  new PocketPagerDuty(stack, 'test-pagerduty', {
    ...config,
    sns: {
      subscription: {
        confirmationTimeoutInMinutes: 10,
      },
    },
  });

  expect(Testing.synth(stack)).toMatchSnapshot();
});
