import { Construct } from 'constructs';
import { Resource } from 'cdktf';
import { Backup } from '@cdktf/provider-aws';
import BackupVault = Backup.BackupVault;
import BackupPlan = Backup.BackupPlan;
import BackupSelection = Backup.BackupSelection;
import BackupPlanRule = Backup.BackupPlanRule;

export interface ApplicationBackupProps {
  name: string;
  prefix: string;
  accountId: string;
  backupPlans: {
    name: string;
    resources: string[];
    rules: Omit<BackupPlanRule, 'targetVaultName'>[];
  }[];
  tags?: { [key: string]: string };
}

export class ApplicationBackup extends Resource {
  constructor(
    scope: Construct,
    name: string,
    private config: ApplicationBackupProps
  ) {
    super(scope, name);

    const vault = new BackupVault(this, 'backup-vault', {
      name: `${config.prefix}-${config.name}`,
      tags: config.tags,
    });

    config.backupPlans.forEach((plan) => {
      const backupPlan = new BackupPlan(this, 'backup-plan', {
        name: plan.name,
        rule: plan.rules.map((rule) => ({
          ...rule,
          targetVaultName: vault.name,
        })),
        tags: config.tags,
      });

      new BackupSelection(this, 'backup-selection', {
        name: `${config.prefix}-Backup-Selection`,
        planId: backupPlan.id,
        iamRoleArn: `arn:aws:iam::${config.accountId}:role/service-role/AWSBackupDefaultServiceRole`,
        resources: plan.resources,
      });
    });
  }
}
