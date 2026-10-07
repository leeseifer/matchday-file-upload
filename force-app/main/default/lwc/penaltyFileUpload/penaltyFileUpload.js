import { LightningElement, api } from "lwc";
import { releaseVelocity, flightFromFlick } from "./flickPhysics";
import { MatchdayAudio } from "./matchdayAudio";

const MAX_FILES = 10;
const TYPES = {
  pdf: { color: "#f36d55", label: "PDF" },
  doc: { color: "#65aafa", label: "DOC" },
  docx: { color: "#65aafa", label: "DOC" },
  txt: { color: "#65aafa", label: "TXT" },
  rtf: { color: "#65aafa", label: "DOC" },
  xls: { color: "#5fd4a0", label: "XLS" },
  xlsx: { color: "#5fd4a0", label: "XLS" },
  csv: { color: "#5fd4a0", label: "CSV" },
  ppt: { color: "#ffbc5b", label: "PPT" },
  pptx: { color: "#ffbc5b", label: "PPT" },
  png: { color: "#bc9afa", label: "IMG" },
  jpg: { color: "#bc9afa", label: "IMG" },
  jpeg: { color: "#bc9afa", label: "IMG" },
  heic: { color: "#bc9afa", label: "IMG" },
  gif: { color: "#bc9afa", label: "IMG" },
  svg: { color: "#bc9afa", label: "IMG" },
  webp: { color: "#bc9afa", label: "IMG" }
};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export default class PenaltyFileUpload extends LightningElement {
  _recordId;
  @api get recordId() {
    return this._recordId;
  }
  set recordId(value) {
    if (this._recordId && this._recordId !== value) {
      this.finishPointerTracking();
      this._timers.forEach((id) => clearTimeout(id));
      this._timers.clear();
      this._flight = null;
      this._returnFlight = null;
      this._activeId = null;
      this.queue = [];
      this.completed = [];
      this.goals = 0;
      this.state = "idle";
      this.progress = 0;
      this.notice = "Record changed. Select files for this record.";
      this.lastResult = "";
      this.stopCrowdSound();
      this.resetBall();
    }
    this._recordId = value;
  }
  @api previewMode = false;
  @api maxFileBytes = 0;
  @api uploadIndeterminate = false;

  queue = [];
  completed = [];
  state = "idle";
  progress = 0;
  goals = 0;
  keeperUpset = false;
  attempts = 0;
  keeperX = 50;
  ballX = 50;
  ballY = 82;
  ballScale = 1;
  ballSpin = 0;
  shotPower = 0;
  isDraggingFiles = false;
  isAiming = false;
  soundEnabled = false;
  reducedMotion = false;
  notice = "";
  lastResult = "";
  _sequence = 0;
  _timers = new Set();
  _activeId;
  _keeperTime = 0;
  _dragDepth = 0;
  _pointerId;
  _audio;
  _motionQuery;
  _keeperDirection = 1;
  _flight;
  _returnFlight;
  _samples = [];

  fans = Array.from({ length: 72 }, (_, i) => ({
    id: `fan-${i}`,
    className: `fan fan-${i % 5}${i % 9 === 0 ? " flag-fan" : ""}`,
    style: `--fan-x:${(i % 8) * 12.5 + 3}%;--delay:-${(i * 0.17).toFixed(2)}s;--shirt:${["#f5b64d", "#e5715d", "#82bdaa", "#f0e6cf", "#a3a0cc"][i % 5]};--skin:${["#dfab7f", "#b77f5c", "#f2c9a0", "#8d5c47"][i % 4]}`
  }));
  crowdSections = Array.from({ length: 9 }, (_, i) => ({
    id: `section-${i}`,
    style: `left:${(i % 3) * 33.333}%;top:${Math.floor(i / 3) * 30 + 6}%;--section-delay:-${(i * 0.19).toFixed(2)}s`,
    fans: this.fans.slice(i * 8, i * 8 + 8)
  }));
  confetti = Array.from({ length: 22 }, (_, i) => ({
    id: `confetti-${i}`,
    style: `left:${(i * 17) % 100}%;--delay:${(i % 7) * 0.13}s;--piece:${["#f9c760", "#ef795d", "#b8edce", "#fff7df"][i % 4]};--turn:${i * 33}deg`
  }));

  connectedCallback() {
    this._motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this.reducedMotion = Boolean(this._motionQuery?.matches);
    this._motionQuery?.addEventListener?.("change", this.handleMotionChange);
    this._lastTick = Date.now();
    this._animationFrame = window.requestAnimationFrame(this.animateMatch);
  }

  renderedCallback() {
    // Frame coordinates are deliberately absent from template bindings. Keep
    // them local to the moving elements, without rerendering all 72 spectators
    // or invalidating inherited custom properties across the entire pitch.
    this.paintMotion(true);
  }

  disconnectedCallback() {
    window.cancelAnimationFrame(this._animationFrame);
    this.finishPointerTracking();
    this._timers.forEach((id) => clearTimeout(id));
    this._timers.clear();
    this._motionQuery?.removeEventListener?.("change", this.handleMotionChange);
    this._audio?.dispose();
    this._audio = null;
    this._flight = null;
    this._returnFlight = null;
  }

  handleMotionChange = (event) => {
    this.reducedMotion = event.matches;
  };

  animateMatch = () => {
    if (!this.isConnected) return;
    this.updateMatch();
    this.paintMotion();
    this._animationFrame = window.requestAnimationFrame(this.animateMatch);
  };

  handleWindowPointerMove = (event) => this.handlePointerMove(event);
  handleWindowPointerUp = (event) => this.handlePointerUp(event);
  handleWindowPointerCancel = (event) => {
    if (event.pointerId === this._pointerId) this.handlePointerCancel();
  };
  handleWindowBlur = () => this.handlePointerCancel();

  later(callback, delay) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      if (this.isConnected) callback();
    }, delay);
    this._timers.add(id);
    return id;
  }

  get activeFile() {
    return this.queue[0];
  }
  get hasFiles() {
    return this.queue.length > 0;
  }
  get hasCompleted() {
    return this.completed.length > 0;
  }
  get queueCount() {
    return this.queue.length;
  }
  get uploadedCount() {
    return this.completed.length;
  }
  get queueLabel() {
    return `${this.queue.length} / ${MAX_FILES}`;
  }
  get busy() {
    return this.state !== "idle";
  }
  get cannotShoot() {
    return this.busy || !this.hasFiles;
  }
  get isUploading() {
    return this.state === "uploading";
  }
  get isCelebrating() {
    return this.isUploading || this.state === "success";
  }
  get isError() {
    return this.state === "error";
  }
  get pitchClass() {
    return `pitch ${this.state}${this.isDraggingFiles ? " files-over" : ""}${this.isAiming ? " aiming" : ""}${this.reducedMotion ? " reduced-motion" : ""}`;
  }
  get arenaStyle() {
    return `--ball-color:${this.activeFile?.color || "#f2eee1"}`;
  }
  get activeName() {
    return this.activeFile?.name || "Your next great upload";
  }
  get activeType() {
    return this.activeFile?.label || "FILE";
  }
  get ballLabel() {
    return this.hasFiles
      ? `Flick ${this.activeFile.name} toward the goal. Faster mouse movement makes a harder shot. Release to kick.`
      : "Add files to create your first ball";
  }
  get ballClass() {
    return `match-ball${this.isUploading || this.state === "success" || this.state === "error" ? " in-net" : ""}`;
  }
  get ballPositionClass() {
    return `ball-position${this.isUploading || this.state === "success" || this.state === "error" ? " in-net" : ""}`;
  }
  get keeperClass() {
    return `keeper${this.keeperIsUpset ? " angry" : ""}`;
  }
  get keeperIsUpset() {
    return this.keeperUpset;
  }
  get keeperStep() {
    return this.reducedMotion
      ? 0
      : Math.sin(this._keeperTime * (this.goals > 0 ? 16 : 9));
  }
  get keeperLegs() {
    const step = this.keeperStep;
    return `M42 78 L${34 + step * 5} 99 L${25 + step * 9} ${120 - Math.max(0, step) * 4} M58 78 L${68 - step * 5} 99 L${78 - step * 9} ${120 - Math.max(0, -step) * 4}`;
  }
  get keeperShoes() {
    const step = this.keeperStep;
    return `M${25 + step * 9} ${120 - Math.max(0, step) * 4} h-9 M${78 - step * 9} ${120 - Math.max(0, -step) * 4} h9`;
  }
  get keeperFace() {
    return this.keeperIsUpset
      ? "M44 22 h2 M54 22 h2 M46 31 Q50 26 54 31 M42 17 L47 19 M53 19 L58 17"
      : "M45 22 h1 M54 22 h1 M46 28 Q50 33 54 28";
  }
  get keeperArms() {
    if (this.state === "saved")
      return "M35 43 L27 54 L42 63 M65 43 L73 54 L58 63";
    if (this.state === "returning")
      return "M35 43 L24 24 L38 9 M65 43 L76 24 L62 9";
    return "M35 43 L20 55 L8 40 M65 43 L80 55 L92 40";
  }
  get keeperGloves() {
    if (this.state === "saved") return "M42 63 L47 61 M58 63 L53 61";
    if (this.state === "returning") return "M38 9 L44 8 M62 9 L56 8";
    return "M8 40 L4 29 M92 40 L96 29";
  }
  get progressStyle() {
    if (this.uploadIndeterminate) return "width:35%";
    return `width:${this.progress}%`;
  }
  get progressClass() {
    return `upload-progress${this.uploadIndeterminate ? " indeterminate" : ""}`;
  }
  get progressValue() {
    return this.uploadIndeterminate ? undefined : this.progress;
  }
  get showUploadPercent() {
    return this.isUploading && !this.uploadIndeterminate;
  }
  get fileLimitLabel() {
    return this.maxFileBytes
      ? `Up to ${this.formatSize(this.maxFileBytes)} each · 10 in the queue`
      : "Any file type · 10 in the queue";
  }
  get progressLabel() {
    return `${Math.round(this.progress)}%`;
  }
  get soundLabel() {
    return this.soundEnabled ? "Mute match sounds" : "Enable match sounds";
  }
  get soundText() {
    return this.soundEnabled ? "Sound on" : "Sound off";
  }
  get motionLabel() {
    return this.reducedMotion ? "Motion reduced" : "Motion on";
  }
  get modeLabel() {
    return this.previewMode ? "LOCAL PREVIEW" : "RECORD FILES";
  }
  get hasNotice() {
    return Boolean(this.notice);
  }
  get statusTitle() {
    if (this.isUploading) return "GOOOAL!";
    if (this.state === "success") return "IT’S IN!";
    if (this.state === "returning" || this.state === "saved")
      return "OOOH! SO CLOSE.";
    if (this.isError) return "LET’S TRY AGAIN.";
    if (this.state === "shooting")
      return this.shotPower > 0.65 ? "WHAT A STRIKE!" : "A GENTLE TOUCH…";
    return this.hasFiles ? "MAKE IT COUNT." : "A LITTLE PLAY. A LOT DONE.";
  }
  get statusDetail() {
    if (this.isUploading)
      return this.uploadIndeterminate
        ? "The crowd is with you. Attaching your file to this record…"
        : `The crowd is with you. Uploading ${this.progressLabel}`;
    if (this.state === "success")
      return this.previewMode
        ? "Upload simulated. One more for the highlight reel."
        : "File attached. One more for the highlight reel.";
    if (this.state === "saved" || this.state === "returning")
      return "The keeper sends it back. Your file is safe. Try a corner!";
    if (this.isError)
      return "Your file stays in the queue, ready for another shot.";
    if (this.state === "shooting")
      return this.shotPower > 0.65
        ? "That one has some pace!"
        : "A softer flick. Will it reach the net?";
    return this.hasFiles
      ? "Grab the ball and flick. Quick for power. Gentle for a soft shot."
      : "Drop your documents below. We’ll turn them into footballs.";
  }
  get queueItems() {
    return this.queue.map((file, index) => ({
      ...file,
      className: `queue-item${index === 0 ? " current" : ""}`,
      style: `--ball-color:${file.color}`,
      subtitle:
        index === 0
          ? this.isUploading
            ? `Uploading · ${this.progressLabel}`
            : "On the spot"
          : `${file.sizeLabel} · Up next`,
      removeLabel: `Remove ${file.name}`,
      disabled: index === 0 && this.busy
    }));
  }

  @api addFiles(files) {
    const incoming = Array.from(files || []);
    let duplicates = 0;
    let overflow = 0;
    let added = 0;
    let oversized = 0;
    const next = [...this.queue];
    for (const file of incoming) {
      if (
        !file ||
        typeof file.name !== "string" ||
        typeof file.size !== "number"
      )
        continue;
      if (this.maxFileBytes && file.size > this.maxFileBytes) {
        oversized++;
        continue;
      }
      const fingerprint = `${file.name}|${file.size}|${file.lastModified || 0}`;
      if (next.some((item) => item.fingerprint === fingerprint)) {
        duplicates++;
        continue;
      }
      if (next.length >= MAX_FILES) {
        overflow++;
        continue;
      }
      const ext = file.name.split(".").pop().toLowerCase();
      const type = TYPES[ext] || {
        color: "#d3d7dc",
        label: ext.length <= 5 ? ext.toUpperCase() : "FILE"
      };
      next.push({
        id: `file-${++this._sequence}`,
        file,
        fingerprint,
        name: file.name,
        ...type,
        sizeLabel: this.formatSize(file.size)
      });
      added++;
    }
    this.queue = next;
    this.notice = [
      added
        ? `${added} ${added === 1 ? "file is" : "files are"} ready to play.`
        : "",
      duplicates
        ? `${duplicates} duplicate ${duplicates === 1 ? "file was" : "files were"} skipped.`
        : "",
      overflow
        ? `The queue holds 10 files. ${overflow} ${overflow === 1 ? "file was" : "files were"} not added.`
        : "",
      oversized
        ? `${oversized} ${oversized === 1 ? "file exceeds" : "files exceed"} the ${this.formatSize(this.maxFileBytes)} limit and ${oversized === 1 ? "was" : "were"} not added.`
        : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  formatSize(size) {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  openPicker() {
    this.template.querySelector("input[type=file]").click();
  }
  handleFileChange(event) {
    this.addFiles(event.target.files);
    event.target.value = "";
  }
  handleDragEnter(event) {
    event.preventDefault();
    this._dragDepth++;
    this.isDraggingFiles = true;
  }
  handleDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }
  handleDragLeave(event) {
    event.preventDefault();
    this._dragDepth = Math.max(0, this._dragDepth - 1);
    if (!this._dragDepth) this.isDraggingFiles = false;
  }
  handleDrop(event) {
    event.preventDefault();
    this._dragDepth = 0;
    this.isDraggingFiles = false;
    this.addFiles(event.dataTransfer?.files);
  }
  removeFile(event) {
    const id = event.currentTarget.dataset.id;
    if (id === this.activeFile?.id && this.busy) return;
    this.queue = this.queue.filter((file) => file.id !== id);
    this.notice = "File removed from the queue.";
  }
  clearQueue() {
    if (this.busy) return;
    this.queue = [];
    this.notice = "Queue cleared. Ready for a fresh kick-off.";
  }
  paintMotion(force = false) {
    const refs = this.refs;
    if (!refs?.keeper) return;
    const keeperTransform = `translate3d(${((this.keeperX - 50) / 0.15).toFixed(3)}%,0,0) translateX(-50%)`;
    const positionTransform = `translate3d(${this.ballX.toFixed(3)}%,${this.ballY.toFixed(3)}%,0)`;
    const ballTransform = `translate(-50%,-50%) scale(${this.ballScale.toFixed(3)}) rotate(${this.ballSpin.toFixed(2)}deg)`;
    if (force || keeperTransform !== this._paintedKeeper) {
      refs.keeper.style.transform = keeperTransform;
      this._paintedKeeper = keeperTransform;
    }
    if (force || positionTransform !== this._paintedPosition) {
      refs.ballPosition.style.transform = positionTransform;
      this._paintedPosition = positionTransform;
    }
    if (force || ballTransform !== this._paintedBall) {
      refs.ball.style.transform = ballTransform;
      this._paintedBall = ballTransform;
    }
    // The body travels every display frame; a small SVG foot shuffle needs
    // fewer updates and does not need to invalidate the rest of the component.
    if (
      force ||
      (!this.reducedMotion &&
        this._keeperTime - (this._paintedStep || 0) >= 1 / 30)
    ) {
      refs.legs.setAttribute("d", this.keeperLegs);
      refs.shoes.setAttribute("d", this.keeperShoes);
      this._paintedStep = this._keeperTime;
    }
  }
  updateMatch() {
    const now = Date.now();
    const dt = Math.min(0.1, (now - this._lastTick) / 1000);
    this._lastTick = now;
    this._keeperTime += dt;
    const pace = 12 + Math.min(this.goals, 3) * 7;
    if (!this.reducedMotion) {
      if (this.state === "saved") {
        this.keeperX = clamp(
          this._catchX + Math.sin(this._keeperTime * 8) * 1.4,
          26,
          74
        );
      } else if (this._flight && now - this._flight.started > 140) {
        const target = clamp(this._flight.x, 27, 73);
        const offset = target - this.keeperX;
        // A soft ball gives him time to close down the angle; a fast flick can beat him.
        this.keeperX += clamp(offset, -pace * dt * 1.25, pace * dt * 1.25);
        if (Math.abs(offset) < 0.8)
          this.keeperX += Math.sin(this._keeperTime * 9) * 0.3;
      } else {
        this.keeperX += this._keeperDirection * pace * dt;
        if (this.keeperX >= 73 || this.keeperX <= 27) {
          this.keeperX = clamp(this.keeperX, 27, 73);
          this._keeperDirection *= -1;
        }
      }
    }
    if (this._flight) {
      const flight = this._flight;
      const t = clamp((now - flight.started) / flight.duration, 0, 1);
      const visualT = this.reducedMotion && t < 1 ? 0 : t;
      this.ballX = flight.fromX + (flight.x - flight.fromX) * visualT;
      this.ballY =
        flight.fromY +
        (flight.y - flight.fromY) * visualT -
        Math.sin(Math.PI * visualT) * flight.power * 5;
      this.ballScale = clamp(0.47 + ((this.ballY - 42) / 40) * 0.53, 0.43, 1.2);
      this.ballSpin = visualT * (150 + flight.power * 780);
      if (t >= 1) {
        this._flight = null;
        this.resolveShot(flight);
      }
    } else if (this.state === "saved") {
      this.ballX = this.keeperX;
      this.ballY = 52 + Math.sin(this._keeperTime * 8) * 0.35;
      this.ballScale = 0.43;
    } else if (this._returnFlight) {
      const flight = this._returnFlight;
      const t = clamp((now - flight.started) / 1050, 0, 1);
      this.ballX = flight.x + (50 - flight.x) * t;
      this.ballY = 52 + 30 * t - Math.sin(Math.PI * t) * 29;
      this.ballScale = 0.43 + 0.57 * t;
      this.ballSpin = -540 * t;
      if (t >= 1) {
        this._returnFlight = null;
        this.resetBall();
        this._activeId = null;
        this.state = "idle";
      }
    }
  }

  resetBall() {
    this.ballX = 50;
    this.ballY = 82;
    this.ballScale = 1;
    this.ballSpin = 0;
    this.keeperUpset = false;
  }

  recordPointer(event) {
    const sample = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp
    };
    const previous = this._samples[this._samples.length - 1];
    if (
      previous &&
      previous.time === sample.time &&
      previous.x === sample.x &&
      previous.y === sample.y
    )
      return false;
    this._samples.push(sample);
    // Keep the start and recent history, including the last movement before a pause.
    if (this._samples.length > 128) this._samples.splice(1, 1);
    return true;
  }

  handlePointerDown(event) {
    if (
      this.cannotShoot ||
      this.isAiming ||
      (event.button !== undefined && event.button !== 0) ||
      event.isPrimary === false
    )
      return;
    event.preventDefault();
    this.isAiming = true;
    this._pointerId = event.pointerId;
    this._startPoint = { x: event.clientX, y: event.clientY };
    this._gestureRect = this.template
      .querySelector(".pitch")
      .getBoundingClientRect();
    this._samples = [];
    this.recordPointer(event);
    this._capturedBall = event.currentTarget;
    window.addEventListener("pointermove", this.handleWindowPointerMove, true);
    window.addEventListener("pointerup", this.handleWindowPointerUp, true);
    window.addEventListener(
      "pointercancel",
      this.handleWindowPointerCancel,
      true
    );
    window.addEventListener("blur", this.handleWindowBlur);
    try {
      this._capturedBall.setPointerCapture?.(event.pointerId);
    } catch {
      /* Window listeners retain the gesture if capture is unavailable. */
    }
  }

  handlePointerMove(event) {
    if (!this.isAiming || event.pointerId !== this._pointerId) return;
    if (event.buttons === 0) {
      this.handlePointerUp(event);
      return;
    }
    if (!this.recordPointer(event)) return;
    const rect = this._gestureRect;
    this.ballX =
      50 +
      clamp(((event.clientX - this._startPoint.x) / rect.width) * 12, -6, 6);
    this.ballY =
      82 +
      clamp(((event.clientY - this._startPoint.y) / rect.height) * 12, -6, 6);
    this.ballSpin = clamp(
      ((event.clientX - this._startPoint.x) / rect.width) * 120,
      -35,
      35
    );
  }

  handlePointerUp(event) {
    if (!this.isAiming || event.pointerId !== this._pointerId) return;
    this.recordPointer(event);
    const velocity = releaseVelocity(
      this._samples,
      this._gestureRect.width,
      this._gestureRect.height
    );
    this.finishPointerTracking();
    if (!velocity) {
      this.resetBall();
      return;
    }
    this.launchFlick(velocity);
  }

  handlePointerCancel() {
    if (!this.isAiming) return;
    this.finishPointerTracking();
    this.resetBall();
  }

  finishPointerTracking() {
    const pointerId = this._pointerId;
    this.isAiming = false;
    this._pointerId = null;
    this._samples = [];
    window.removeEventListener(
      "pointermove",
      this.handleWindowPointerMove,
      true
    );
    window.removeEventListener("pointerup", this.handleWindowPointerUp, true);
    window.removeEventListener(
      "pointercancel",
      this.handleWindowPointerCancel,
      true
    );
    window.removeEventListener("blur", this.handleWindowBlur);
    try {
      this._capturedBall?.releasePointerCapture?.(pointerId);
    } catch {
      /* Capture may have been released by the browser already. */
    }
    this._capturedBall = null;
  }

  preventBallDrag(event) {
    event.preventDefault();
  }

  launchFlick(velocity) {
    if (this.cannotShoot) return;
    this.notice = "";
    const flight = flightFromFlick(velocity, this.ballX, this.ballY);
    this.shotPower = flight.power;
    this.attempts++;
    this._activeId = `${this.activeFile.id}-attempt-${this.attempts}`;
    this._flight = {
      ...flight,
      fromX: this.ballX,
      fromY: this.ballY,
      started: Date.now()
    };
    this.state = "shooting";
    this._audio?.kick(flight.power);
  }

  resolveShot(flight) {
    const inGoal =
      flight.x >= 23 && flight.x <= 77 && flight.y >= 35 && flight.y <= 61;
    const saved = Math.abs(flight.x - this.keeperX) < 8.5;
    const goal = inGoal && !saved;
    this.dispatchEvent(
      new CustomEvent("shot", {
        detail: {
          outcome: goal ? "goal" : "saved",
          power: flight.power,
          speed: flight.speed,
          duration: flight.duration,
          targetX: flight.x,
          targetY: flight.y
        }
      })
    );
    if (goal) {
      this.goals++;
      this.keeperUpset = true;
      this._audio?.net(flight.power);
      this.startUpload();
      return;
    }
    this.state = "saved";
    this._audio?.catchBall();
    this._catchX = clamp(flight.x, 27, 73);
    this.keeperX = this._catchX;
    this.ballX = this.keeperX;
    this.ballY = 52;
    this.ballScale = 0.43;
    this.notice = inGoal
      ? "Saved! The keeper gathers the ball and sends it back."
      : flight.y > 61
        ? "A little too soft! Give it a quicker flick to reach the net."
        : "Just wide! The keeper collects your ball and throws it back.";
    this.playReaction(false);
    this.later(() => this.beginReturn(), 850);
  }

  beginReturn() {
    this.state = "returning";
    this._returnFlight = { x: this.keeperX, started: Date.now() };
    this.ballX = this.keeperX;
    this.ballY = 52;
  }

  startUpload() {
    this.state = "uploading";
    this.progress = 0;
    this.playReaction(true);
    const handled = !this.dispatchEvent(
      new CustomEvent("uploadrequest", {
        detail: {
          id: this._activeId,
          file: this.activeFile.file,
          recordId: this.recordId
        },
        cancelable: true
      })
    );
    if (!handled)
      this.failUpload(
        this._activeId,
        "The upload connection is not configured yet. Review this component in the local preview."
      );
  }

  @api reportUploadProgress(id, percent) {
    if (id !== this._activeId || !this.isUploading || !Number.isFinite(percent))
      return;
    this.progress = clamp(Math.floor(percent), this.progress, 99);
  }
  @api completeUpload(id, result = {}) {
    if (id !== this._activeId || !this.isUploading) return;
    const file = this.activeFile;
    this.progress = 100;
    this.state = "success";
    this.completed = [
      {
        id,
        name: file.name,
        documentId: result.documentId,
        url:
          !this.previewMode &&
          /^069[a-zA-Z0-9]{12,15}$/.test(result.documentId || "")
            ? `/lightning/r/ContentDocument/${result.documentId}/view`
            : null,
        label: this.previewMode ? "Simulated" : "Attached",
        style: `--ball-color:${file.color}`
      },
      ...this.completed
    ];
    this.lastResult = `${file.name} ${this.previewMode ? "finished its simulated upload" : "was attached to the record"}.`;
    this.notice = this.lastResult;
    this._audio?.complete();
    this.later(() => {
      this.queue = this.queue.filter((item) => item.id !== file.id);
      this._activeId = null;
      this.resetBall();
      this.state = "idle";
    }, 1400);
  }
  @api failUpload(id, message) {
    if (id !== this._activeId || !this.isUploading) return;
    this.stopCrowdSound();
    this.state = "error";
    this.notice = message || "Upload failed. Your file is still in the queue.";
    this.later(() => this.beginReturn(), 1500);
  }

  toggleMotion() {
    this.reducedMotion = !this.reducedMotion;
  }
  async toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled) {
      this._audio?.mute();
      return;
    }
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Audio unavailable");
      this._audio = this._audio || new MatchdayAudio(new AudioContextClass());
      await this._audio.enable();
      if (!this.isConnected || !this.soundEnabled) {
        this._audio?.mute();
        return;
      }
      if (this.isUploading) this.playReaction(true);
    } catch {
      this.soundEnabled = false;
      this.notice =
        "Match sounds are unavailable in this browser. Visual reactions are still on.";
    }
  }
  playReaction(goal) {
    if (goal) this._audio?.cheer();
    else this._audio?.disappoint();
  }
  stopCrowdSound() {
    this._audio?.stopCheer();
  }
}
