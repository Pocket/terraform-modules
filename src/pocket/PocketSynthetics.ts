import { Resource } from 'cdktf';
import { Construct } from 'constructs';

import {
  SyntheticsMonitor,
  NrqlAlertCondition,
} from '@cdktf/provider-newrelic';

export interface PocketSyntheticProps {
  uri: string;
  verifySsl: boolean;
  policyId?: number;
}

const globalCheckLocations = [
  'AWS_US_WEST_2',
  'AWS_EU_WEST_2',
  'AWS_US_EAST_2',
];

export class PocketSyntheticCheck extends Resource {
  constructor(
    scope: Construct,
    private name: string,
    private config: PocketSyntheticProps
  ) {
    super(scope, name);

    // if policy id not provided use default policy id
    // policy in another
    if (this.config.policyId === undefined) {
      // I wanted to do a terraform lookup but it doesn't run before generating
      // the cdktf.json file so we have to hardcode the default policy id
      this.config.policyId = 1707149; // Pocket-Default-Policy
    }

    const pocketMonitor = new SyntheticsMonitor(
      this,
      `${this.name}-synthetics-monitor`,
      {
        name: `${this.name}-synthetics`,
        type: 'SIMPLE',
        frequency: 5,
        status: 'ENABLED',
        locations: globalCheckLocations,
        uri: this.config.uri,
        verifySsl: this.config.verifySsl,
      }
    );

    new NrqlAlertCondition(this, 'alert-condition', {
      name: `${this.name}-nrql`,
      policyId: this.config.policyId,
      nrql: {
        query: `SELECT count(result) from SyntheticCheck where result = 'FAILED' and monitorName = '${pocketMonitor.name}'`,
        evaluationOffset: 3,
      },
      valueFunction: 'sum',
      violationTimeLimitSeconds: 2592000,
      closeViolationsOnExpiration: true,
      expirationDuration: 600,
      critical: {
        operator: 'above',
        threshold: 2,
        thresholdDuration: 900,
        thresholdOccurrences: 'AT_LEAST_ONCE',
      },
    });
  }
}
