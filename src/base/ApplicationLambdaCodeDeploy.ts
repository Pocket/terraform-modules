import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { codedeploy, codestar, iam } from '@cdktf/provider-aws';

export interface ApplicationVersionedLambdaCodeDeployProps {
  name: string;
  deploySnsTopicArn?: string;
  detailType?: 'BASIC' | 'FULL';
  region: string;
  accountId: string;
}

export class ApplicationLambdaCodeDeploy extends Resource {
  public readonly codeDeployApp: codedeploy.CodedeployApp;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationVersionedLambdaCodeDeployProps
  ) {
    super(scope, name);

    this.codeDeployApp = this.setupCodeDeploy();
  }

  private setupCodeDeploy() {
    const codeDeployApp = new codedeploy.CodedeployApp(
      this,
      'code-deploy-app',
      {
        name: `${this.config.name}-Lambda`,
        computePlatform: 'Lambda',
      }
    );

    this.createCodeDeploymentGroup(codeDeployApp);

    if (this.config.deploySnsTopicArn) {
      this.setupCodeDeployNotifications(codeDeployApp);
    }

    return codeDeployApp;
  }

  private createCodeDeploymentGroup(codeDeployApp: codedeploy.CodedeployApp) {
    new codedeploy.CodedeployDeploymentGroup(this, 'code-deployment-group', {
      appName: codeDeployApp.name,
      deploymentConfigName: 'CodeDeployDefault.LambdaAllAtOnce',
      deploymentGroupName: codeDeployApp.name,
      serviceRoleArn: this.getCodeDeployRole().arn,
      deploymentStyle: {
        deploymentType: 'BLUE_GREEN',
        deploymentOption: 'WITH_TRAFFIC_CONTROL',
      },
      autoRollbackConfiguration: {
        enabled: true,
        events: ['DEPLOYMENT_FAILURE'],
      },
      dependsOn: [codeDeployApp],
    });
  }

  private getCodeDeployRole() {
    const codeDeployRole = new iam.IamRole(this, 'code-deploy-role', {
      name: `${this.config.name}-CodeDeployRole`,
      assumeRolePolicy: this.getCodeDeployAssumePolicyDocument(),
    });

    new iam.IamRolePolicyAttachment(this, 'code-deploy-policy-attachment', {
      policyArn:
        'arn:aws:iam::aws:policy/service-role/AWSCodeDeployRoleForLambda',
      role: codeDeployRole.name,
      dependsOn: [codeDeployRole],
    });

    return codeDeployRole;
  }

  private getCodeDeployAssumePolicyDocument() {
    return new iam.DataAwsIamPolicyDocument(
      this,
      'code-deploy-assume-role-policy-document',
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
    ).json;
  }

  private setupCodeDeployNotifications(
    codeDeployApp: codedeploy.CodedeployApp
  ) {
    new codestar.CodestarnotificationsNotificationRule(this, 'notifications', {
      detailType: this.config.detailType ?? 'BASIC',
      eventTypeIds: ['codedeploy-application-deployment-failed'],
      name: codeDeployApp.name,
      resource: `arn:aws:codedeploy:${this.config.region}:${this.config.accountId}:application:${codeDeployApp.name}`,
      target: [
        {
          address: this.config.deploySnsTopicArn,
        },
      ],
    });
  }
}
