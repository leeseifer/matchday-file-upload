import { createElement } from "lwc";
import PenaltyFileUpload from "c/penaltyFileUpload";

const component = createElement("c-penalty-file-upload", {
  is: PenaltyFileUpload
});
component.previewMode = true;
component.recordId = "local-account-preview";
document.querySelector("#app").appendChild(component);

let demoOutcome = "success";
let uploadTimer;
const status = document.querySelector("#demo-status");
const demoButtons = document.querySelectorAll("[data-outcome]");
demoButtons.forEach((button) =>
  button.addEventListener("click", () => {
    demoOutcome = button.dataset.outcome;
    demoButtons.forEach((item) =>
      item.setAttribute("aria-pressed", String(item === button))
    );
    status.textContent =
      demoOutcome === "fail"
        ? "Next goal: a failed upload. The file will stay in your queue."
        : demoOutcome === "slow"
          ? "Next goal: a 12-second upload. Watch the crowd keep cheering."
          : "Next goal: a successful upload in about 4 seconds.";
  })
);

component.addEventListener("uploadrequest", (event) => {
  event.preventDefault();
  const { id } = event.detail;
  const outcome = demoOutcome;
  const duration = outcome === "slow" ? 12000 : 4000;
  const start = performance.now();
  clearInterval(uploadTimer);
  uploadTimer = setInterval(() => {
    const progress = Math.min(
      100,
      ((performance.now() - start) / duration) * 100
    );
    component.reportUploadProgress(id, progress);
    if (progress >= 100) {
      clearInterval(uploadTimer);
      if (outcome === "fail") {
        component.failUpload(
          id,
          "Preview: upload failed. Your document is still queued. Select “Normal upload” and shoot again."
        );
      } else {
        component.completeUpload(id, { documentId: `local-${id}` });
      }
    }
  }, 120);
});

document.querySelector("#samples").addEventListener("click", () => {
  component.addFiles([
    new File(["Matchday local PDF sample"], "Project brief.pdf", {
      type: "application/pdf",
      lastModified: 1
    }),
    new File(["Name,Amount\nDesign,2400"], "Budget.csv", {
      type: "text/csv",
      lastModified: 1
    }),
    new File(["Matchday local document sample"], "Meeting notes.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      lastModified: 1
    }),
    new File(["Matchday local image sample"], "Team photo.png", {
      type: "image/png",
      lastModified: 1
    })
  ]);
});

document.querySelector("#record-type").addEventListener("change", (event) => {
  const records = {
    account: ["Acme Industries", "AC", "Account"],
    case: ["New customer onboarding", "CA", "Case"],
    policy: ["Commercial cover · 2026", "PO", "Policy"]
  };
  const [name, initials, type] = records[event.target.value];
  document.querySelector("#record-name").textContent = name;
  document.querySelector("#record-icon").textContent = initials;
  document.querySelector("#record-label").textContent = type;
  component.recordId = `local-${event.target.value}-preview`;
});

document.querySelector("#compact").addEventListener("click", (event) => {
  const compact = document.querySelector("main").classList.toggle("compact");
  event.currentTarget.setAttribute("aria-pressed", String(compact));
  event.currentTarget.textContent = compact ? "↔ Full width" : "▥ Compact view";
});

window.addEventListener("beforeunload", () => clearInterval(uploadTimer));
