import { Resource, TerraformResource } from 'cdktf';
import {
  CodedeployApp,
  CodedeployDeploymentGroup,
  CodestarnotificationsNotificationRule,
  DataAwsCallerIdentity,
  DataAwsIamPolicyDocument,
  DataAwsRegion,
  IamRole,
  IamRolePolicyAttachment,
} from '../../.gen/providers/aws';
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

/**
 * Represents a ECS Codeploy App that uses an ALB
 */
export class ApplicationECSAlbCodeDeploy extends Resource {
  private readonly config: ApplicationECSAlbCodeDeployProps;

  public readonly codeDeployApp: CodedeployApp;
  public readonly codeDeployDeploymentGroup: CodedeployDeploymentGroup;

  constructor(
    scope: Construct,
    name: string,
    config: ApplicationECSAlbCodeDeployProps
  ) {
    super(scope, name);

    this.config = config;

    const { codeDeployApp, ecsCodeDeployRole } = this.setupCodeDeployApp();
    this.codeDeployApp = codeDeployApp;

    this.codeDeployDeploymentGroup = new CodedeployDeploymentGroup(
      this,
      `ecs_codedeploy_deployment_group`,
      {
        dependsOn: config.dependsOn,
        appName: codeDeployApp.name,
        deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
        deploymentGroupName: `${this.config.prefix}-ECS`,
        serviceRoleArn: ecsCodeDeployRole.arn,
        autoRollbackConfiguration: [
          {
            enabled: true,
            events: ['DEPLOYMENT_FAILURE'],
          },
        ],
        blueGreenDeploymentConfig: [
          {
            deploymentReadyOption: [
              {
                actionOnTimeout: 'CONTINUE_DEPLOYMENT',
              },
            ],
            terminateBlueInstancesOnDeploymentSuccess: [
              {
                action: 'TERMINATE',
                terminationWaitTimeInMinutes: 5,
              },
            ],
          },
        ],
        deploymentStyle: [
          {
            deploymentOption: 'WITH_TRAFFIC_CONTROL',
            deploymentType: 'BLUE_GREEN',
          },
        ],
        ecsService: [
          {
            clusterName: this.config.clusterName,
            serviceName: this.config.serviceName,
          },
        ],
        loadBalancerInfo: [
          {
            targetGroupPairInfo: [
              {
                prodTrafficRoute: [{ listenerArns: [this.config.listenerArn] }],
                targetGroup: this.config.targetGroupNames.map((name) => {
                  return { name };
                }),
              },
            ],
          },
        ],
      }
    );
  }

  /**
   * Setup the codedeploy app, permissions, and notifications
   * @private
   */
  private setupCodeDeployApp(): {
    codeDeployApp: CodedeployApp;
    ecsCodeDeployRole: IamRole;
  } {
    const ecsCodeDeployRole = new IamRole(this, 'ecs_code_deploy_role', {
      name: `${this.config.prefix}-ECSCodeDeployRole`,
      assumeRolePolicy: new DataAwsIamPolicyDocument(
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

    new IamRolePolicyAttachment(this, 'ecs_codedeploy_role_attachment', {
      policyArn: 'arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS',
      role: ecsCodeDeployRole.name,
      dependsOn: [ecsCodeDeployRole],
    });

    const codeDeployApp = new CodedeployApp(this, 'ecs_code_deploy', {
      computePlatform: 'ECS',
      name: this.config.prefix,
    });

    if (this.config.snsNotificationTopicArn) {
      const region = new DataAwsRegion(this, 'current_region', {});
      const account = new DataAwsCallerIdentity(this, 'current_account', {});
      new CodestarnotificationsNotificationRule(
        this,
        `ecs_codedeploy_notifications`,
        {
          detailType: 'basic',
          eventTypeIds: [
            'codedeploy-application-deployment-failed',
            'codedeploy-application-deployment-succeeded',
            'codedeploy-application-deployment-started',
          ],
          name: codeDeployApp.name,
          resource: `arn:aws:codedeploy:${region.name}:${account.accountId}:application:${codeDeployApp.name}`,
        }
      );
    }

    return { codeDeployApp, ecsCodeDeployRole };
  }
}
