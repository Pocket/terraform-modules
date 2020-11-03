import { Resource } from 'cdktf';
import { Construct } from 'constructs';
import {
  DataAwsIamPolicyDocument,
  DataAwsIamPolicyDocumentStatement,
  IamPolicy,
  IamRole,
  IamRolePolicyAttachment,
} from '../../.gen/providers/aws';

export interface ApplicationECSIAMProps {
  prefix: string;
  name: string;
  taskExecutionRolePolicyStatements: DataAwsIamPolicyDocumentStatement[];
  taskRolePolicyStatements: DataAwsIamPolicyDocumentStatement[];
  taskExecutionDefaultAttachmentArn: string;
  tags?: { [key: string]: string };
}

export class ApplicationECSIAM extends Resource {
  public readonly taskExecutionRoleArn;
  public readonly taskRoleArn;

  constructor(scope: Construct, name: string, config: ApplicationECSIAMProps) {
    super(scope, name);

    // does anything here need to be in config?
    const dataEcsTaskAssume = new DataAwsIamPolicyDocument(
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

    const dataEcsTaskExecutionRolePolicy = new DataAwsIamPolicyDocument(
      this,
      'data-ecs-task-execution-role-policy',
      {
        version: '2012-10-17',
        statement: config.taskExecutionRolePolicyStatements,
      }
    );

    const ecsTaskExecutionRole = new IamRole(this, 'ecs-execution-role', {
      assumeRolePolicy: dataEcsTaskAssume.json,
      name: `${config.prefix}-TaskExecutionRole`,
      tags: config.tags,
    });

    new IamRolePolicyAttachment(this, 'ecs-task-execution-default-attachment', {
      policyArn: config.taskExecutionDefaultAttachmentArn,
      role: ecsTaskExecutionRole.id,
    });

    const ecsTaskExecutionRolePolicy = new IamPolicy(
      this,
      'ecs-task-execution-role-policy',
      {
        name: `${config.prefix}-TaskExecutionRolePolicy`,
        policy: dataEcsTaskExecutionRolePolicy.json,
      }
    );

    new IamRolePolicyAttachment(this, 'ecs-task-execution-custom-attachment', {
      policyArn: ecsTaskExecutionRolePolicy.arn,
      role: ecsTaskExecutionRole.id,
    });

    const dataEcsTaskRolePolicy = new DataAwsIamPolicyDocument(
      this,
      'data-ecs-task-role-policy',
      {
        version: '2012-10-17',
        statement: config.taskRolePolicyStatements,
      }
    );

    const ecsTaskRole = new IamRole(this, 'ecs-task-role', {
      assumeRolePolicy: dataEcsTaskAssume.json,
      name: `${config.prefix}-TaskRole`,
      tags: config.tags,
    });

    const ecsTaskRolePolicy = new IamPolicy(this, 'ecs-task-role-policy', {
      name: `${config.prefix}-TaskRolePolicy`,
      policy: dataEcsTaskRolePolicy.json,
    });

    new IamRolePolicyAttachment(this, 'ecs-task-custom-attachment', {
      policyArn: ecsTaskRolePolicy.arn,
      role: ecsTaskRole.id,
    });

    // make arns available to other modules
    this.taskExecutionRoleArn = ecsTaskExecutionRole.arn;
    this.taskRoleArn = ecsTaskRole.arn;
  }
}
