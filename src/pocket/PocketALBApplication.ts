import { Resource } from 'cdktf';
import { elb, cloudfront, cloudwatch, route53, efs } from '@cdktf/provider-aws';
import { Construct } from 'constructs';
import {
  ApplicationAutoscaling,
  ApplicationBaseDNS,
  ApplicationCertificate,
  ApplicationECSCluster,
  ApplicationECSContainerDefinitionProps,
  ApplicationECSIAMProps,
  ApplicationECSService,
  ApplicationECSServiceProps,
  ApplicationLoadBalancer,
} from '..';
import { PocketVPC } from './PocketVPC';

export interface PocketALBApplicationAlarmProps {
  threshold?: number;
  period?: number;
  evaluationPeriods?: number;
  datapointsToAlarm?: number;
  actions?: string[];
  alarmDescription?: string;
}

export interface PocketALBApplicationProps {
  /**
   * This is the prefix for the names of all the resources
   * created by this construct.
   */
  prefix: string;
  /**
   * Optional config to define the region for the service.
   * This is used to define the cloudwatch dashboards
   * as well as the region of the cloudwatch logs
   */
  region?: string;
  /**
   * VPC configuration for all resource that require it within
   * this construct. A default Pocket VPC will be used if not
   * provided.
   */
  vpcConfig?: {
    vpcId: string;
    privateSubnetIds: string[];
    publicSubnetIds: string[];
  };
  /**
   * Prefix for the name of the application load balancer created
   * as part of this construct. Due to an arbitrary AWS character
   * limit, this has to be kept at 6 characters or less.
   */
  alb6CharacterPrefix: string;
  /**
   * Optional config to create an internal or public facing
   * ALB. By default this is set to false.
   */
  internal?: boolean;
  /**
   * The domain the ECS service created by this construct will
   * be available at.
   */
  domain: string;
  /**
   * Optional config to create a CDN. By default no CDN is created.
   */
  cdn?: boolean;
  /**
   * Option for how the service created by this construct should be
   * deployed.
   */
  codeDeploy: {
    /**
     * Option to create a CodePipeline resource. Default is false.
     */
    useCodePipeline?: boolean;
    /**
     * Option to create a CodeDeploy application.
     */
    useCodeDeploy: boolean;
    /**
     * Optional SNS topic for CodeDeploy notifications.
     */
    snsNotificationTopicArn?: string;

    notifications?: {
      /**
       * Option to send CodeDeploy notifications on Started event, defaults to true.
       */
      notifyOnStarted?: boolean;
      /**
       * Option to send CodeDeploy notifications on Succeeded event, defaults to true.
       */
      notifyOnSucceeded?: boolean;
      /**
       * Option to send CodeDeploy notifications on Failed event, defaults to true.
       */
      notifyOnFailed?: boolean;
    };
  };
  /**
   * Tags for all resources created by this construct.
   */
  tags?: { [key: string]: string };
  /**
   * Container definitions for the ECS task.
   */
  containerConfigs: ApplicationECSContainerDefinitionProps[];
  /**
   * Description of the container that is exposed to the ALB.
   */
  exposedContainer: {
    port: number;
    name: string;
    healthCheckPath: string;
  };
  /**
   * ECS task size configuration.
   */
  taskSize?: {
    cpu: number;
    memory: number;
  };
  /**
   * IAM config for the ECS Service and Tasks.
   */
  ecsIamConfig: ApplicationECSIAMProps;
  /**
   * Options for configuring the autoscaling policy for
   * the ECS service created by this construct.
   */
  autoscalingConfig?: {
    targetMinCapacity?: number;
    targetMaxCapacity?: number;
    stepScaleInAdjustment?: number;
    stepScaleOutAdjustment?: number;
    scaleInThreshold?: number;
    scaleOutThreshold?: number;
  };
  /**
   * Option for defining Cloudwatch alarms
   */
  alarms?: {
    http5xxErrorPercentage?: PocketALBApplicationAlarmProps;
    httpLatency?: PocketALBApplicationAlarmProps;
    customAlarms?: cloudwatch.CloudwatchMetricAlarmConfig[];
  };
  efsConfig?: {
    creationToken?: string;
    throughputMode?: string;
    volumeName: string;
  };
}

interface CreateALBReturn {
  alb: ApplicationLoadBalancer;
  albRecord: route53.Route53Record;
  albCertificate: ApplicationCertificate;
}

// can export if we need to use outside of this module
const DEFAULT_AUTOSCALING_CONFIG = {
  scaleOutThreshold: 45,
  scaleInThreshold: 30,
  targetMinCapacity: 1,
  targetMaxCapacity: 2,
  stepScaleInAdjustment: -1,
  stepScaleOutAdjustment: 2,
};

export class PocketALBApplication extends Resource {
  public readonly alb: ApplicationLoadBalancer;
  public readonly ecsService: ApplicationECSService;
  public readonly baseDNS: ApplicationBaseDNS;
  public readonly listeners: elb.AlbListener[];
  private readonly config: PocketALBApplicationProps;
  private readonly pocketVPC: PocketALBApplicationProps['vpcConfig'];
  private readonly efs: efs.EfsFileSystem;

  constructor(
    scope: Construct,
    name: string,
    config: PocketALBApplicationProps
  ) {
    super(scope, name);

    this.listeners = [];

    this.config = PocketALBApplication.validateConfig(config);

    // use default auto-scaling config, but update any user-provided values
    this.config.autoscalingConfig = {
      ...DEFAULT_AUTOSCALING_CONFIG,
      ...config.autoscalingConfig,
    };

    this.pocketVPC = this.getVpcConfig(config);

    //Setup the Base DNS stack for our application which includes a hosted SubZone
    this.baseDNS = new ApplicationBaseDNS(this, `base_dns`, {
      domain: config.domain,
      tags: config.tags,
    });

    const { alb, albRecord, albCertificate } = this.createALB();
    this.alb = alb;

    if (config.cdn) {
      this.createCDN(albRecord);
    }

    if (config.efsConfig) {
      this.efs = this.createEfs(config);
    }

    const ecsService = this.createECSService(alb, albCertificate);
    this.ecsService = ecsService.ecs;

    this.createCloudwatchDashboard(
      alb.alb.arnSuffix,
      ecsService.ecs.service.name,
      ecsService.cluster.cluster.name
    );

    this.createCloudwatchAlarms();
  }

  /**
   * Fall back to standard Pocket config if a custom VPC configuration has not been supplied.
   *
   * @param config
   * @private
   */
  private getVpcConfig(
    config: PocketALBApplicationProps
  ): PocketALBApplicationProps['vpcConfig'] {
    if (config.vpcConfig !== undefined) {
      return {
        vpcId: config.vpcConfig.vpcId,
        privateSubnetIds: config.vpcConfig.privateSubnetIds,
        publicSubnetIds: config.vpcConfig.publicSubnetIds,
      };
    } else {
      const pocketVpc = new PocketVPC(this, `pocket_vpc`);
      return {
        vpcId: pocketVpc.vpc.id,
        privateSubnetIds: pocketVpc.privateSubnetIds,
        publicSubnetIds: pocketVpc.publicSubnetIds,
      };
    }
  }

  /**
   * Validate the Configuration
   *
   * @param config
   * @private
   */
  private static validateConfig(
    config: PocketALBApplicationProps
  ): PocketALBApplicationProps {
    config = PocketALBApplication.validateCachedALB(config);

    PocketALBApplication.validateAlarmsConfig(config.alarms);

    return config;
  }

  private static validateAlarmsConfig(
    config: PocketALBApplicationProps['alarms']
  ): void {
    if (!config) return;

    const alarmsToValidate = {
      http5xxErrorPercentage: 'HTTP 5xx Error',
      httpLatency: 'HTTP Latency',
      httpRequestCount: 'HTTP Request Count',
    };

    const errorMessage =
      'DatapointsToAlarm must be less than or equal to EvaluationPeriods';

    Object.keys(alarmsToValidate).forEach((key) => {
      if (
        config[key]?.datapointsToAlarm > (config[key]?.evaluationPeriods ?? 1)
      ) {
        throw new Error(`${alarmsToValidate[key]} Alarm: ${errorMessage}`);
      }
    });

    config.customAlarms?.forEach(
      (alarm: cloudwatch.CloudwatchMetricAlarmConfig) => {
        if (alarm.datapointsToAlarm > alarm.evaluationPeriods) {
          throw new Error(`${alarm.alarmName}: ${errorMessage}`);
        }
      }
    );
  }

  private createEfs(config: PocketALBApplicationProps): efs.EfsFileSystem {
    const efsFs = new efs.EfsFileSystem(this, 'efsFs', {
      creationToken: config.efsConfig.creationToken,
      encrypted: true,
      tags: config.tags,
    });

    return efsFs;
  }

  private static validateCachedALB(
    config: PocketALBApplicationProps
  ): PocketALBApplicationProps {
    if (config.cdn === undefined) {
      //Set a default of cached to false
      config.cdn = false;
    }

    if (config.internal === undefined) {
      //Set a default of internal to false
      config.internal = false;
    }

    if (config.internal && config.cdn) {
      throw Error('You can not have a cached ALB and have it be internal.');
    }

    return config;
  }

  /**
   * Creates the ALB stack and certificates
   * @private
   */
  private createALB(): CreateALBReturn {
    //Create our application Load Balancer
    const alb = new ApplicationLoadBalancer(this, `application_load_balancer`, {
      vpcId: this.pocketVPC.vpcId,
      prefix: this.config.prefix,
      alb6CharacterPrefix: this.config.alb6CharacterPrefix,
      subnetIds: this.config.internal
        ? this.pocketVPC.privateSubnetIds
        : this.pocketVPC.publicSubnetIds,
      internal: this.config.internal,
      tags: this.config.tags,
    });

    //When the app uses a CDN we set the ALB to be direct.app-domain
    //Then the CDN is our main app.
    const albDomainName = this.config.cdn
      ? `direct.${this.config.domain}`
      : this.config.domain;

    //Sets up the record for the ALB.
    const albRecord = new route53.Route53Record(this, `alb_record`, {
      name: albDomainName,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: alb.alb.dnsName,
          zoneId: alb.alb.zoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
      setIdentifier: '1',
    });

    //Creates the Certificate for the ALB
    const albCertificate = new ApplicationCertificate(this, `alb_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: albDomainName,
      tags: this.config.tags,
    });

    return {
      alb,
      albRecord,
      albCertificate,
    };
  }

  /**
   * Create the CDN if the ALB is backed by one.
   *
   * @param albRecord
   * @private
   */
  private createCDN(albRecord: route53.Route53Record): void {
    //Create the certificate for the CDN
    const cdnCertificate = new ApplicationCertificate(this, `cdn_certificate`, {
      zoneId: this.baseDNS.zoneId,
      domain: this.config.domain,
      tags: this.config.tags,
    });

    //Create the CDN
    const cdn = new cloudfront.CloudfrontDistribution(
      this,
      `cloudfront_distribution`,
      {
        comment: `CDN for direct.${this.config.domain}`,
        enabled: true,
        aliases: [this.config.domain],
        priceClass: 'PriceClass_200',
        tags: this.config.tags,
        origin: [
          {
            domainName: albRecord.fqdn,
            originId: 'Alb',
            customOriginConfig: {
              httpPort: 80,
              httpsPort: 443,
              originProtocolPolicy: 'https-only',
              originSslProtocols: ['TLSv1.1', 'TLSv1.2'],
            },
          },
        ],
        defaultCacheBehavior: {
          targetOriginId: 'Alb',
          viewerProtocolPolicy: 'redirect-to-https',
          compress: true,
          allowedMethods: [
            'GET',
            'HEAD',
            'OPTIONS',
            'PUT',
            'POST',
            'PATCH',
            'DELETE',
          ],
          cachedMethods: ['GET', 'HEAD', 'OPTIONS'],
          forwardedValues: {
            queryString: true,
            headers: ['Accept', 'Origin', 'Authorization'], //This is important for apollo because it serves different responses based on this
            cookies: {
              forward: 'none',
            },
          },
          //These are hacks to enable Use Origin Cache Header
          //https://github.com/hashicorp/terraform-provider-aws/issues/19382
          defaultTtl: 0, //This breaks from the hack, because the default was 0 before. As long as clients specify a cache header this is overridden.
          minTtl: 0,
          maxTtl: 31536000, // 1 year
        },
        viewerCertificate: {
          acmCertificateArn: cdnCertificate.arn,
          sslSupportMethod: 'sni-only',
          minimumProtocolVersion: 'TLSv1.1_2016',
        },
        restrictions: {
          geoRestriction: {
            restrictionType: 'none',
          },
        },
      }
    );

    // These are hacks to enable Use Origin Cache Header
    // https://github.com/hashicorp/terraform-provider-aws/issues/19382
    cdn.addOverride('default_cache_behavior.default_ttl', 0);
    cdn.addOverride('default_cache_behavior.min_ttl', 0);

    //When cached the CDN must point to the Load Balancer
    new route53.Route53Record(this, `cdn_record`, {
      name: this.config.domain,
      type: 'A',
      zoneId: this.baseDNS.zoneId,
      weightedRoutingPolicy: [
        {
          weight: 1,
        },
      ],
      alias: [
        {
          name: cdn.domainName,
          zoneId: cdn.hostedZoneId,
          evaluateTargetHealth: true,
        },
      ],
      lifecycle: {
        ignoreChanges: ['weighted_routing_policy[0].weight'],
      },
      setIdentifier: '2',
    });
  }

  /**
   * Create the ECS service and attach it to the ALB
   * @param alb
   * @param albCertificate
   * @private
   */
  private createECSService(
    alb: ApplicationLoadBalancer,
    albCertificate: ApplicationCertificate
  ): { ecs: ApplicationECSService; cluster: ApplicationECSCluster } {
    const ecsCluster = new ApplicationECSCluster(this, 'ecs_cluster', {
      prefix: this.config.prefix,
      tags: this.config.tags,
    });

    const httpListener = new elb.AlbListener(this, 'listener_http', {
      loadBalancerArn: alb.alb.arn,
      port: 80,
      protocol: 'HTTP',
      defaultAction: [
        {
          type: 'redirect',
          redirect: { port: '443', protocol: 'HTTPS', statusCode: 'HTTP_301' },
        },
      ],
    });

    const httpsListener = new elb.AlbListener(this, 'listener_https', {
      loadBalancerArn: alb.alb.arn,
      port: 443,
      protocol: 'HTTPS',
      sslPolicy: 'ELBSecurityPolicy-TLS-1-1-2017-01',
      defaultAction: [
        {
          type: 'fixed-response',
          fixedResponse: {
            // To keep things dry we use a default status code here and append a rule for our target group.
            // This is because our ECSService is responsible for creating our target group because CodeDeploy requires
            // 2 target groups and knowing the names of them both
            contentType: 'text/plain',
            statusCode: '503',
            messageBody: '',
          },
        },
      ],
      certificateArn: albCertificate.arn,
    });

    // We want to be able to make resource changes on the alb's listeners so we expose them
    this.listeners.push(httpListener, httpsListener);

    let ecsConfig: ApplicationECSServiceProps = {
      prefix: this.config.prefix,
      region: this.config.region,
      shortName: this.config.alb6CharacterPrefix,
      ecsClusterArn: ecsCluster.cluster.arn,
      ecsClusterName: ecsCluster.cluster.name,
      useCodeDeploy: this.config.codeDeploy.useCodeDeploy,
      codeDeployNotifications: this.config.codeDeploy.notifications,
      useCodePipeline: this.config.codeDeploy.useCodePipeline,
      codeDeploySnsNotificationTopicArn:
        this.config.codeDeploy.snsNotificationTopicArn,
      albConfig: {
        containerPort: this.config.exposedContainer.port,
        containerName: this.config.exposedContainer.name,
        healthCheckPath: this.config.exposedContainer.healthCheckPath,
        listenerArn: httpsListener.arn,
        albSecurityGroupId: alb.securityGroup.id,
      },
      vpcId: this.pocketVPC.vpcId,
      containerConfigs: this.config.containerConfigs,
      privateSubnetIds: this.pocketVPC.privateSubnetIds,
      ecsIamConfig: this.config.ecsIamConfig,
      tags: this.config.tags,
    };

    if (this.config.taskSize) {
      ecsConfig = {
        ...this.config.taskSize,
        ...ecsConfig,
      };
    }

    if (this.config.efsConfig) {
      ecsConfig.efsConfig = {
        efs: { id: this.efs.id, arn: this.efs.arn },
        volumeName: this.config.efsConfig.volumeName,
      };
    }

    const ecsService = new ApplicationECSService(
      this,
      'ecs_service',
      ecsConfig
    );

    new ApplicationAutoscaling(this, 'autoscaling', {
      prefix: this.config.prefix,
      targetMinCapacity: this.config.autoscalingConfig.targetMinCapacity,
      targetMaxCapacity: this.config.autoscalingConfig.targetMaxCapacity,
      ecsClusterName: ecsCluster.cluster.name,
      ecsServiceName: ecsService.service.name,
      scalableDimension: 'ecs:service:DesiredCount',
      stepScaleInAdjustment:
        this.config.autoscalingConfig.stepScaleInAdjustment,
      stepScaleOutAdjustment:
        this.config.autoscalingConfig.stepScaleOutAdjustment,
      scaleInThreshold: this.config.autoscalingConfig.scaleInThreshold,
      scaleOutThreshold: this.config.autoscalingConfig.scaleOutThreshold,
      tags: this.config.tags,
    });

    return {
      ecs: ecsService,
      cluster: ecsCluster,
    };
  }

  /**
   * Create a Cloudwatch dashboard JSON object
   *
   * @param albArnSuffix
   * @param ecsServiceName
   * @param ecsServiceClusterName
   */
  private createCloudwatchDashboard(
    albArnSuffix: string,
    ecsServiceName: string,
    ecsServiceClusterName: string
  ): cloudwatch.CloudwatchDashboard {
    // don't love having this big ol' JSON object here, but it is the simplest way to achieve the result
    const dashboardJSON = {
      widgets: [
        {
          type: 'metric',
          x: 0,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/ApplicationELB',
                'HTTPCode_Target_4XX_Count',
                'LoadBalancer',
                albArnSuffix,
                {
                  yAxis: 'left',
                  color: '#ff7f0e',
                },
              ],
              [
                '.',
                'RequestCount',
                '.',
                '.',
                {
                  yAxis: 'right',
                  color: '#1f77b4',
                },
              ],
              [
                '.',
                'HTTPCode_Target_5XX_Count',
                '.',
                '.',
                {
                  color: '#d62728',
                },
              ],
              [
                '.',
                'HTTPCode_Target_2XX_Count',
                '.',
                '.',
                {
                  yAxis: 'right',
                  color: '#2ca02c',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: this.config.region ?? 'us-east-1',
            period: 60,
            stat: 'Sum',
            title: 'Target Requests',
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 0,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/ApplicationELB',
                'HTTPCode_ELB_4XX_Count',
                'LoadBalancer',
                albArnSuffix,
                {
                  yAxis: 'left',
                  color: '#ff7f0e',
                },
              ],
              [
                '.',
                'RequestCount',
                '.',
                '.',
                {
                  yAxis: 'right',
                  color: '#1f77b4',
                },
              ],
              [
                '.',
                'HTTPCode_ELB_5XX_Count',
                '.',
                '.',
                {
                  color: '#d62728',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: this.config.region ?? 'us-east-1',
            period: 60,
            stat: 'Sum',
            title: 'ALB Requests',
          },
        },
        {
          type: 'metric',
          x: 12,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'AWS/ApplicationELB',
                'TargetResponseTime',
                'LoadBalancer',
                albArnSuffix,
                {
                  label: 'Average',
                  color: '#aec7e8',
                },
              ],
              [
                '...',
                {
                  stat: 'p95',
                  label: 'p95',
                  color: '#ffbb78',
                },
              ],
              [
                '...',
                {
                  stat: 'p99',
                  label: 'p99',
                  color: '#98df8a',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: this.config.region ?? 'us-east-1',
            stat: 'Average',
            period: 60,
          },
        },
        {
          type: 'metric',
          x: 0,
          y: 6,
          width: 12,
          height: 6,
          properties: {
            metrics: [
              [
                'ECS/ContainerInsights',
                'RunningTaskCount',
                'ServiceName',
                ecsServiceName,
                'ClusterName',
                ecsServiceClusterName,
                {
                  yAxis: 'right',
                  color: '#c49c94',
                },
              ],
              [
                'AWS/ECS',
                'CPUUtilization',
                '.',
                '.',
                '.',
                '.',
                {
                  color: '#f7b6d2',
                },
              ],
              [
                '.',
                'MemoryUtilization',
                '.',
                '.',
                '.',
                '.',
                {
                  color: '#c7c7c7',
                },
              ],
            ],
            view: 'timeSeries',
            stacked: false,
            region: this.config.region ?? 'us-east-1',
            stat: 'Average',
            period: 60,
            annotations: {
              horizontal: [
                {
                  color: '#e377c2',
                  label: 'CPU scale out',
                  value: this.config.autoscalingConfig.scaleOutThreshold,
                },
                {
                  color: '#c5b0d5',
                  label: 'CPU scale in',
                  value: this.config.autoscalingConfig.scaleInThreshold,
                },
              ],
            },
            title: 'Service Load',
          },
        },
      ],
    };

    return new cloudwatch.CloudwatchDashboard(this, 'cloudwatch-dashboard', {
      dashboardName: `${this.config.prefix}-ALBDashboard`,
      dashboardBody: JSON.stringify(dashboardJSON),
    });
  }

  private createCloudwatchAlarms(): void {
    const alarmsConfig = this.config.alarms;
    const evaluationPeriods = {
      http5xxErrorPercentage:
        alarmsConfig?.http5xxErrorPercentage?.evaluationPeriods ?? 5,
      httpLatency: alarmsConfig?.httpLatency?.evaluationPeriods ?? 1,
    };
    const http5xxAlarm: cloudwatch.CloudwatchMetricAlarmConfig = {
      alarmName: 'Alarm-HTTPTarget5xxErrorRate',
      metricQuery: [
        {
          id: 'requests',
          metric: {
            metricName: 'RequestCount',
            namespace: 'AWS/ApplicationELB',
            period: alarmsConfig?.http5xxErrorPercentage?.period ?? 60,
            stat: 'Sum',
            unit: 'Count',
            dimensions: { LoadBalancer: this.alb.alb.arnSuffix },
          },
        },
        {
          id: 'errors',
          metric: {
            metricName: 'HTTPCode_Target_5XX_Count',
            namespace: 'AWS/ApplicationELB',
            period: alarmsConfig?.http5xxErrorPercentage?.period ?? 60,
            stat: 'Sum',
            unit: 'Count',
            dimensions: { LoadBalancer: this.alb.alb.arnSuffix },
          },
        },
        {
          id: 'expression',
          expression: 'errors/requests*100',
          label: 'HTTP 5xx Error Rate',
          returnData: true,
        },
      ],
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      evaluationPeriods: evaluationPeriods.http5xxErrorPercentage,
      datapointsToAlarm:
        alarmsConfig?.http5xxErrorPercentage?.datapointsToAlarm ??
        evaluationPeriods.http5xxErrorPercentage,
      threshold: alarmsConfig?.http5xxErrorPercentage?.threshold ?? 5,
      insufficientDataActions: [],
      alarmActions: alarmsConfig?.http5xxErrorPercentage?.actions ?? [],
      okActions: alarmsConfig?.http5xxErrorPercentage?.actions ?? [],
      tags: this.config.tags,
      alarmDescription:
        alarmsConfig?.http5xxErrorPercentage?.alarmDescription ??
        'Percentage of 5xx responses exceeds threshold',
    };
    const latencyAlarm: cloudwatch.CloudwatchMetricAlarmConfig = {
      alarmName: 'Alarm-HTTPResponseTime',
      namespace: 'AWS/ApplicationELB',
      metricName: 'TargetResponseTime',
      dimensions: { LoadBalancer: this.alb.alb.arnSuffix },
      period: alarmsConfig?.httpLatency?.period ?? 300,
      evaluationPeriods: evaluationPeriods.httpLatency,
      datapointsToAlarm:
        alarmsConfig?.httpLatency?.datapointsToAlarm ??
        evaluationPeriods.httpLatency,
      statistic: 'Average',
      comparisonOperator: 'GreaterThanThreshold',
      threshold: alarmsConfig?.httpLatency?.threshold ?? 300,
      alarmDescription:
        alarmsConfig?.httpLatency?.alarmDescription ??
        'Average HTTP response time exceeds threshold',
      insufficientDataActions: [],
      alarmActions: alarmsConfig?.httpLatency?.actions ?? [],
      okActions: alarmsConfig?.httpLatency?.actions ?? [],
      tags: this.config.tags,
    };

    const defaultAlarms: cloudwatch.CloudwatchMetricAlarmConfig[] = [];

    if (alarmsConfig?.http5xxErrorPercentage) defaultAlarms.push(http5xxAlarm);

    if (alarmsConfig?.httpLatency) defaultAlarms.push(latencyAlarm);

    if (alarmsConfig?.customAlarms) {
      defaultAlarms.push(...alarmsConfig.customAlarms);
    }

    if (defaultAlarms.length) this.createAlarms(defaultAlarms);
  }

  private createAlarms(alarms: cloudwatch.CloudwatchMetricAlarmConfig[]): void {
    alarms.forEach((alarmConfig) => {
      new cloudwatch.CloudwatchMetricAlarm(
        this,
        alarmConfig.alarmName.toLowerCase(),
        {
          ...alarmConfig,
          alarmName: `${this.config.prefix}-${alarmConfig.alarmName}`,
        }
      );
    });
  }
}
