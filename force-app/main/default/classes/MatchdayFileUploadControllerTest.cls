@IsTest
private class MatchdayFileUploadControllerTest {
    private static final String KEY = '0123456789abcdef0123456789abcdef';
    @TestSetup
    static void access() {
        Id userId = UserInfo.getUserId();
        Id permissionSetId = [SELECT Id FROM PermissionSet WHERE Name = 'Matchday_File_Upload'].Id;
        // A deployment user may already have the permission set from an
        // earlier installation. Do not insert a duplicate during upgrades.
        if ([SELECT COUNT() FROM PermissionSetAssignment
             WHERE AssigneeId = :userId AND PermissionSetId = :permissionSetId] == 0) {
            insert new PermissionSetAssignment(
                AssigneeId = userId, PermissionSetId = permissionSetId
            );
        }
    }
    private static Account parent() {
        Account account = new Account(Name = 'Matchday isolated unit test');
        insert account;
        return account;
    }
    private static ContentVersion upload(Id parentId) {
        ContentVersion version = new ContentVersion(
            Title = 'Matchday test', PathOnClient = 'matchday.txt',
            VersionData = Blob.valueOf('goal'), FirstPublishLocationId = parentId,
            Matchday_Upload_Key__c = KEY
        );
        insert version;
        return version;
    }
    @IsTest static void confirmsFileAndRecordLinkWithoutWriting() {
        Account account = parent();
        ContentVersion version = upload(account.Id);
        Test.startTest();
        Integer dml = Limits.getDmlStatements();
        MatchdayFileUploadController.UploadResult result = MatchdayFileUploadController.findUpload(account.Id, KEY);
        Assert.areEqual(dml, Limits.getDmlStatements());
        Assert.areEqual(version.Id, result.versionId);
        Assert.areEqual(4, result.contentSize);
        Assert.areEqual(1, [SELECT COUNT() FROM ContentDocumentLink WHERE LinkedEntityId = :account.Id AND ContentDocumentId = :result.documentId]);
        Assert.areEqual(result.versionId, MatchdayFileUploadController.findUpload(account.Id, KEY).versionId);
        Test.stopTest();
    }
    @IsTest static void missingUploadReturnsNull() {
        Account account = parent();
        Assert.isNull(MatchdayFileUploadController.findUpload(account.Id, KEY));
    }
    @IsTest static void rejectsBadContextAndWrongRecord() {
        Account account = parent();
        upload(account.Id);
        Account other = parent();
        for (Integer scenario = 0; scenario < 4; scenario++) {
            try {
                MatchdayFileUploadController.findUpload(
                    scenario == 0 ? null : scenario == 1 ? account.Id : scenario == 2 ? other.Id : '001000000000001AAA',
                    scenario == 1 ? 'invalid' : KEY
                );
                Assert.fail('Expected rejected context');
            } catch (AuraHandledException expected) {
                Assert.isNotNull(expected);
            }
        }
    }
    @IsTest static void rejectsMissingRecordLink() {
        Account account = parent();
        ContentVersion version = upload(account.Id);
        Id documentId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :version.Id].ContentDocumentId;
        delete [SELECT Id FROM ContentDocumentLink WHERE ContentDocumentId = :documentId AND LinkedEntityId = :account.Id];
        try {
            MatchdayFileUploadController.findUpload(account.Id, KEY);
            Assert.fail('A detached file is not a confirmed upload');
        } catch (AuraHandledException expected) {
            Assert.isNotNull(expected);
        }
    }
    @IsTest static void preventsDuplicateUploadKeys() {
        Account account = parent();
        upload(account.Id);
        try {
            upload(account.Id);
            Assert.fail('Duplicate upload key must be rejected');
        } catch (DmlException expected) {
            Assert.areEqual(StatusCode.DUPLICATE_VALUE, expected.getDmlType(0));
        }
    }
}
