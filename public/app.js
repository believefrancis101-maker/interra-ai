// public/app.js
// Client-side interactions and API orchestration for Interra AI.

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------------------------------------------
  // Application State
  // -------------------------------------------------------------
  const state = {
    activeView: "landing",
    currentAnalysisJobId: null,
    currentPrepareJobId: null,
    pollInterval: null,
    currentJobData: null,
    analysisResult: null,
    prepResult: null,
    allQuestions: [],
    filteredQuestions: [],
    currentQuestionIndex: 0,
    selectedCategory: "all",
    failedJobId: null,
    selectedFile: null,
  };

  // -------------------------------------------------------------
  // DOM Elements
  // -------------------------------------------------------------
  // Navigation & Shell
  const sidebar = document.getElementById("app-sidebar");
  const navBrand = document.getElementById("nav-brand");
  const navHome = document.getElementById("nav-item-home");
  const navHistory = document.getElementById("nav-item-history");
  const navSettings = document.getElementById("nav-item-settings");
  const historyCountEl = document.getElementById("history-count");
  const btnMobileMenu = document.getElementById("btn-mobile-menu");

  // View Screens
  const screens = {
    landing: document.getElementById("screen-landing"),
    processing: document.getElementById("screen-processing"),
    analysis: document.getElementById("screen-analysis"),
    questions: document.getElementById("screen-questions"),
    failure: document.getElementById("screen-failure"),
    history: document.getElementById("screen-history"),
    settings: document.getElementById("screen-settings"),
  };

  // Landing / Upload Form
  const formAnalyze = document.getElementById("form-analyze");
  const dropzone = document.getElementById("dropzone");
  const inputJdFile = document.getElementById("input-jd-file");
  const inputJdText = document.getElementById("input-jd-text");
  const charCountEl = document.getElementById("char-count");
  const selectedFileBadge = document.getElementById("selected-file-badge");
  const selectedFileName = document.getElementById("selected-file-name");
  const btnClearFile = document.getElementById("btn-clear-file");
  const btnChooseFile = document.getElementById("btn-choose-file");
  const btnSubmitAnalyze = document.getElementById("btn-submit-analyze");
  const actionSubmitRow = document.getElementById("action-submit-row");
  const btnTogglePaste = document.getElementById("btn-toggle-paste");
  const panelTextPaste = document.getElementById("panel-text-paste");
  const btnSubmitPaste = document.getElementById("btn-submit-paste");

  // Processing Screen Elements
  const processingTitle = document.getElementById("processing-title");
  const processingSubtitle = document.getElementById("processing-subtitle");
  const activeJobIdEl = document.getElementById("active-job-id");
  const activeJobAttemptsEl = document.getElementById("active-job-attempts");
  const processingProgressBar = document.getElementById("processing-progress-bar");
  const processingStatusLabel = document.getElementById("processing-status-label");
  const checkStep1 = document.getElementById("check-step-1");
  const checkStep2 = document.getElementById("check-step-2");
  const checkStep3 = document.getElementById("check-step-3");
  const checkStep4 = document.getElementById("check-step-4");
  const checkStep1Text = document.getElementById("check-step-1-text");
  const checkStep2Text = document.getElementById("check-step-2-text");
  const checkStep3Text = document.getElementById("check-step-3-text");
  const checkStep4Text = document.getElementById("check-step-4-text");

  // Analysis Result Screen Elements
  const btnBackToHome = document.getElementById("btn-back-to-home");
  const roleTitleEl = document.getElementById("role-title");
  const roleCompanyEl = document.getElementById("role-company");
  const badgeEmployment = document.getElementById("badge-employment");
  const badgeLocation = document.getElementById("badge-location");
  const requiredSkillsTags = document.getElementById("required-skills-tags");
  const preferredSkillsTags = document.getElementById("preferred-skills-tags");
  const preferredSkillsGroup = document.getElementById("preferred-skills-group");
  const responsibilitiesList = document.getElementById("responsibilities-list");
  const experienceQualificationsList = document.getElementById("experience-qualifications-list");
  const btnTriggerPrepare = document.getElementById("btn-trigger-prepare");

  // Questions Screen Elements
  const btnBackToAnalysis = document.getElementById("btn-back-to-analysis");
  const badgePrepRole = document.getElementById("badge-prep-role");
  const questionCardContainer = document.getElementById("question-card-container");
  const btnPrevQuestion = document.getElementById("btn-prev-question");
  const btnNextQuestion = document.getElementById("btn-next-question");
  const questionNavCounter = document.getElementById("question-nav-counter");
  const questionDots = document.getElementById("question-dots");
  const btnStartAgain = document.getElementById("btn-start-again");
  const categoryPills = document.querySelectorAll(".cat-pill");

  // Failure Screen Elements
  const failureTitle = document.getElementById("failure-title");
  const failureSubtitle = document.getElementById("failure-subtitle");
  const btnFailureRetry = document.getElementById("btn-failure-retry");
  const btnFailureUploadAnother = document.getElementById("btn-failure-upload-another");

  // Extra Views (History & Settings)
  const historyList = document.getElementById("history-list");
  const settingAnalystModel = document.getElementById("setting-analyst-model");
  const settingPrepModel = document.getElementById("setting-prep-model");
  const toastContainer = document.getElementById("toast-container");

  // -------------------------------------------------------------
  // Router / Screen Switching
  // -------------------------------------------------------------
  function switchView(viewName) {
    state.activeView = viewName;

    // Toggle active screen visibility
    Object.keys(screens).forEach((key) => {
      if (screens[key]) {
        if (key === viewName) {
          screens[key].classList.remove("hidden");
          screens[key].classList.add("active");
        } else {
          screens[key].classList.add("hidden");
          screens[key].classList.remove("active");
        }
      }
    });

    // Update sidebar navigation active state
    [navHome, navHistory, navSettings].forEach((btn) => {
      if (btn) btn.classList.remove("active");
    });
    if (viewName === "landing") navHome?.classList.add("active");
    if (viewName === "history") navHistory?.classList.add("active");
    if (viewName === "settings") navSettings?.classList.add("active");

    // Close mobile menu if open
    sidebar?.classList.remove("mobile-open");

    // Scroll to top of main content
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // -------------------------------------------------------------
  // Toast Notifications
  // -------------------------------------------------------------
  function showToast(message, type = "info") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // -------------------------------------------------------------
  // File Upload & Input Actions
  // -------------------------------------------------------------
  // Choose file button
  btnChooseFile?.addEventListener("click", (e) => {
    e.stopPropagation();
    inputJdFile?.click();
  });

  // Toggle paste text area
  btnTogglePaste?.addEventListener("click", () => {
    const isHidden = panelTextPaste?.classList.toggle("hidden");
    if (btnTogglePaste) {
      btnTogglePaste.textContent = isHidden
        ? "or paste job description text"
        : "hide paste text area";
    }
    if (!isHidden) {
      inputJdText?.focus();
    }
  });

  // Character counter for textarea
  inputJdText?.addEventListener("input", () => {
    if (charCountEl) {
      charCountEl.textContent = inputJdText.value.length;
    }
  });

  // Dropzone click trigger
  dropzone?.addEventListener("click", (e) => {
    if (e.target.closest("#btn-clear-file") || e.target.closest("#btn-choose-file")) return;
    inputJdFile?.click();
  });

  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputJdFile?.click();
    }
  });

  function handleFileSelected(file) {
    if (!file) return;

    // Check size limit: 5MB
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      showToast("File size exceeds 5MB limit. Please upload a smaller file.", "error");
      return;
    }

    state.selectedFile = file;
    if (selectedFileName) selectedFileName.textContent = file.name;
    selectedFileBadge?.classList.remove("hidden");
    actionSubmitRow?.classList.remove("hidden");
  }

  inputJdFile?.addEventListener("change", () => {
    if (inputJdFile.files && inputJdFile.files[0]) {
      handleFileSelected(inputJdFile.files[0]);
    }
  });

  btnClearFile?.addEventListener("click", (e) => {
    e.stopPropagation();
    state.selectedFile = null;
    if (inputJdFile) inputJdFile.value = "";
    selectedFileBadge?.classList.add("hidden");
    actionSubmitRow?.classList.add("hidden");
  });

  // Drag and drop events
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone?.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone?.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("drag-over");
    });
  });

  dropzone?.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // -------------------------------------------------------------
  // Form Submission: Analyze Job Description
  // -------------------------------------------------------------
  formAnalyze?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const file = state.selectedFile;
    const text = inputJdText ? inputJdText.value.trim() : "";

    if (!file && text.length < 20) {
      if (text.length > 0) {
        showToast("Please enter at least 20 characters of the job description.", "error");
        inputJdText?.focus();
      } else {
        showToast("Please select a job description file to upload.", "error");
        dropzone?.focus();
      }
      return;
    }

    // Set UI loading state
    if (btnSubmitAnalyze) btnSubmitAnalyze.disabled = true;
    if (btnSubmitPaste) btnSubmitPaste.disabled = true;
    const btnTextSpan = btnSubmitAnalyze?.querySelector(".btn-text");
    if (btnTextSpan) btnTextSpan.textContent = "Analyzing...";

    // Configure processing screen for ANALYZE
    setupProcessingScreen("ANALYZE");
    switchView("processing");

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

      state.currentAnalysisJobId = data.jobId;
      startPolling(data.jobId, "ANALYZE");
    } catch (err) {
      handleJobError({
        errorCode: "PROVIDER_ERROR",
        failure: { text: err.message || "Failed to submit job description. Please try again.", canRetry: true },
      }, state.currentAnalysisJobId);
    } finally {
      if (btnSubmitAnalyze) btnSubmitAnalyze.disabled = false;
      if (btnSubmitPaste) btnSubmitPaste.disabled = false;
      if (btnTextSpan) btnTextSpan.textContent = "Analyze Job Description";
    }
  });

  // -------------------------------------------------------------
  // Processing Screen Setup
  // -------------------------------------------------------------
  function setupProcessingScreen(type) {
    if (type === "ANALYZE") {
      processingTitle.textContent = "Analyzing Job Description";
      processingSubtitle.textContent =
        "Our AI is extracting the key requirements, skills and responsibilities from your job description. This may take a few moments.";
      checkStep1Text.textContent = "File uploaded";
      checkStep2Text.textContent = "Extracting job requirements";
      checkStep3Text.textContent = "Analyzing requirements";
      checkStep4Text.textContent = "Preparing your interview plan";
    } else {
      processingTitle.textContent = "Preparing Your Mock Interview";
      processingSubtitle.textContent =
        "We're creating targeted mock interview questions based strictly on the validated requirements from this role.";
      checkStep1Text.textContent = "Job requirements validated";
      checkStep2Text.textContent = "Identifying key focus areas";
      checkStep3Text.textContent = "Generating mock interview questions";
      checkStep4Text.textContent = "Preparing sample answers";
    }

    // Reset checklist state
    checkStep1.className = "step-row completed";
    checkStep2.className = "step-row completed";
    checkStep3.className = "step-row active";
    checkStep4.className = "step-row pending";
  }

  // -------------------------------------------------------------
  // Polling Job Status
  // -------------------------------------------------------------
  function startPolling(jobId, expectedType) {
    if (state.pollInterval) clearInterval(state.pollInterval);

    if (activeJobIdEl) activeJobIdEl.textContent = jobId;
    if (activeJobAttemptsEl) activeJobAttemptsEl.textContent = "Attempts: 1";

    state.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();

        if (!res.ok) {
          throw new Error(job.message || "Failed to retrieve job status.");
        }

        state.currentJobData = job;

        if (activeJobAttemptsEl) {
          activeJobAttemptsEl.textContent = `Attempts: ${job.attempts || 1}`;
        }

        if (job.status === "DONE") {
          clearInterval(state.pollInterval);
          state.pollInterval = null;

          if (expectedType === "ANALYZE") {
            state.analysisResult = job.result;
            savePreparationToHistory(job);
            renderAnalysisResults(job.result);
            switchView("analysis");
          } else if (expectedType === "PREPARE") {
            state.prepResult = job.result;
            savePreparationToHistory(job);
            renderQuestions(job.result);
            switchView("questions");
          }
        } else if (job.status === "FAILED") {
          clearInterval(state.pollInterval);
          state.pollInterval = null;
          handleJobError(job, jobId);
        }
      } catch (err) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
        handleJobError({
          errorCode: "TIMEOUT",
          failure: { text: err.message || "Communication with the server timed out. Please try again.", canRetry: true },
        }, jobId);
      }
    }, 2000);
  }

  // -------------------------------------------------------------
  // Error / Failure State Handler
  // -------------------------------------------------------------
  function handleJobError(job, jobId) {
    state.failedJobId = jobId;

    // Use failureCopy from backend, never expose raw errors
    const failureInfo = job.failure || {
      text: "We couldn't analyze this file. Try again, or upload a clearer version.",
      canRetry: true,
    };

    if (job.errorCode === "NOT_A_JOB_DESCRIPTION") {
      failureTitle.textContent = "This doesn't look like a job description";
    } else if (job.errorCode === "RATE_LIMITED") {
      failureTitle.textContent = "Service is temporarily busy";
    } else if (job.errorCode === "TIMEOUT") {
      failureTitle.textContent = "Request timed out";
    } else {
      failureTitle.textContent = "We couldn't analyze this file";
    }

    failureSubtitle.textContent = failureInfo.text;

    // Manage retry button visibility
    if (failureInfo.canRetry && jobId) {
      btnFailureRetry.classList.remove("hidden");
      btnFailureRetry.disabled = false;
    } else {
      btnFailureRetry.classList.add("hidden");
    }

    switchView("failure");
  }

  // Retry Action: Calls POST /api/jobs/:id/retry
  btnFailureRetry?.addEventListener("click", async () => {
    if (!state.failedJobId) return;

    btnFailureRetry.disabled = true;
    const originalText = btnFailureRetry.querySelector("span")?.textContent || "Try Again";
    const span = btnFailureRetry.querySelector("span");
    if (span) span.textContent = "Retrying...";

    try {
      const res = await fetch(`/api/jobs/${state.failedJobId}/retry`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to retry job.");
      }

      setupProcessingScreen(data.type);
      switchView("processing");
      startPolling(data.jobId, data.type);
    } catch (err) {
      showToast(err.message || "Retry failed. Please upload another file.", "error");
      btnFailureRetry.disabled = false;
      if (span) span.textContent = originalText;
    }
  });

  btnFailureUploadAnother?.addEventListener("click", () => {
    // Reset file form
    state.selectedFile = null;
    if (inputJdFile) inputJdFile.value = "";
    if (inputJdText) inputJdText.value = "";
    selectedFileBadge?.classList.add("hidden");
    switchView("landing");
  });

  // -------------------------------------------------------------
  // Screen 3: Render Analysis Results
  // -------------------------------------------------------------
  function renderAnalysisResults(r) {
    if (!r) return;

    roleTitleEl.textContent = r.jobTitle || "Job Title Not Specified";
    roleCompanyEl.textContent = r.company ? r.company : "Company not specified";

    const formatEmpType = (t) => {
      if (!t) return "Employment Type Unspecified";
      return t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
    };

    badgeEmployment.textContent = formatEmpType(r.employmentType);
    badgeLocation.textContent = r.location || "Location not specified";

    // Required Skills
    requiredSkillsTags.innerHTML = "";
    if (r.requiredSkills && r.requiredSkills.length > 0) {
      r.requiredSkills.forEach((skill) => {
        const tag = document.createElement("span");
        tag.className = "skill-tag";
        tag.textContent = skill;
        requiredSkillsTags.appendChild(tag);
      });
    } else {
      requiredSkillsTags.innerHTML = "<span class='text-muted'>None explicitly listed</span>";
    }

    // Preferred Skills
    preferredSkillsTags.innerHTML = "";
    if (r.preferredSkills && r.preferredSkills.length > 0) {
      preferredSkillsGroup.style.display = "block";
      r.preferredSkills.forEach((skill) => {
        const tag = document.createElement("span");
        tag.className = "skill-tag preferred";
        tag.textContent = skill;
        preferredSkillsTags.appendChild(tag);
      });
    } else {
      preferredSkillsGroup.style.display = "none";
    }

    // Responsibilities
    responsibilitiesList.innerHTML = "";
    if (r.responsibilities && r.responsibilities.length > 0) {
      r.responsibilities.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        responsibilitiesList.appendChild(li);
      });
    } else {
      responsibilitiesList.innerHTML = "<li>No specific responsibilities parsed.</li>";
    }

    // Experience & Qualifications
    experienceQualificationsList.innerHTML = "";
    let hasExpOrQual = false;

    if (r.requiredExperience && r.requiredExperience.length > 0) {
      r.requiredExperience.forEach((exp) => {
        hasExpOrQual = true;
        const li = document.createElement("li");
        const yrs = exp.minYears ? ` (${exp.minYears}+ years)` : "";
        li.textContent = `${exp.description}${yrs}`;
        experienceQualificationsList.appendChild(li);
      });
    }

    if (r.qualifications && r.qualifications.length > 0) {
      r.qualifications.forEach((qual) => {
        hasExpOrQual = true;
        const li = document.createElement("li");
        li.textContent = qual;
        experienceQualificationsList.appendChild(li);
      });
    }

    if (!hasExpOrQual) {
      experienceQualificationsList.innerHTML = "<li>General industry qualifications expected.</li>";
    }
  }

  // Mock Interview Trigger
  btnTriggerPrepare?.addEventListener("click", async () => {
    if (!state.currentAnalysisJobId) {
      showToast("Missing active analysis job.", "error");
      return;
    }

    btnTriggerPrepare.disabled = true;
    const btnSpan = btnTriggerPrepare.querySelector("span");
    if (btnSpan) btnSpan.textContent = "Preparing...";

    setupProcessingScreen("PREPARE");
    switchView("processing");

    try {
      const res = await fetch("/api/jobs/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentJobId: state.currentAnalysisJobId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to trigger mock interview preparation.");
      }

      state.currentPrepareJobId = data.jobId;
      startPolling(data.jobId, "PREPARE");
    } catch (err) {
      handleJobError({
        errorCode: "PROVIDER_ERROR",
        failure: { text: err.message || "Failed to prepare mock interview questions.", canRetry: true },
      }, state.currentAnalysisJobId);
    } finally {
      btnTriggerPrepare.disabled = false;
      if (btnSpan) btnSpan.textContent = "Generate Mock Interview";
    }
  });

  // -------------------------------------------------------------
  // Screen 4 & 5: Render Mock Interview Questions & Navigation
  // -------------------------------------------------------------
  function renderQuestions(prepData) {
    if (!prepData || !prepData.questions) return;

    state.allQuestions = prepData.questions;
    state.selectedCategory = "all";
    filterQuestions();

    if (badgePrepRole && state.analysisResult) {
      badgePrepRole.textContent = state.analysisResult.jobTitle || "Role Specific";
    }
  }

  function filterQuestions() {
    if (state.selectedCategory === "all") {
      state.filteredQuestions = [...state.allQuestions];
    } else {
      state.filteredQuestions = state.allQuestions.filter(
        (q) => q.category === state.selectedCategory
      );
    }

    state.currentQuestionIndex = 0;
    renderCurrentQuestion();
  }

  categoryPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      categoryPills.forEach((p) => {
        p.classList.remove("active");
        p.setAttribute("aria-selected", "false");
      });
      pill.classList.add("active");
      pill.setAttribute("aria-selected", "true");
      state.selectedCategory = pill.dataset.cat || "all";
      filterQuestions();
    });
  });

  function renderCurrentQuestion() {
    const list = state.filteredQuestions;
    const total = list.length;

    if (total === 0) {
      questionCardContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          No questions in this category.
        </div>
      `;
      btnPrevQuestion.disabled = true;
      btnNextQuestion.disabled = true;
      questionNavCounter.textContent = "0 of 0";
      questionDots.innerHTML = "";
      return;
    }

    const q = list[state.currentQuestionIndex];
    const displayNum = String(state.currentQuestionIndex + 1).padStart(2, "0");
    const categoryLabel = q.category.replace("_", " ");

    questionCardContainer.innerHTML = `
      <div class="question-card-top-row">
        <div>
          <span class="question-index-badge">${displayNum}</span>
          <span class="question-category-label">${categoryLabel} Question</span>
        </div>
        <span class="badge badge-accent">${q.relatedRequirement}</span>
      </div>

      <h3 class="question-text-heading">${escapeHtml(q.question)}</h3>

      <!-- Sample Answer Section -->
      <div class="sample-answer-box" id="sample-answer-box">
        <div class="sample-answer-header" id="sample-answer-toggle" tabindex="0" role="button" aria-expanded="true">
          <div class="sample-answer-title-group">
            <svg class="sample-answer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
            <span class="sample-answer-label">Sample Answer</span>
          </div>
          <svg class="sample-answer-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <p class="sample-answer-guide-tip">Use this as a guide. Adapt it to your own experience.</p>
        <div class="sample-answer-content" id="sample-answer-content">
          ${escapeHtml(q.sampleAnswer)}
        </div>
        ${q.sampleAnswer.length > 250 ? `
          <button type="button" class="btn-show-more" id="btn-toggle-answer-length">Show more</button>
        ` : ""}
      </div>

      <!-- What Interviewer is Looking For -->
      <div class="looking-for-box">
        <div class="looking-for-header">
          <svg class="looking-for-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <h4 class="looking-for-title">What the Interviewer is Looking For</h4>
        </div>
        <div class="looking-for-content">
          ${formatLookingForBullets(q.interviewerLookingFor)}
        </div>
      </div>

      <!-- Related Requirement Footer -->
      <div class="related-requirement-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <span>Derived from requirement:</span>
        <span class="related-requirement-pill">${escapeHtml(q.relatedRequirement)}</span>
      </div>
    `;

    // Collapsible sample answer toggle
    const toggle = document.getElementById("sample-answer-toggle");
    const box = document.getElementById("sample-answer-box");
    toggle?.addEventListener("click", () => {
      box?.classList.toggle("collapsed");
      const isExpanded = !box?.classList.contains("collapsed");
      toggle.setAttribute("aria-expanded", String(isExpanded));
    });

    toggle?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle.click();
      }
    });

    // Toggle answer length (Show more / Show less)
    const btnToggleLength = document.getElementById("btn-toggle-answer-length");
    const answerContent = document.getElementById("sample-answer-content");
    if (btnToggleLength && answerContent) {
      answerContent.classList.add("truncated");
      btnToggleLength.addEventListener("click", () => {
        const isTruncated = answerContent.classList.toggle("truncated");
        btnToggleLength.textContent = isTruncated ? "Show more" : "Show less";
      });
    }

    // Update navigation counters & state
    btnPrevQuestion.disabled = state.currentQuestionIndex === 0;
    btnNextQuestion.disabled = state.currentQuestionIndex >= total - 1;
    questionNavCounter.textContent = `Question ${state.currentQuestionIndex + 1} of ${total}`;

    // Render dot indicators
    questionDots.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const dot = document.createElement("span");
      dot.className = `q-dot ${i === state.currentQuestionIndex ? "active" : ""}`;
      questionDots.appendChild(dot);
    }
  }

  btnPrevQuestion?.addEventListener("click", () => {
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex--;
      renderCurrentQuestion();
    }
  });

  btnNextQuestion?.addEventListener("click", () => {
    if (state.currentQuestionIndex < state.filteredQuestions.length - 1) {
      state.currentQuestionIndex++;
      renderCurrentQuestion();
    }
  });

  btnBackToHome?.addEventListener("click", () => switchView("landing"));
  btnBackToAnalysis?.addEventListener("click", () => switchView("analysis"));
  btnStartAgain?.addEventListener("click", () => switchView("landing"));

  // -------------------------------------------------------------
  // History ("My Interviews") View
  // -------------------------------------------------------------
  function getStoredHistory() {
    try {
      const raw = localStorage.getItem("interra_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function savePreparationToHistory(job) {
    if (!job || !job.id) return;
    try {
      const history = getStoredHistory();
      const existingIdx = history.findIndex((h) => h.id === job.id);
      const item = {
        id: job.id,
        type: job.type,
        roleTitle: job.result?.jobTitle || "Job Analysis",
        company: job.result?.company || "Unknown Company",
        date: new Date().toLocaleDateString(),
        result: job.result,
      };

      if (existingIdx >= 0) {
        history[existingIdx] = { ...history[existingIdx], ...item };
      } else {
        history.unshift(item);
      }

      // Limit history to 10 entries
      const trimmed = history.slice(0, 10);
      localStorage.setItem("interra_history", JSON.stringify(trimmed));
      updateHistoryBadge();
    } catch (e) {
      console.warn("Could not save to history:", e);
    }
  }

  function updateHistoryBadge() {
    const history = getStoredHistory();
    if (historyCountEl) {
      if (history.length > 0) {
        historyCountEl.textContent = history.length;
        historyCountEl.style.display = "inline-block";
      } else {
        historyCountEl.style.display = "none";
      }
    }
  }

  function renderHistory() {
    const history = getStoredHistory();
    if (!historyList) return;

    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-history-box">
          <p style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.35rem;">No preparations yet</p>
          <p style="font-size: 0.875rem;">Upload or paste a job description to start preparing for your interview.</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history.map((item) => `
      <div class="history-item">
        <div class="history-item-left">
          <div class="doc-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div>
            <h4 class="history-item-title">${escapeHtml(item.roleTitle)}</h4>
            <p class="history-item-meta">${escapeHtml(item.company)} &bull; ${item.date}</p>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm resume-btn" data-jobid="${item.id}" data-jobtype="${item.type}">
          View Results
        </button>
      </div>
    `).join("");

    historyList.querySelectorAll(".resume-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const jId = btn.dataset.jobid;
        const jType = btn.dataset.jobtype;
        const item = history.find((h) => h.id === jId);
        if (item && item.result) {
          if (jType === "ANALYZE" || item.result.jobTitle) {
            state.currentAnalysisJobId = item.id;
            state.analysisResult = item.result;
            renderAnalysisResults(item.result);
            switchView("analysis");
          } else if (item.result.questions) {
            state.prepResult = item.result;
            renderQuestions(item.result);
            switchView("questions");
          }
        }
      });
    });
  }

  // -------------------------------------------------------------
  // Settings View & User Preferences
  // -------------------------------------------------------------
  function loadSettings() {
    // User preferences initialization
    const savedAppearance = localStorage.getItem("pref_appearance") || "system";
    const savedLanguage = localStorage.getItem("pref_language") || "en";
    const prefAppearance = document.getElementById("pref-appearance");
    const prefLanguage = document.getElementById("pref-language");
    if (prefAppearance) prefAppearance.value = savedAppearance;
    if (prefLanguage) prefLanguage.value = savedLanguage;
  }

  document.getElementById("btn-edit-profile")?.addEventListener("click", () => {
    showToast("Profile information is managed in your candidate settings.", "info");
  });

  document.getElementById("btn-change-password")?.addEventListener("click", () => {
    showToast("Password updates are managed via secure authentication.", "info");
  });

  document.getElementById("btn-delete-account")?.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      showToast("Account deletion request recorded.", "info");
    }
  });

  document.getElementById("pref-appearance")?.addEventListener("change", (e) => {
    localStorage.setItem("pref_appearance", e.target.value);
    showToast(`Appearance set to ${e.target.value}.`, "success");
  });

  document.getElementById("pref-language")?.addEventListener("change", (e) => {
    localStorage.setItem("pref_language", e.target.value);
    showToast(`Language preference updated.`, "success");
  });

  // Navigation Click Handlers
  navBrand?.addEventListener("click", (e) => {
    e.preventDefault();
    switchView("landing");
  });

  navHome?.addEventListener("click", () => switchView("landing"));
  navHistory?.addEventListener("click", () => {
    renderHistory();
    switchView("history");
  });
  navSettings?.addEventListener("click", () => {
    loadSettings();
    switchView("settings");
  });

  btnMobileMenu?.addEventListener("click", () => {
    sidebar?.classList.toggle("mobile-open");
  });

  // Helper: Format Looking For as bullet points
  function formatLookingForBullets(text) {
    if (!text) return "";
    // If text already has newlines or bullet characters, split them
    const lines = text
      .split(/\r?\n|(?<=[.!?])\s+(?=[A-Z0-9•\-\*])/)
      .map((l) => l.trim().replace(/^[-*•]\s*/, ""))
      .filter((l) => l.length > 0);

    if (lines.length > 1) {
      return `<ul class="looking-for-list">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
    }
    return `<p>${escapeHtml(text)}</p>`;
  }

  // Helper: HTML escaping
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Initial setup
  updateHistoryBadge();
  switchView("landing");
});
