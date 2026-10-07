import { createElement } from "lwc";
import PenaltyFileUpload from "c/penaltyFileUpload";
import { MatchdayAudio } from "../matchdayAudio";
import { audioTestContext } from "./audioTestContext";

// JSDOM's CSS parser predates container queries. Layout and animation are
// verified in Chrome; these tests exercise the actual component state.
jest.mock("../penaltyFileUpload.css", () => ({
  __esModule: true,
  default: []
}));

const flush = () => Promise.resolve();
const keeperPosition = (element) => {
  const transform = element.shadowRoot.querySelector(".keeper").style.transform;
  return 50 + Number(transform.match(/translate3d\(([-\d.]+)%/)[1]) * 0.15;
};
const file = (name = "brief.pdf", size = 12) =>
  new File(["x".repeat(size)], name, { lastModified: 1 });
const mount = () => {
  const element = createElement("c-penalty-file-upload", {
    is: PenaltyFileUpload
  });
  element.previewMode = true;
  element.recordId = "local-account";
  document.body.appendChild(element);
  element.shadowRoot.querySelector(".pitch").getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 1000,
    height: 500
  });
  return element;
};
const advance = async (ms) => {
  jest.advanceTimersByTime(ms);
  await flush();
};
const pointer = (element, type, x, y, time = 0, pointerId = 1, target) => {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    button: { value: 0 },
    buttons: { value: type === "pointerup" ? 0 : 1 },
    clientX: { value: x },
    clientY: { value: y },
    timeStamp: { value: time }
  });
  (target || element.shadowRoot.querySelector(".match-ball")).dispatchEvent(
    event
  );
};
const flick = (element, aim = 30, duration = 80) => {
  pointer(element, "pointerdown", 500, 410, 0);
  pointer(element, "pointermove", (500 + aim * 10) / 2, 315, duration / 2);
  pointer(element, "pointermove", aim * 10, 220, duration);
  pointer(element, "pointerup", aim * 10, 220, duration + 1);
};
const shoot = async (element, aim = 30) => {
  flick(element, aim);
  await advance(350);
};
const acceptUploads = (element) => {
  const requests = [];
  element.addEventListener("uploadrequest", (event) => {
    event.preventDefault();
    requests.push(event.detail);
  });
  return requests;
};

describe("Matchday file upload state and queue", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.matchMedia = jest.fn().mockReturnValue({
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
  });
  afterEach(() => {
    while (document.body.firstChild)
      document.body.removeChild(document.body.firstChild);
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.AudioContext;
  });

  it("caps a multi-file drop at ten without silently accepting the overflow", async () => {
    const element = mount();
    const event = new Event("drop", { cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: Array.from({ length: 12 }, (_, i) => file(`document-${i}.pdf`))
      }
    });
    element.shadowRoot.querySelector(".upload-arena").dispatchEvent(event);
    await flush();
    expect(event.defaultPrevented).toBe(true);
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(10);
    expect(
      element.shadowRoot.querySelector(".notice-area").textContent
    ).toContain("2 files were not added");
    expect(element.shadowRoot.querySelector(".queue-count").textContent).toBe(
      "10 / 10"
    );
  });

  it("keeps file order, uses type colors, handles unknown formats, and skips duplicates", async () => {
    const element = mount();
    const pdf = file("brief.PDF");
    element.addFiles([
      pdf,
      file("budget.csv"),
      file("notes.docx"),
      file("photo.heic"),
      file("slides.pptx"),
      file("data.bin"),
      pdf
    ]);
    await flush();
    const items = [...element.shadowRoot.querySelectorAll(".queue-item")];
    expect(items).toHaveLength(6);
    expect(
      items.map((item) => item.querySelector("strong").textContent)
    ).toEqual([
      "brief.PDF",
      "budget.csv",
      "notes.docx",
      "photo.heic",
      "slides.pptx",
      "data.bin"
    ]);
    expect(items.map((item) => item.getAttribute("style"))).toEqual([
      "--ball-color:#f36d55",
      "--ball-color:#5fd4a0",
      "--ball-color:#65aafa",
      "--ball-color:#bc9afa",
      "--ball-color:#ffbc5b",
      "--ball-color:#d3d7dc"
    ]);
    expect(
      element.shadowRoot.querySelector(".notice-area").textContent
    ).toContain("1 duplicate file was skipped");
  });

  it("allows removing a queued file and selecting the same file again", async () => {
    const element = mount();
    const pdf = file();
    element.addFiles([pdf]);
    await flush();
    element.shadowRoot.querySelector(".remove-file").click();
    await flush();
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(0);
    element.addFiles([pdf]);
    await flush();
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(1);
  });

  it("disables shooting when no file is queued", () => {
    const element = mount();
    expect(element.shadowRoot.querySelector(".match-ball").disabled).toBe(true);
  });

  it("starts upload only on a goal and keeps cheering until explicit completion", async () => {
    const element = mount();
    element.addFiles([file(), file("second.docx")]);
    const requests = acceptUploads(element);
    await flush();
    await shoot(element);
    expect(requests).toHaveLength(1);
    expect(requests[0].recordId).toBe("local-account");
    expect(requests[0].file.name).toBe("brief.pdf");
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("uploading")
    ).toBe(true);
    expect(element.shadowRoot.querySelector(".match-ball").disabled).toBe(true);
    expect(element.shadowRoot.querySelector(".remove-file").disabled).toBe(
      true
    );
    expect(
      element.shadowRoot.querySelectorAll(".remove-file")[1].disabled
    ).toBe(false);
    element.reportUploadProgress(requests[0].id, 48);
    await advance(60000);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("uploading")
    ).toBe(true);
    expect(
      element.shadowRoot
        .querySelector("[role=progressbar]")
        .getAttribute("aria-valuenow")
    ).toBe("48");
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      0
    );
    element.completeUpload(requests[0].id, { documentId: "local-document" });
    await flush();
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      1
    );
    expect(
      element.shadowRoot.querySelector(".completed-file").textContent
    ).toContain("Simulated");
    await advance(1500);
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(1);
    expect(
      element.shadowRoot.querySelector(".queue-item strong").textContent
    ).toBe("second.docx");
  });

  it("does not regress progress or complete on a progress report alone", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    await shoot(element);
    element.reportUploadProgress(requests[0].id, 60);
    element.reportUploadProgress(requests[0].id, 15);
    await flush();
    expect(
      element.shadowRoot
        .querySelector("[role=progressbar]")
        .getAttribute("aria-valuenow")
    ).toBe("60");
    element.reportUploadProgress(requests[0].id, 100);
    await flush();
    expect(
      element.shadowRoot
        .querySelector("[role=progressbar]")
        .getAttribute("aria-valuenow")
    ).toBe("99");
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      0
    );
  });

  it.each([50, 12])(
    "returns a saved or wide shot (%s) without requesting an upload",
    async (aim) => {
      const element = mount();
      element.addFiles([file()]);
      const requests = acceptUploads(element);
      await flush();
      await shoot(element, aim);
      expect(
        element.shadowRoot.querySelector(".pitch").classList.contains("saved")
      ).toBe(true);
      expect(requests).toHaveLength(0);
      await advance(850);
      expect(
        element.shadowRoot
          .querySelector(".pitch")
          .classList.contains("returning")
      ).toBe(true);
      await advance(1100);
      expect(
        element.shadowRoot.querySelector(".pitch").classList.contains("idle")
      ).toBe(true);
      expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(
        1
      );
    }
  );

  it("retains a failed file and ignores stale callbacks from an earlier attempt", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    await shoot(element);
    element.failUpload(requests[0].id, "Connection lost");
    await flush();
    expect(element.shadowRoot.querySelector(".notice-area").textContent).toBe(
      "Connection lost"
    );
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(1);
    await advance(2600);
    await shoot(element);
    expect(requests).toHaveLength(2);
    expect(requests[0].id).not.toBe(requests[1].id);
    element.completeUpload(requests[0].id);
    element.reportUploadProgress(requests[0].id, 90);
    await flush();
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      0
    );
    expect(
      element.shadowRoot
        .querySelector("[role=progressbar]")
        .getAttribute("aria-valuenow")
    ).toBe("0");
    element.completeUpload(requests[1].id);
    await advance(1500);
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      1
    );
  });

  it("fails honestly when no upload adapter accepts the request", async () => {
    const element = mount();
    element.addFiles([file()]);
    await flush();
    await shoot(element);
    expect(
      element.shadowRoot.querySelector(".notice-area").textContent
    ).toContain("upload connection is not configured");
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      0
    );
  });

  it("has no aim bar, shoot button, or click-to-score target", () => {
    const element = mount();
    expect(element.shadowRoot.querySelector("input[type=range]")).toBeNull();
    expect(element.shadowRoot.querySelector(".shoot-button")).toBeNull();
    expect(element.shadowRoot.querySelector(".goal-target")).toBeNull();
  });

  it("uses the release direction rather than the screen position of the mouse", async () => {
    const element = mount();
    element.addFiles([file()]);
    const outcomes = [];
    element.addEventListener("shot", (event) => outcomes.push(event.detail));
    const requests = acceptUploads(element);
    await flush();
    // Release well below the goal: the flick travels onward in the same direction.
    pointer(element, "pointerdown", 500, 410, 0);
    pointer(element, "pointermove", 450, 365, 30);
    pointer(element, "pointerup", 400, 320, 60);
    await advance(400);
    expect(requests).toHaveLength(1);
    expect(outcomes[0].targetY).toBeLessThan(61);
    expect(outcomes[0].targetX).toBeLessThan(40);
  });

  it("makes a fast flick travel faster and farther than the same gentle movement", async () => {
    const fast = mount();
    const soft = mount();
    fast.addFiles([file()]);
    soft.addFiles([file()]);
    const hardResults = [];
    const softResults = [];
    fast.addEventListener("shot", (event) => hardResults.push(event.detail));
    soft.addEventListener("shot", (event) => softResults.push(event.detail));
    const hardRequests = acceptUploads(fast);
    const softRequests = acceptUploads(soft);
    await flush();
    flick(fast, 30, 80);
    flick(soft, 30, 1800);
    await advance(1500);
    expect(hardResults[0].speed).toBeGreaterThan(softResults[0].speed);
    expect(hardResults[0].duration).toBeLessThan(softResults[0].duration);
    expect(hardResults[0].targetY).toBeLessThan(softResults[0].targetY);
    expect(hardRequests).toHaveLength(1);
    expect(softRequests).toHaveLength(0);
    expect(soft.shadowRoot.querySelector(".notice-area").textContent).toContain(
      "too soft"
    );
  });

  it("ignores clicks, keyboard presses, and tiny mouse jitter", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    const ball = element.shadowRoot.querySelector(".match-ball");
    ball.click();
    ball.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    pointer(element, "pointerdown", 500, 410, 0);
    pointer(element, "pointermove", 502, 408, 40);
    pointer(element, "pointerup", 502, 408, 100);
    await advance(2000);
    expect(requests).toHaveLength(0);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("idle")
    ).toBe(true);
  });

  it.each([250, 800, 2000])(
    "still shoots when a deliberate drag pauses for %s ms before release",
    async (pause) => {
      const element = mount();
      element.addFiles([file()]);
      acceptUploads(element);
      const shots = [];
      element.addEventListener("shot", (event) => shots.push(event.detail));
      await flush();
      pointer(element, "pointerdown", 500, 410, 0);
      pointer(element, "pointermove", 400, 315, 40);
      pointer(element, "pointermove", 300, 220, 80);
      pointer(element, "pointerup", 300, 220, 80 + pause);
      await flush();
      expect(
        element.shadowRoot
          .querySelector(".pitch")
          .classList.contains("shooting")
      ).toBe(true);
      await advance(1500);
      expect(shots).toHaveLength(1);
      expect(shots[0].speed).toBeGreaterThan(0);
      expect(shots[0].targetX).toBeLessThan(50);
    }
  );

  it("finishes a drag outside the ball even if pointer capture is unavailable or lost", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    const ball = element.shadowRoot.querySelector(".match-ball");
    ball.setPointerCapture = jest.fn(() => {
      throw new Error("Capture unavailable");
    });
    pointer(element, "pointerdown", 500, 410, 0);
    ball.dispatchEvent(new Event("lostpointercapture"));
    pointer(element, "pointermove", 400, 315, 40, 1, window);
    pointer(element, "pointermove", 300, 220, 80, 1, window);
    pointer(element, "pointerup", 300, 220, 81, 1, window);
    pointer(element, "pointerup", 300, 220, 81);
    await advance(350);
    expect(requests).toHaveLength(1);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("aiming")
    ).toBe(false);
  });

  it("cancels safely when the window loses focus and removes gesture listeners", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    pointer(element, "pointerdown", 500, 410, 0);
    pointer(element, "pointermove", 300, 220, 80);
    window.dispatchEvent(new Event("blur"));
    pointer(element, "pointerup", 300, 220, 81, 1, window);
    await advance(2000);
    expect(requests).toHaveLength(0);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("idle")
    ).toBe(true);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("aiming")
    ).toBe(false);
  });

  it("keeps the goalkeeper moving while a ball is held, flying, caught, and returned", async () => {
    window.matchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    const element = mount();
    element.addFiles([file()]);
    const keeper = () =>
      element.shadowRoot.querySelector(".keeper").getAttribute("style");
    await flush();
    pointer(element, "pointerdown", 500, 410, 0);
    let previous = keeper();
    await advance(200);
    expect(keeper()).not.toBe(previous);
    pointer(element, "pointercancel", 500, 410, 200);
    flick(element, 50);
    previous = keeper();
    await advance(80);
    expect(keeper()).not.toBe(previous);
    await advance(270);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("saved")
    ).toBe(true);
    previous = keeper();
    await advance(200);
    expect(keeper()).not.toBe(previous);
    expect(
      element.shadowRoot.querySelector(".keeper-arms").getAttribute("d")
    ).toContain("L42 63");
    await advance(700);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("returning")
    ).toBe(true);
    previous = keeper();
    await advance(160);
    expect(keeper()).not.toBe(previous);
  });

  it("checks a save at arrival so the moving goalkeeper can reach a slower ball", async () => {
    window.matchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    const outcomes = [];
    element.addEventListener("shot", (event) => outcomes.push(event.detail));
    await flush();
    const releasePosition = keeperPosition(element);
    flick(element, 65, 600);
    await advance(1250);
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].targetX - releasePosition).toBeGreaterThan(8.5);
    expect(outcomes[0].outcome).toBe("saved");
    expect(requests).toHaveLength(0);
  });

  it("gets upset after a goal and patrols faster throughout the upload", async () => {
    window.matchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    const element = mount();
    element.addFiles([file()]);
    acceptUploads(element);
    await flush();
    const x = () => keeperPosition(element);
    const initial = x();
    await advance(200);
    const calmDistance = Math.abs(x() - initial);
    await shoot(element);
    expect(
      element.shadowRoot.querySelector(".keeper").classList.contains("angry")
    ).toBe(true);
    expect(element.shadowRoot.querySelector(".keeper-mood").textContent).toBe(
      "?!"
    );
    const afterGoal = x();
    await advance(200);
    expect(Math.abs(x() - afterGoal)).toBeGreaterThan(calmDistance * 1.4);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("uploading")
    ).toBe(true);
  });

  it("keeps a goal ball in the net layer, then restores the normal face and faster pace on the next ball", async () => {
    window.matchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    const element = mount();
    element.addFiles([file(), file("next.pdf")]);
    const requests = acceptUploads(element);
    await flush();
    const x = () => keeperPosition(element);
    const normalFace = element.shadowRoot
      .querySelector(".keeper-face")
      .getAttribute("d");
    const start = x();
    await advance(200);
    const originalPace = Math.abs(x() - start);
    await shoot(element);
    expect(
      element.shadowRoot
        .querySelector(".match-ball")
        .classList.contains("in-net")
    ).toBe(true);
    expect(
      element.shadowRoot.querySelector(".keeper").classList.contains("angry")
    ).toBe(true);
    element.completeUpload(requests[0].id);
    await flush();
    expect(
      element.shadowRoot
        .querySelector(".match-ball")
        .classList.contains("in-net")
    ).toBe(true);
    await advance(1500);
    expect(
      element.shadowRoot
        .querySelector(".match-ball")
        .classList.contains("in-net")
    ).toBe(false);
    expect(
      element.shadowRoot.querySelector(".keeper").classList.contains("angry")
    ).toBe(false);
    expect(element.shadowRoot.querySelector(".keeper-mood")).toBeNull();
    expect(
      element.shadowRoot.querySelector(".keeper-face").getAttribute("d")
    ).toBe(normalFace);
    const nextStart = x();
    await advance(200);
    expect(Math.abs(x() - nextStart)).toBeGreaterThan(originalPace * 1.4);
  });

  it("also clears anger when a failed upload returns its ball to the spot", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    await shoot(element);
    element.failUpload(requests[0].id, "Try again");
    await flush();
    expect(
      element.shadowRoot
        .querySelector(".match-ball")
        .classList.contains("in-net")
    ).toBe(true);
    await advance(2700);
    expect(
      element.shadowRoot.querySelector(".keeper").classList.contains("angry")
    ).toBe(false);
    expect(element.shadowRoot.querySelector(".keeper-mood")).toBeNull();
    expect(
      element.shadowRoot
        .querySelector(".match-ball")
        .classList.contains("in-net")
    ).toBe(false);
  });

  it("cancels an interrupted drag without uploading", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    const ball = element.shadowRoot.querySelector(".match-ball");
    ball.dispatchEvent(new Event("pointerdown", { cancelable: true }));
    ball.dispatchEvent(new Event("pointercancel"));
    await advance(1000);
    expect(requests).toHaveLength(0);
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("aiming")
    ).toBe(false);
    expect(element.shadowRoot.querySelector(".match-ball").disabled).toBe(
      false
    );
  });

  it("cleans up animation and upload timers when removed", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    await shoot(element);
    expect(requests).toHaveLength(1);
    document.body.removeChild(element);
    expect(jest.getTimerCount()).toBe(0);
  });

  it("enforces the host size limit before queuing a file", async () => {
    const element = mount();
    element.maxFileBytes = 100;
    element.addFiles([file("small.pdf", 50), file("large.pdf", 101)]);
    await flush();
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(1);
    expect(
      element.shadowRoot.querySelector(".notice-area").textContent
    ).toContain("exceeds");
  });

  it("clears the previous record queue and ignores its late upload result", async () => {
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    await shoot(element);
    element.recordId = "new-record";
    element.completeUpload(requests[0].id, { documentId: "old-file" });
    await advance(2000);
    expect(element.shadowRoot.querySelectorAll(".queue-item")).toHaveLength(0);
    expect(element.shadowRoot.querySelectorAll(".completed-file")).toHaveLength(
      0
    );
    expect(
      element.shadowRoot.querySelector(".pitch").classList.contains("idle")
    ).toBe(true);
  });

  it("uses indeterminate upload feedback when transport progress is unavailable", async () => {
    const element = mount();
    element.uploadIndeterminate = true;
    element.addFiles([file()]);
    acceptUploads(element);
    await flush();
    await shoot(element);
    expect(element.shadowRoot.querySelector(".upload-percent")).toBeNull();
    expect(
      element.shadowRoot
        .querySelector(".upload-progress")
        .getAttribute("aria-valuenow")
    ).toBeNull();
    expect(
      element.shadowRoot.querySelector(".commentary-box").textContent
    ).toContain("Attaching your file");
  });

  it("animates without mutating inherited stadium styles or rebuilding the file queue", async () => {
    window.matchMedia.mockReturnValue({
      matches: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    });
    const element = mount();
    element.addFiles([file(), file("next.csv")]);
    await flush();
    const pitch = element.shadowRoot.querySelector(".pitch");
    const queue = element.shadowRoot.querySelector(".queue-list");
    const mutations = [];
    const observer = new MutationObserver((records) =>
      mutations.push(...records)
    );
    observer.observe(pitch, { attributes: true });
    observer.observe(queue, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true
    });
    const start = keeperPosition(element);
    await advance(600);
    expect(keeperPosition(element)).not.toBe(start);
    expect(mutations).toHaveLength(0);
    observer.disconnect();
  });

  it("plays a kick on release, a net hit and cheer on a goal, and ends celebration on completion", async () => {
    const context = audioTestContext();
    window.AudioContext = jest.fn(() => context);
    const kick = jest.spyOn(MatchdayAudio.prototype, "kick");
    const net = jest.spyOn(MatchdayAudio.prototype, "net");
    const cheer = jest.spyOn(MatchdayAudio.prototype, "cheer");
    const complete = jest.spyOn(MatchdayAudio.prototype, "complete");
    const element = mount();
    element.addFiles([file()]);
    const requests = acceptUploads(element);
    await flush();
    element.shadowRoot.querySelector(".sound-button").click();
    await flush();
    await flush();
    element.shadowRoot.querySelector(".match-ball").click();
    expect(kick).not.toHaveBeenCalled();
    flick(element);
    expect(kick).toHaveBeenCalledTimes(1);
    expect(net).not.toHaveBeenCalled();
    await advance(350);
    expect(net).toHaveBeenCalledTimes(1);
    expect(cheer).toHaveBeenCalledTimes(1);
    await advance(12000);
    expect(complete).not.toHaveBeenCalled();
    element.completeUpload(requests[0].id);
    expect(complete).toHaveBeenCalledTimes(1);
    document.body.removeChild(element);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("plays catch and disappointed crowd sounds on a save without a net sound", async () => {
    const context = audioTestContext();
    window.AudioContext = jest.fn(() => context);
    const catchBall = jest.spyOn(MatchdayAudio.prototype, "catchBall");
    const disappoint = jest.spyOn(MatchdayAudio.prototype, "disappoint");
    const net = jest.spyOn(MatchdayAudio.prototype, "net");
    const element = mount();
    element.addFiles([file()]);
    acceptUploads(element);
    await flush();
    element.shadowRoot.querySelector(".sound-button").click();
    await flush();
    await flush();
    await shoot(element, 50);
    expect(catchBall).toHaveBeenCalledTimes(1);
    expect(disappoint).toHaveBeenCalledTimes(1);
    expect(net).not.toHaveBeenCalled();
    element.shadowRoot.querySelector(".sound-button").click();
    await flush();
    expect(
      element.shadowRoot
        .querySelector(".sound-button")
        .getAttribute("aria-pressed")
    ).toBe("false");
    for (const source of context.sources)
      expect(source.stop).toHaveBeenCalled();
  });
});
