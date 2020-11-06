import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  CodedeployApp,
  CodedeployDeploymentGroup,
  CodestarnotificationsNotificationRule,
  DataAwsCallerIdentity,
  DataAwsIamPolicyDocument,
  DataAwsRegion,
  DataAwsSnsTopic,
  IamRole,
  IamRolePolicyAttachment,
} from '../../.gen/providers/aws';

interface ApplicationVersionedLambdaCodeDeployProps {
  name: string;
  deploySnsTopicName: string;
  detailType?: 'BASIC' | 'FULL';
}

export class ApplicationLambdaCodeDeploy extends Resource {
  private callerIdentity: DataAwsCallerIdentity;
  private region: DataAwsRegion;
  public readonly codeDeployApp: CodedeployApp;

  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationVersionedLambdaCodeDeployProps
  ) {
    super(scope, name);

    this.region = new DataAwsRegion(this, 'region');
    this.callerIdentity = new DataAwsCallerIdentity(this, 'caller-identity');
    this.codeDeployApp = this.setupCodeDeploy();
  }

  private setupCodeDeploy() {
    const codeDeployApp = new CodedeployApp(this, 'code-deploy-app', {
      name: this.config.name,
      computePlatform: 'Lambda',
    });

    this.createCodeDeploymentGroup(codeDeployApp);
    this.setupCodeDeployNotifications(codeDeployApp);

    return codeDeployApp;
  }

  private createCodeDeploymentGroup(codeDeployApp: CodedeployApp) {
    new CodedeployDeploymentGroup(this, 'code-deployment-group', {
      appName: codeDeployApp.name,
      deploymentConfigName: 'CodeDeployDefault.LambdaAllAtOnce',
      deploymentGroupName: this.config.name,
      serviceRoleArn: this.getCodeDeployRole().arn,
      deploymentStyle: [
        {
          deploymentType: 'BLUE_GREEN',
          deploymentOption: 'WITH_TRAFFIC_CONTROL',
        },
      ],
      autoRollbackConfiguration: [
        {
          enabled: true,
          events: ['DEPLOYMENT_FAILURE'],
        },
      ],
    });
  }

  private getCodeDeployRole() {
    const codeDeployRole = new IamRole(this, 'code-deploy-role', {
      name: `${this.config.name}-CodeDeployRole`,
      assumeRolePolicy: this.getCodeDeployAssumePolicyDocument(),
    });

    new IamRolePolicyAttachment(this, 'code-deploy-policy-attachment', {
      policyArn:
        'arn:aws:iam::aws:policy/service-role/AWSCodeDeployRoleForLambda',
      role: codeDeployRole.name,
      dependsOn: [codeDeployRole],
    });

    return codeDeployRole;
  }

  private getCodeDeployAssumePolicyDocument() {
    return new DataAwsIamPolicyDocument(
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

  private setupCodeDeployNotifications(codeDeployApp: CodedeployApp) {
    // TODO: Optionally create SNS topic when deploy topic is not found.
    //  This is not required for our use case now but may be useful
    const deployTopic = new DataAwsSnsTopic(this, 'deploy-topic', {
      name: this.config.deploySnsTopicName,
    });

    new CodestarnotificationsNotificationRule(this, 'notifications', {
      detailType: this.config.detailType ?? 'BASIC',
      eventTypeIds: ['codedeploy-application-deployment-failed'],
      name: codeDeployApp.name,
      resource: `arn:aws:codedeploy:${this.region.name}:${this.callerIdentity.accountId}:application:${codeDeployApp.name}`,
      target: [
        {
          address: deployTopic.arn,
        },
      ],
    });
  }
}
