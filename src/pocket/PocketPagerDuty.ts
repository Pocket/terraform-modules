import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  DataPagerdutyVendor,
  Service,
  ServiceIntegration,
} from '../../.gen/providers/pagerduty';
import { SnsTopic, SnsTopicSubscription } from '@cdktf/provider-aws';

export interface PocketPagerDutyProps {
  prefix: string;
  service: {
    autoResolveTimeout?: number;
    acknowledgementTimeout?: number;
    criticalEscalationPolicyId: string;
    nonCriticalEscalationPolicyId: string;
  };
  sns?: {
    topic?: {
      tags?: { [key: string]: string };
    };
    subscription?: {
      confirmationTimeoutInMinutes?: number;
    };
  };
}

export enum PAGERDUTY_SERVICE_URGENCY {
  CRITICAL = 'Critical',
  NON_CRITICAL = 'Non-Critical',
}

export class PocketPagerDuty extends Resource {
  static readonly SERVICE_AUTO_RESOLVE_TIMEOUT = '14400';
  static readonly SERVICE_ACKNOWLEDGEMENT_TIMEOUT = '600';
  static readonly SNS_SUBSCRIPTION_CONFIRMATION_TIMEOUT_IN_MINUTES = 2;
  public readonly snsCriticalAlarmTopic: SnsTopic;
  public readonly snsNonCriticalAlarmTopic: SnsTopic;
  private config: PocketPagerDutyProps;

  constructor(scope: Construct, name: string, config: PocketPagerDutyProps) {
    super(scope, name);

    this.config = config;

    const sentryVendor = this.getVendor('Sentry');

    const cloudwatchVendor = this.getVendor('Cloudwatch');

    const pagerDutyCritical = this.createService(
      PAGERDUTY_SERVICE_URGENCY.CRITICAL
    );

    const pagerDutyNonCritical = this.createService(
      PAGERDUTY_SERVICE_URGENCY.NON_CRITICAL
    );

    this.createServiceIntegration(
      sentryVendor,
      pagerDutyCritical,
      PAGERDUTY_SERVICE_URGENCY.CRITICAL
    );

    this.createServiceIntegration(
      sentryVendor,
      pagerDutyNonCritical,
      PAGERDUTY_SERVICE_URGENCY.NON_CRITICAL
    );

    const cloudwatchCriticalIntegration = this.createServiceIntegration(
      cloudwatchVendor,
      pagerDutyCritical,
      PAGERDUTY_SERVICE_URGENCY.CRITICAL
    );

    const cloudwatchNonCriticalIntegration = this.createServiceIntegration(
      cloudwatchVendor,
      pagerDutyNonCritical,
      PAGERDUTY_SERVICE_URGENCY.NON_CRITICAL
    );

    const snsCriticalAlarmTopic = (this.snsCriticalAlarmTopic =
      this.createSnsTopic(PAGERDUTY_SERVICE_URGENCY.CRITICAL));

    const snsNonCriticalAlarmTopic = (this.snsNonCriticalAlarmTopic =
      this.createSnsTopic(PAGERDUTY_SERVICE_URGENCY.NON_CRITICAL));

    this.createSnsTopicSubscription(
      snsCriticalAlarmTopic,
      cloudwatchCriticalIntegration,
      PAGERDUTY_SERVICE_URGENCY.CRITICAL
    );

    this.createSnsTopicSubscription(
      snsNonCriticalAlarmTopic,
      cloudwatchNonCriticalIntegration,
      PAGERDUTY_SERVICE_URGENCY.NON_CRITICAL
    );
  }

  private createSnsTopicSubscription(
    topic: SnsTopic,
    integration: ServiceIntegration,
    urgency: PAGERDUTY_SERVICE_URGENCY
  ): SnsTopicSubscription {
    return new SnsTopicSubscription(
      this,
      `alarm-${urgency.toLowerCase()}-subscription`,
      {
        topicArn: topic.arn,
        protocol: 'https',
        endpoint: `https://events.pagerduty.com/integration/${integration.integrationKey}/enqueue`,
        endpointAutoConfirms: true,
        confirmationTimeoutInMinutes:
          this.config.sns?.subscription?.confirmationTimeoutInMinutes ??
          PocketPagerDuty.SNS_SUBSCRIPTION_CONFIRMATION_TIMEOUT_IN_MINUTES,
        dependsOn: [topic, integration],
      }
    );
  }

  private createSnsTopic(urgency: PAGERDUTY_SERVICE_URGENCY): SnsTopic {
    return new SnsTopic(this, `alarm-${urgency.toLowerCase()}-topic`, {
      name: `${this.config.prefix}-Infrastructure-Alarm-${urgency}`,
      tags: this.config.sns?.topic?.tags ?? {},
    });
  }

  private createServiceIntegration(
    vendor: DataPagerdutyVendor,
    service: Service,
    urgency: PAGERDUTY_SERVICE_URGENCY
  ): ServiceIntegration {
    return new ServiceIntegration(
      this,
      `${vendor.name}-${urgency.toLowerCase()}`,
      {
        name: vendor.name,
        service: service.id,
        vendor: vendor.id,
        dependsOn: [service],
      }
    );
  }

  private createService(urgency: PAGERDUTY_SERVICE_URGENCY): Service {
    const serviceConfig = this.config.service;

    return new Service(this, `pagerduty-${urgency.toLowerCase()}`, {
      name: `${this.config.prefix}-PagerDuty-${urgency}`,
      acknowledgementTimeout:
        serviceConfig.acknowledgementTimeout?.toString() ??
        PocketPagerDuty.SERVICE_ACKNOWLEDGEMENT_TIMEOUT,
      alertCreation: 'create_incidents',
      autoResolveTimeout:
        serviceConfig.autoResolveTimeout?.toString() ??
        PocketPagerDuty.SERVICE_AUTO_RESOLVE_TIMEOUT,
      description: `PagerDuty ${urgency}`,
      escalationPolicy:
        urgency === PAGERDUTY_SERVICE_URGENCY.CRITICAL
          ? serviceConfig.criticalEscalationPolicyId
          : serviceConfig.nonCriticalEscalationPolicyId,
      incidentUrgencyRule: [
        {
          type: 'constant',
          urgency:
            urgency === PAGERDUTY_SERVICE_URGENCY.CRITICAL ? 'high' : 'low',
        },
      ],
    });
  }

  private getVendor(name: string): DataPagerdutyVendor {
    return new DataPagerdutyVendor(this, name.toLowerCase(), {
      name,
    });
  }
}
