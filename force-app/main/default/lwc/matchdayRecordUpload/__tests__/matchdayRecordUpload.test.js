import { createElement } from "lwc";
import MatchdayRecordUpload from "c/matchdayRecordUpload";
import { createRecord } from "lightning/uiRecordApi";
import findUpload from "@salesforce/apex/MatchdayFileUploadController.findUpload";

jest.mock(
  "@salesforce/apex/MatchdayFileUploadController.findUpload",
  () => ({ default: jest.fn() }),
  { virtual: true }
);
jest.mock("../../penaltyFileUpload/penaltyFileUpload.css", () => ({
  __esModule: true,
  default: []
}));
const RECORD = "001000000000001AAA";
const RESULT = {
  documentId: "069000000000001AAA",
  versionId: "068000000000001AAA",
  contentSize: 4
};
const flush = async () => {
  for (let n = 0; n < 12; n++) await Promise.resolve();
};
const mount = () => {
  const element = createElement("c-matchday-record-upload", {
    is: MatchdayRecordUpload
  });
  element.recordId = RECORD;
  document.body.appendChild(element);
  const game = element.shadowRoot.querySelector("c-penalty-file-upload");
  jest.spyOn(game, "completeUpload");
  jest.spyOn(game, "failUpload");
  return { element, game };
};
const request = (
  game,
  id = "attempt-1",
  file = new File(["goal"], "goal.txt", { lastModified: 1 })
) => {
  const event = new CustomEvent("uploadrequest", {
    detail: { id, file, recordId: RECORD },
    cancelable: true
  });
  game.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
};

describe("Matchday Salesforce adapter", () => {
  let originalReader;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    originalReader = window.FileReader;
    window.FileReader = class {
      readAsDataURL() {
        this.result = "data:text/plain;base64,Z29hbA==";
        this.onload();
      }
    };
    createRecord.mockResolvedValue({ id: RESULT.versionId });
  });
  afterEach(() => {
    while (document.body.firstChild) document.body.firstChild.remove();
    window.FileReader = originalReader;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("does not upload until a goal request, then confirms saved bytes and the record link", async () => {
    findUpload.mockResolvedValueOnce(null).mockResolvedValueOnce(RESULT);
    const { game } = mount();
    expect(createRecord).not.toHaveBeenCalled();
    request(game);
    await flush();
    expect(createRecord).toHaveBeenCalledWith({
      apiName: "ContentVersion",
      fields: expect.objectContaining({
        Title: "goal.txt",
        PathOnClient: "goal.txt",
        VersionData: "Z29hbA==",
        FirstPublishLocationId: RECORD,
        Matchday_Upload_Key__c: expect.stringMatching(/^[a-f0-9]{32}$/)
      })
    });
    expect(game.completeUpload).toHaveBeenCalledWith("attempt-1", RESULT);
    expect(game.failUpload).not.toHaveBeenCalled();
  });

  it("recovers an already committed upload without sending the file again", async () => {
    findUpload.mockResolvedValue(RESULT);
    const { game } = mount();
    request(game);
    await flush();
    expect(createRecord).not.toHaveBeenCalled();
    expect(game.completeUpload).toHaveBeenCalledWith("attempt-1", RESULT);
  });

  it("reconciles a lost response and ignores duplicate delivery of a goal event", async () => {
    findUpload.mockResolvedValueOnce(null).mockResolvedValueOnce(RESULT);
    createRecord.mockRejectedValue(new Error("Connection lost"));
    const { game } = mount();
    request(game);
    request(game);
    await flush();
    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(game.completeUpload).toHaveBeenCalledTimes(1);
    expect(game.failUpload).not.toHaveBeenCalled();
  });

  it("keeps the same unique key on retry after an unconfirmed response", async () => {
    findUpload.mockResolvedValue(null);
    createRecord.mockRejectedValue(new Error("Connection lost"));
    const { game } = mount();
    request(game);
    await flush();
    const firstKey =
      createRecord.mock.calls[0][0].fields.Matchday_Upload_Key__c;
    request(game, "attempt-2");
    await flush();
    expect(createRecord.mock.calls[1][0].fields.Matchday_Upload_Key__c).toBe(
      firstKey
    );
    expect(game.completeUpload).not.toHaveBeenCalled();
    expect(game.failUpload).toHaveBeenCalledTimes(2);
  });

  it("never sends a file after navigation changes the target record", async () => {
    let resolve;
    findUpload.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { element, game } = mount();
    request(game);
    element.recordId = "001000000000002AAA";
    resolve(null);
    await flush();
    expect(createRecord).not.toHaveBeenCalled();
    expect(game.completeUpload).not.toHaveBeenCalled();
  });

  it("does not call an upload successful when saved byte count differs", async () => {
    findUpload.mockResolvedValue({ ...RESULT, contentSize: 99 });
    const { game } = mount();
    request(game);
    await flush();
    expect(game.completeUpload).not.toHaveBeenCalled();
    expect(game.failUpload).toHaveBeenCalled();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("rejects oversized files before reading or contacting Salesforce", async () => {
    const { game } = mount();
    request(game, "large", { name: "large.pdf", size: 11 * 1024 * 1024 });
    await flush();
    expect(findUpload).not.toHaveBeenCalled();
    expect(createRecord).not.toHaveBeenCalled();
    expect(game.failUpload).toHaveBeenCalledWith(
      "large",
      "Choose a file of 10 MB or less."
    );
  });

  it("shows the platform permission error without a fake successful upload", async () => {
    findUpload.mockRejectedValue({
      body: { message: "You do not have access to this record." }
    });
    const { game } = mount();
    request(game);
    await flush();
    expect(createRecord).not.toHaveBeenCalled();
    expect(game.completeUpload).not.toHaveBeenCalled();
    expect(game.failUpload).toHaveBeenCalledWith(
      "attempt-1",
      "You do not have access to this record."
    );
  });
});
