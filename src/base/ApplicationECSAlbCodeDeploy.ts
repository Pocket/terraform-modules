import { Resource, TerraformResource } from 'cdktf';
import { codedeploy, codestar, iam, datasources } from '@cdktf/provider-aws';
import { Construct } from 'constructs';

export interface ApplicationECSAlbCodeDeployProps {
  prefix: string;
  clusterName: string;
  serviceName: string;
  listenerArn: string;
  snsNotificationTopicArn?: string;
  targetGroupNames: string[];
  tags?: { [key: string]: string };
  dependsOn?: TerraformResource[];
}

interface CodeDeployResponse {
  codeDeployApp: codedeploy.CodedeployApp;
  ecsCodeDeployRole: iam.IamRole;
}

/**
 * Represents a ecs Codeploy App that uses an ALB
 */
export class ApplicationECSAlbCodeDeploy extends Resource {
  private readonly config: ApplicationECSAlbCodeDeployProps;

  public readonly codeDeployApp: codedeploy.CodedeployApp;
  public readonly codeDeployDeploymentGroup: codedeploy.CodedeployDeploymentGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSAlbCodeDeployProps
  ) {
    super(scope, name);

    this.config = config;

    const { codeDeployApp, ecsCodeDeployRole } = this.setupCodeDeployApp();
    this.codeDeployApp = codeDeployApp;

    this.codeDeployDeploymentGroup = new codedeploy.CodedeployDeploymentGroup(
      this,
      `ecs_codedeploy_deployment_group`,
      {
        dependsOn: config.dependsOn,
        appName: codeDeployApp.name,
        deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
        deploymentGroupName: `${this.config.prefix}-ECS`,
        serviceRoleArn: ecsCodeDeployRole.arn,
        autoRollbackConfiguration: {
          enabled: true,
          events: ['DEPLOYMENT_FAILURE'],
        },
        blueGreenDeploymentConfig: {
          deploymentReadyOption: {
            actionOnTimeout: 'CONTINUE_DEPLOYMENT',
          },
          terminateBlueInstancesOnDeploymentSuccess: {
            action: 'TERMINATE',
            terminationWaitTimeInMinutes: 5,
          },
        },
        deploymentStyle: {
          deploymentOption: 'WITH_TRAFFIC_CONTROL',
          deploymentType: 'BLUE_GREEN',
        },
        ecsService: {
          clusterName: this.config.clusterName,
          serviceName: this.config.serviceName,
        },
        loadBalancerInfo: {
          targetGroupPairInfo: {
            prodTrafficRoute: { listenerArns: [this.config.listenerArn] },
            targetGroup: this.config.targetGroupNames.map((name) => {
              return { name };
            }),
          },
        },
      }
    );
  }

  /**
   * Setup the codedeploy app, permissions, and notifications
   * @private
   */
  private setupCodeDeployApp(): CodeDeployResponse {
    const ecsCodeDeployRole = new iam.IamRole(this, 'ecs_code_deploy_role', {
      name: `${this.config.prefix}-ECSCodeDeployRole`,
      assumeRolePolicy: new iam.DataAwsIamPolicyDocument(
        this,
        `codedeploy_assume_role`,
        {
          statement: [
            {
              effect: 'Allow',
              actions: ['sts:AssumeRole'],
              principals: [
                {
                  identifiers: ['codedeploy.amazonaws.com'],
                  type: 'Service',
                },
              ],
            },
          ],
        }
      ).json,
    });

    new iam.IamRolePolicyAttachment(this, 'ecs_codedeploy_role_attachment', {
      policyArn: 'arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS',
      role: ecsCodeDeployRole.name,
      dependsOn: [ecsCodeDeployRole],
    });

    const codeDeployApp = new codedeploy.CodedeployApp(
      this,
      'ecs_code_deploy',
      {
        computePlatform: 'ECS',
        name: `${this.config.prefix}-ECS`,
      }
    );

    if (this.config.snsNotificationTopicArn) {
      const region = new datasources.DataAwsRegion(this, 'current_region', {});
      const account = new datasources.DataAwsCallerIdentity(
        this,
        'current_account',
        {}
      );
      new codestar.CodestarnotificationsNotificationRule(
        this,
        `ecs_codedeploy_notifications`,
        {
          detailType: 'BASIC',
          eventTypeIds: [
            'codedeploy-application-deployment-failed',
            'codedeploy-application-deployment-succeeded',
            'codedeploy-application-deployment-started',
          ],
          name: codeDeployApp.name,
          resource: `arn:aws:codedeploy:${region.name}:${account.accountId}:application:${codeDeployApp.name}`,
          target: [
            {
              address: this.config.snsNotificationTopicArn,
            },
          ],
        }
      );
    }

    return { codeDeployApp, ecsCodeDeployRole };
  }
}
