import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { ApplicationEventBridgeRule } from '../base/ApplicationEventBridgeRule';
import {
  ApplicationVersionedLambda,
  LAMBDA_RUNTIMES,
} from '../base/ApplicationVersionedLambda';
import {
  CloudwatchMetricAlarm,
  DataAwsIamPolicyDocumentStatement,
  LambdaFunctionVpcConfig,
  LambdaPermission,
} from '../../.gen/providers/aws';
import { ApplicationLambdaCodeDeploy } from '../base/ApplicationLambdaCodeDeploy';

export interface PocketEventBridgeWithLambdaTargetDefaultAlarmProps {
  threshold: number;
  period: number;
  evaluationPeriods?: number;
  datapointsToAlarm?: number;
  comparisonOperator?:
    | 'GreaterThanOrEqualToThreshold'
    | 'GreaterThanThreshold'
    | 'GreaterThanUpperThreshold'
    | 'LessThanLowerOrGreaterThanUpperThreshold'
    | 'LessThanLowerThreshold'
    | 'LessThanOrEqualToThreshold'
    | 'LessThanThreshold';
  alarmDescription?: string;
  actions?: string[];
}

export interface PocketEventBridgeWithLambdaTargetProps {
  name: string;
  lambda: {
    description?: string;
    runtime: LAMBDA_RUNTIMES;
    handler: string;
    timeout?: number;
    environment?: { [key: string]: string };
    vpcConfig?: LambdaFunctionVpcConfig;
    executionPolicyStatements?: DataAwsIamPolicyDocumentStatement[];
    logRetention?: number;
    s3Bucket?: string;
    codeDeploy?: {
      deploySnsTopicArn?: string;
      detailType?: 'BASIC' | 'FULL';
      region: string;
      accountId: string;
    };
    alarms?: {
      invocations?: PocketEventBridgeWithLambdaTargetDefaultAlarmProps;
      errors?: PocketEventBridgeWithLambdaTargetDefaultAlarmProps;
      concurrentExecutions?: PocketEventBridgeWithLambdaTargetDefaultAlarmProps;
      throttles?: PocketEventBridgeWithLambdaTargetDefaultAlarmProps;
      duration?: PocketEventBridgeWithLambdaTargetDefaultAlarmProps;
    };
  };
  eventRule: {
    description?: string;
    eventBusName?: string;
    pattern: { [key: string]: any };
  };
  tags?: { [key: string]: string };
}

export class PocketEventBridgeWithLambdaTarget extends Resource {
  constructor(
    scope: Construct,
    name: string,
    private readonly config: PocketEventBridgeWithLambdaTargetProps
  ) {
    super(scope, name);

    PocketEventBridgeWithLambdaTarget.validateConfig(config);

    const lambda = this.createVersionedLambda();
    const eventBridgeRule = this.createEventBridgeRule(lambda);
    this.createLambdaEventRuleResourcePermission(lambda, eventBridgeRule);

    if (config.lambda.codeDeploy) {
      this.createLambdaCodeDeploy();
    }

    if (config.lambda.alarms) {
      this.createLambdaAlarms(lambda);
    }
  }

  private static validateConfig(
    config: PocketEventBridgeWithLambdaTargetProps
  ) {
    if (!config.lambda.alarms) return;

    const alarms = {
      invocations: 'Invocations',
      errors: 'Errors',
      concurrentExecutions: 'Concurrent Executions',
      throttles: 'Throttles',
      duration: 'Duration',
    };

    const errorMessage =
      'DatapointsToAlarm must be less than or equal to EvaluationPeriods';

    const alarmsConfig = config.lambda.alarms;

    Object.keys(alarms).forEach((key) => {
      if (
        alarmsConfig[key]?.datapointsToAlarm >
        (alarmsConfig[key]?.evaluationPeriods ?? 1)
      ) {
        throw new Error(`${alarms[key]} Alarm: ${errorMessage}`);
      }
    });
  }

  private createLambdaAlarms(lambda: ApplicationVersionedLambda) {
    const alarmsConfig = this.config.lambda.alarms;

    if (alarmsConfig.invocations) {
      this.createLambdaInvocationsAlarm(lambda);
    }

    if (alarmsConfig.errors) {
      this.createLambdaErrorsAlarm(lambda);
    }

    if (alarmsConfig.concurrentExecutions) {
      this.createLambdaConcurrentExecutionsAlarm(lambda);
    }

    if (alarmsConfig.throttles) {
      this.createLambdaThrottlesAlarm(lambda);
    }

    if (alarmsConfig.duration) {
      this.createLambdaDurationAlarm(lambda);
    }
  }

  private createLambdaDurationAlarm(lambda: ApplicationVersionedLambda) {
    this.createLambdaAlarm(lambda, {
      metricName: 'Duration',
      props: this.config.lambda.alarms.duration,
    });
  }

  private createLambdaThrottlesAlarm(lambda: ApplicationVersionedLambda) {
    this.createLambdaAlarm(lambda, {
      metricName: 'Throttles',
      props: this.config.lambda.alarms.throttles,
    });
  }

  private createLambdaConcurrentExecutionsAlarm(
    lambda: ApplicationVersionedLambda
  ) {
    this.createLambdaAlarm(lambda, {
      metricName: 'ConcurrentExecutions',
      props: this.config.lambda.alarms.concurrentExecutions,
    });
  }

  private createLambdaErrorsAlarm(lambda: ApplicationVersionedLambda) {
    this.createLambdaAlarm(lambda, {
      metricName: 'Errors',
      props: this.config.lambda.alarms.errors,
    });
  }

  private createLambdaInvocationsAlarm(lambda: ApplicationVersionedLambda) {
    this.createLambdaAlarm(lambda, {
      metricName: 'Invocations',
      props: this.config.lambda.alarms.invocations,
    });
  }

  private createLambdaAlarm(
    lambda: ApplicationVersionedLambda,
    config: {
      metricName: string;
      props: PocketEventBridgeWithLambdaTargetDefaultAlarmProps;
    }
  ) {
    const props = config.props;
    const defaultEvaluationPeriods = 1;

    new CloudwatchMetricAlarm(this, config.metricName.toLowerCase(), {
      alarmName: `${this.config.name}-Lambda-${config.metricName}-Alarm`,
      namespace: 'AWS/Lambda',
      metricName: config.metricName,
      dimensions: {
        FunctionName: lambda.versionedLambda.functionName,
        Resource: `${lambda.versionedLambda.functionName}:${lambda.versionedLambda.name}`,
      },
      period: props.period,
      evaluationPeriods: props.evaluationPeriods ?? defaultEvaluationPeriods,
      datapointsToAlarm: props.datapointsToAlarm ?? defaultEvaluationPeriods,
      statistic: 'Sum',
      comparisonOperator: props.comparisonOperator ?? 'GreaterThanThreshold',
      threshold: props.threshold,
      alarmDescription:
        props.alarmDescription ??
        `Total ${config.metricName.toLowerCase()} breaches threshold`,
      insufficientDataActions: [],
      alarmActions: props.actions ?? [],
      okActions: props.actions ?? [],
      tags: this.config.tags,
    });
  }

  private createLambdaCodeDeploy() {
    const lambdaConfig = this.config.lambda;

    new ApplicationLambdaCodeDeploy(this, 'lambda-code-deploy', {
      name: this.config.name,
      deploySnsTopicArn: lambdaConfig.codeDeploy.deploySnsTopicArn,
      detailType: lambdaConfig.codeDeploy.detailType,
      region: lambdaConfig.codeDeploy.region,
      accountId: lambdaConfig.codeDeploy.accountId,
    });
  }

  private createLambdaEventRuleResourcePermission(
    lambda: ApplicationVersionedLambda,
    eventBridgeRule: ApplicationEventBridgeRule
  ) {
    new LambdaPermission(this, 'lambda-permission', {
      action: 'lambda:InvokeFunction',
      functionName: lambda.versionedLambda.functionName,
      qualifier: lambda.versionedLambda.name,
      principal: 'events.amazonaws.com',
      sourceArn: eventBridgeRule.rule.arn,
      dependsOn: [lambda.versionedLambda, eventBridgeRule.rule],
    });
  }

  private createEventBridgeRule(lambda: ApplicationVersionedLambda) {
    const eventRuleConfig = this.config.eventRule;

    return new ApplicationEventBridgeRule(this, 'event-bridge-rule', {
      name: this.config.name,
      description: eventRuleConfig.description,
      eventBusName: eventRuleConfig.eventBusName,
      eventPattern: eventRuleConfig.pattern,
      target: {
        targetId: 'lambda',
        arn: lambda.versionedLambda.arn,
        dependsOn: lambda.versionedLambda,
      },
      tags: this.config.tags,
    });
  }

  private createVersionedLambda() {
    const lambdaConfig = this.config.lambda;

    return new ApplicationVersionedLambda(this, 'lambda', {
      name: this.config.name,
      description: lambdaConfig.description,
      runtime: lambdaConfig.runtime,
      handler: lambdaConfig.handler,
      timeout: lambdaConfig.timeout,
      environment: lambdaConfig.environment,
      vpcConfig: lambdaConfig.vpcConfig,
      executionPolicyStatements: lambdaConfig.executionPolicyStatements,
      logRetention: lambdaConfig.logRetention,
      s3Bucket:
        lambdaConfig.s3Bucket ?? `pocket-${this.config.name.toLowerCase()}`,
      tags: this.config.tags,
      usesCodeDeploy: !!lambdaConfig.codeDeploy,
    });
  }
}
