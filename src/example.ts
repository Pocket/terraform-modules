import { Construct } from 'constructs';
import { App, TerraformStack } from 'cdktf';
import { AwsProvider } from '@cdktf/provider-aws';
import { ApplicationBackup } from './base/ApplicationBackups';

class Example extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new AwsProvider(this, 'aws', {
      region: 'us-east-1',
    });

    new ApplicationBackup(this, 'test-backup', {
      name: 'TestDevVault',
      prefix: 'Test-Dev',
      accountId: '410318598490',
      // backupPlans: plans as unknown as ApplicationBackupProps['backupPlans'],
      backupPlans: [
        {
          name: 'TestDevPlan',
          resources: ['arn:aws:rds:us-east-1:410318598490:db:parser-dev3'],
          rules: [
            {
              ruleName: 'TestDailyBackupRule',
            },
          ],
        },
      ],
      tags: { service: 'PocketDevBackup' },
    });
  }
}

const app = new App();
new Example(app, 'acme-example');
app.synth();
