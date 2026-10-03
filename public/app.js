// public/app.js
// Client-side interactions for JobPrep AI workflow.

document.addEventListener("DOMContentLoaded", () => {
  const uploadForm = document.getElementById("upload-form");
  const fileInput = document.getElementById("jd-file");
  const textInput = document.getElementById("jd-text");
  const btnSubmitJd = document.getElementById("btn-submit-jd");

  const sectionStatus = document.getElementById("section-status");
  const statusText = document.getElementById("status-text");
  const statusMeta = document.getElementById("status-meta");
  const currentJobIdEl = document.getElementById("current-job-id");
  const statusSpinner = document.getElementById("status-spinner");
  const failureContainer = document.getElementById("failure-container");
  const failureMessage = document.getElementById("failure-message");
  const btnRetry = document.getElementById("btn-retry");

  const sectionRequirements = document.getElementById("section-requirements");
  const requirementsContent = document.getElementById("requirements-content");
  const btnPrepareInterview = document.getElementById("btn-prepare-interview");

  const sectionQuestions = document.getElementById("section-questions");
  const questionsContent = document.getElementById("questions-content");

  let currentAnalysisJobId = null;
  let pollInterval = null;

  function setStep(stepNum) {
    for (let i = 1; i <= 5; i++) {
      const node = document.getElementById(`step-node-${i}`);
      if (node) {
        if (i <= stepNum) {
          node.classList.add("active");
        } else {
          node.classList.remove("active");
        }
      }
    }
  }

  // Handle JD submission
  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    const text = textInput.value.trim();

    if (!file && !text) {
      alert("Please upload a file or paste job description text.");
      return;
    }

    btnSubmitJd.disabled = true;
    sectionStatus.classList.remove("hidden");
    failureContainer.classList.add("hidden");
    statusSpinner.classList.remove("hidden");
    statusText.textContent = "Submitting job description...";
    setStep(2);

    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        res = await fetch("/api/jobs/analyze", {
          method: "POST",
          body: formData,
        });
      } else {
        res = await fetch("/api/jobs/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to create analysis job.");
      }

      currentAnalysisJobId = data.jobId;
      currentJobIdEl.textContent = currentAnalysisJobId;
      startPolling(currentAnalysisJobId, "ANALYZE");
    } catch (err) {
      showFailure(err.message, false);
      btnSubmitJd.disabled = false;
    }
  });

  // Polling helper
  function startPolling(jobId, expectedType) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();

        if (!res.ok) {
          throw new Error(job.message || "Error checking job status.");
        }

        statusText.textContent = `Status: ${job.status}`;
        statusMeta.innerHTML = `Job ID: <code>${job.id}</code> (Attempts: ${job.attempts || 0})`;

        if (job.status === "DONE") {
          clearInterval(pollInterval);
          statusSpinner.classList.add("hidden");

          if (expectedType === "ANALYZE") {
            displayRequirements(job.result);
          } else if (expectedType === "PREPARE") {
            displayQuestions(job.result);
          }
        } else if (job.status === "FAILED") {
          clearInterval(pollInterval);
          statusSpinner.classList.add("hidden");
          const msg = job.failure?.text || "Job processing failed.";
          showFailure(msg, job.failure?.canRetry ?? true, jobId);
        }
      } catch (err) {
        clearInterval(pollInterval);
        showFailure(err.message, true, jobId);
      }
    }, 2000);
  }

  function displayRequirements(result) {
    setStep(3);
    sectionRequirements.classList.remove("hidden");
    requirementsContent.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <h3 style="color: var(--color-primary);">${result.jobTitle}</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">
          ${result.company || "Company not specified"} &bull; ${result.employmentType || "unknown"} &bull; ${result.location || "Remote/Unspecified"}
        </p>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
        <div>
          <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem;">Required Skills:</h4>
          <ul style="padding-left: 1.2rem; font-size: 0.85rem; color: var(--text-muted);">
            ${(result.requiredSkills || []).map(s => `<li>${s}</li>`).join("")}
          </ul>
        </div>
        <div>
          <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem;">Key Responsibilities:</h4>
          <ul style="padding-left: 1.2rem; font-size: 0.85rem; color: var(--text-muted);">
            ${(result.responsibilities || []).map(r => `<li>${r}</li>`).join("")}
          </ul>
        </div>
      </div>
    `;
  }

  // Handle prepare interview click
  btnPrepareInterview.addEventListener("click", async () => {
    if (!currentAnalysisJobId) return;

    btnPrepareInterview.disabled = true;
    sectionStatus.classList.remove("hidden");
    failureContainer.classList.add("hidden");
    statusSpinner.classList.remove("hidden");
    statusText.textContent = "Starting interview preparation...";
    setStep(4);

    try {
      const res = await fetch("/api/jobs/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentJobId: currentAnalysisJobId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to trigger interview prep.");
      }

      currentJobIdEl.textContent = data.jobId;
      startPolling(data.jobId, "PREPARE");
    } catch (err) {
      showFailure(err.message, false);
      btnPrepareInterview.disabled = false;
    }
  });

  function displayQuestions(result) {
    setStep(5);
    sectionQuestions.classList.remove("hidden");
    const questions = result.questions || [];
    questionsContent.innerHTML = questions.map((q, idx) => `
      <div style="background: var(--bg-input); padding: 1rem; border-radius: var(--radius); margin-bottom: 1rem; border: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span class="badge badge-accent">${q.category.toUpperCase()}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Requirement: ${q.relatedRequirement}</span>
        </div>
        <p style="font-weight: 600; margin-bottom: 0.5rem;">${idx + 1}. ${q.question}</p>
        <details style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-muted);">
          <summary style="cursor: pointer; color: var(--color-primary);">Interviewer Guide & Sample Answer</summary>
          <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
            <p><strong>What they're looking for:</strong> ${q.interviewerLookingFor}</p>
            <p style="margin-top: 0.5rem;"><strong>Sample Answer:</strong> ${q.sampleAnswer}</p>
          </div>
        </details>
      </div>
    `).join("");
  }

  function showFailure(message, canRetry = false, jobId = null) {
    failureContainer.classList.remove("hidden");
    failureMessage.textContent = message;

    if (canRetry && jobId) {
      btnRetry.classList.remove("hidden");
      btnRetry.onclick = async () => {
        btnRetry.disabled = true;
        try {
          const res = await fetch(`/api/jobs/${jobId}/retry`, { method: "POST" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Retry failed.");
          failureContainer.classList.add("hidden");
          statusSpinner.classList.remove("hidden");
          startPolling(data.jobId, "ANALYZE");
        } catch (e) {
          failureMessage.textContent = e.message;
          btnRetry.disabled = false;
        }
      };
    } else {
      btnRetry.classList.add("hidden");
    }
  }
});
