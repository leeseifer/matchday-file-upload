public with sharing class MatchdayFileUploadController {
    public class UploadResult {
        @AuraEnabled public Id documentId;
        @AuraEnabled public Id versionId;
        @AuraEnabled public Integer contentSize;
    }

    // The binary goes through Lightning Data Service, never through Apex heap.
    // This read-only check confirms both the version and its record link, and
    // lets a retry recover a committed upload without creating another file.
    @AuraEnabled
    public static UploadResult findUpload(Id recordId, String uploadKey) {
        if (recordId == null || String.isBlank(uploadKey) ||
            !Pattern.matches('^[a-f0-9]{32}$', uploadKey)) {
            throw new AuraHandledException('Open a record and select the file again.');
        }
        Schema.DescribeSObjectResult parentType = recordId.getSObjectType().getDescribe();
        if (!parentType.isAccessible() || !parentType.isQueryable()) {
            throw new AuraHandledException('You do not have access to this record.');
        }
        List<SObject> parents = Database.queryWithBinds(
            'SELECT Id FROM ' + parentType.getName() + ' WHERE Id = :parentId LIMIT 1',
            new Map<String, Object>{'parentId' => recordId}, AccessLevel.USER_MODE
        );
        if (parents.isEmpty()) {
            throw new AuraHandledException('You do not have access to this record.');
        }
        Id userId = UserInfo.getUserId();
        List<ContentVersion> versions = [
            SELECT Id, ContentDocumentId, ContentSize, FirstPublishLocationId
            FROM ContentVersion
            WHERE Matchday_Upload_Key__c = :uploadKey AND CreatedById = :userId
            WITH USER_MODE LIMIT 1
        ];
        if (versions.isEmpty()) return null;
        ContentVersion version = versions[0];
        if (version.FirstPublishLocationId != recordId) {
            throw new AuraHandledException('This upload belongs to a different record.');
        }
        List<ContentDocumentLink> links = [
            SELECT Id FROM ContentDocumentLink
            WHERE ContentDocumentId = :version.ContentDocumentId AND LinkedEntityId = :recordId
            WITH USER_MODE LIMIT 1
        ];
        if (links.isEmpty()) {
            throw new AuraHandledException('The file exists, but its record link could not be confirmed. Check Files before retrying.');
        }
        UploadResult result = new UploadResult();
        result.documentId = version.ContentDocumentId;
        result.versionId = version.Id;
        result.contentSize = version.ContentSize;
        return result;
    }
}
