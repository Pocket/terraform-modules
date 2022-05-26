import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import { iam } from '@cdktf/provider-aws';

export interface ApplicationECSIAMProps {
  prefix: string;
  taskExecutionRolePolicyStatements: iam.DataAwsIamPolicyDocumentStatement[];
  taskRolePolicyStatements: iam.DataAwsIamPolicyDocumentStatement[];
  taskExecutionDefaultAttachmentArn?: string;
  tags?: { [key: string]: string };
}

export class ApplicationECSIAM extends Resource {
  public readonly taskExecutionRoleArn;
  public readonly taskRoleArn;
  public readonly taskRole: iam.IamRole;

  constructor(scope: Construct, name: string, config: ApplicationECSIAMProps) {
    super(scope, name);

    // does anything here need to be in config?
    const dataEcsTaskAssume = new iam.DataAwsIamPolicyDocument(
      this,
      'ecs-task-assume',
      {
        version: '2012-10-17',
        statement: [
          {
            effect: 'Allow',
            actions: ['sts:AssumeRole'],
            principals: [
              {
                identifiers: ['ecs-tasks.amazonaws.com'],
                type: 'Service',
              },
            ],
          },
        ],
      }
    );

    const ecsTaskExecutionRole = new iam.IamRole(this, 'ecs-execution-role', {
      assumeRolePolicy: dataEcsTaskAssume.json,
      name: `${config.prefix}-TaskExecutionRole`,
      tags: config.tags,
    });

    if (config.taskExecutionDefaultAttachmentArn) {
      new iam.IamRolePolicyAttachment(
        this,
        'ecs-task-execution-default-attachment',
        {
          policyArn: config.taskExecutionDefaultAttachmentArn,
          role: ecsTaskExecutionRole.id,
        }
      );
    }

    if (config.taskExecutionRolePolicyStatements.length > 0) {
      const dataEcsTaskExecutionRolePolicy = new iam.DataAwsIamPolicyDocument(
        this,
        'data-ecs-task-execution-role-policy',
        {
          version: '2012-10-17',
          statement: config.taskExecutionRolePolicyStatements,
        }
      );

      const ecsTaskExecutionRolePolicy = new iam.IamPolicy(
        this,
        'ecs-task-execution-role-policy',
        {
          name: `${config.prefix}-TaskExecutionRolePolicy`,
          policy: dataEcsTaskExecutionRolePolicy.json,
        }
      );

      new iam.IamRolePolicyAttachment(
        this,
        'ecs-task-execution-custom-attachment',
        {
          policyArn: ecsTaskExecutionRolePolicy.arn,
          role: ecsTaskExecutionRole.id,
        }
      );
    }

    const ecsTaskRole = new iam.IamRole(this, 'ecs-task-role', {
      assumeRolePolicy: dataEcsTaskAssume.json,
      name: `${config.prefix}-TaskRole`,
      tags: config.tags,
    });

    if (config.taskRolePolicyStatements.length > 0) {
      const dataEcsTaskRolePolicy = new iam.DataAwsIamPolicyDocument(
        this,
        'data-ecs-task-role-policy',
        {
          version: '2012-10-17',
          statement: config.taskRolePolicyStatements,
        }
      );

      const ecsTaskRolePolicy = new iam.IamPolicy(
        this,
        'ecs-task-role-policy',
        {
          name: `${config.prefix}-TaskRolePolicy`,
          policy: dataEcsTaskRolePolicy.json,
        }
      );

      new iam.IamRolePolicyAttachment(this, 'ecs-task-custom-attachment', {
        policyArn: ecsTaskRolePolicy.arn,
        role: ecsTaskRole.id,
      });
    }

    // make arns available to other modules
    this.taskExecutionRoleArn = ecsTaskExecutionRole.arn;
    this.taskRoleArn = ecsTaskRole.arn;
    this.taskRole = ecsTaskRole;
  }
}
