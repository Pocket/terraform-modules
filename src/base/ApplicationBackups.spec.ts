import { Testing } from 'cdktf';
import { TestResource } from '../testHelpers';
import { ApplicationBackup } from './ApplicationBackups';

describe('ApplicationBackup', () => {
    it('renders vault with plans without tags', () => {
        const synthed = Testing.synthScope((stack ) => {
            new ApplicationBackup(stack, 'testBackup', {
                name: 'test-',
                prefix: 'TEST',
                accountId: '1234567890',
                backupPlans: [
                    {
                        name: 'TestPlan',
                        resources: ['arn:aws:rds:us-east-1:123456790:db:test'],
                        rules: [{
                            ruleName: 'TestBackupRule'
                        }]
                    }
                ]
            })
        })
    })

    it('renders vault with plans with tags', () => {
        const synthed = Testing.synthScope((stack ) => {
            new ApplicationBackup(stack, 'testBackup', {
                name: 'test-',
                prefix: 'TEST',
                accountId: '1234567890',
                backupPlans: [
                    {
                        name: 'TestPlan',
                        resources: ['arn:aws:rds:us-east-1:123456790:db:test'],
                        rules: [{
                            ruleName: 'TestBackupRule'
                        }]
                    }
                ],
                tags: { name: 'thedude',
                        hobby: 'bowling'
                }
            })
        })
    })

});