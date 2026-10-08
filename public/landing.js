// public/landing.js
// Interactive logic for the public Interra AI landing page and core preparation flow.

document.addEventListener("DOMContentLoaded", () => {
  // -------------------------------------------------------------
  // Public State
  // -------------------------------------------------------------
  const landingState = {
    selectedFile: null,
    activeTab: "upload", // 'upload' | 'paste'
    currentAnalysisJobId: null,
    currentPrepareJobId: null,
    pollInterval: null,
    analysisResult: null,
    prepResult: null,
    allQuestions: [],
    filteredQuestions: [],
    currentQuestionIndex: 0,
    selectedCategory: "all",
    failedJobId: null,
  };

  // -------------------------------------------------------------
  // DOM References
  // -------------------------------------------------------------
  // Tool Container and Tabs
  const toolSection = document.getElementById("tool-section");
  const tabBtnUpload = document.getElementById("tab-btn-upload");
  const tabBtnPaste = document.getElementById("tab-btn-paste");
  const tabContentUpload = document.getElementById("tab-content-upload");
  const tabContentPaste = document.getElementById("tab-content-paste");

  // Upload & Form Elements
  const landingDropzone = document.getElementById("landing-dropzone");
  const landingFileInput = document.getElementById("landing-file-input");
  const landingBrowseBtn = document.getElementById("landing-browse-btn");
  const landingSelectedBadge = document.getElementById("landing-selected-badge");
  const landingSelectedName = document.getElementById("landing-selected-name");
  const landingClearFileBtn = document.getElementById("landing-clear-file-btn");
  const landingPasteText = document.getElementById("landing-paste-text");
  const landingPasteCount = document.getElementById("landing-paste-count");
  const landingBtnAnalyze = document.getElementById("landing-btn-analyze");

  // Interactive Flow Screens inside Primary Product Tool
  const toolScreenInput = document.getElementById("tool-screen-input");
  const toolScreenProcessing = document.getElementById("tool-screen-processing");
  const toolScreenAnalysis = document.getElementById("tool-screen-analysis");
  const toolScreenQuestions = document.getElementById("tool-screen-questions");
  const toolScreenFailure = document.getElementById("tool-screen-failure");

  // Processing elements
  const toolProcessingTitle = document.getElementById("tool-processing-title");
  const toolProcessingSubtitle = document.getElementById("tool-processing-subtitle");
  const toolStep1 = document.getElementById("tool-step-1");
  const toolStep2 = document.getElementById("tool-step-2");
  const toolStep3 = document.getElementById("tool-step-3");
  const toolStep4 = document.getElementById("tool-step-4");
  const toolJobIdEl = document.getElementById("tool-job-id");

  // Analysis result elements
  const landingRoleTitle = document.getElementById("landing-role-title");
  const landingRoleCompany = document.getElementById("landing-role-company");
  const landingBadgeEmployment = document.getElementById("landing-badge-employment");
  const landingBadgeLocation = document.getElementById("landing-badge-location");
  const landingRequiredSkills = document.getElementById("landing-required-skills");
  const landingPreferredSkills = document.getElementById("landing-preferred-skills");
  const landingPreferredGroup = document.getElementById("landing-preferred-group");
  const landingResponsibilities = document.getElementById("landing-responsibilities");
  const landingExperienceQuals = document.getElementById("landing-experience-quals");
  const landingBtnPrepare = document.getElementById("landing-btn-prepare");
  const landingBtnResetAnalysis = document.getElementById("landing-btn-reset-analysis");

  // Questions result elements
  const landingPrepBadge = document.getElementById("landing-prep-badge");
  const landingQuestionCard = document.getElementById("landing-question-card");
  const landingBtnPrevQ = document.getElementById("landing-btn-prev-q");
  const landingBtnNextQ = document.getElementById("landing-btn-next-q");
  const landingQNavCounter = document.getElementById("landing-q-nav-counter");
  const landingQDots = document.getElementById("landing-q-dots");
  const landingBtnRestart = document.getElementById("landing-btn-restart");
  const landingCatPills = document.querySelectorAll(".landing-cat-pill");

  // Failure elements
  const toolFailureTitle = document.getElementById("tool-failure-title");
  const toolFailureSubtitle = document.getElementById("tool-failure-subtitle");
  const toolBtnRetry = document.getElementById("tool-btn-retry");
  const toolBtnUploadAnother = document.getElementById("tool-btn-upload-another");

  // Navigation and CTAs
  const navMobileToggle = document.getElementById("landing-mobile-toggle");
  const navMenu = document.getElementById("landing-nav-menu");
  const ctaHeroAnalyze = document.getElementById("cta-hero-analyze");
  const ctaHeroHow = document.getElementById("cta-hero-how");
  const ctaFinalStart = document.getElementById("cta-final-start");

  // -------------------------------------------------------------
  // Navigation & Smooth Scroll
  // -------------------------------------------------------------
  navMobileToggle?.addEventListener("click", () => {
    navMenu?.classList.toggle("mobile-open");
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (targetId && targetId !== "#") {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          navMenu?.classList.remove("mobile-open");
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });

  ctaHeroAnalyze?.addEventListener("click", () => {
    toolSection?.scrollIntoView({ behavior: "smooth", block: "center" });
    landingDropzone?.focus();
  });

  ctaHeroHow?.addEventListener("click", () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  ctaFinalStart?.addEventListener("click", () => {
    toolSection?.scrollIntoView({ behavior: "smooth", block: "center" });
    landingDropzone?.focus();
  });

  // -------------------------------------------------------------
  // Tool Tab Switching (Upload File | Paste Text)
  // -------------------------------------------------------------
  tabBtnUpload?.addEventListener("click", () => {
    landingState.activeTab = "upload";
    tabBtnUpload.classList.add("active");
    tabBtnPaste.classList.remove("active");
    tabContentUpload.classList.remove("hidden");
    tabContentPaste.classList.add("hidden");
  });

  tabBtnPaste?.addEventListener("click", () => {
    landingState.activeTab = "paste";
    tabBtnPaste.classList.add("active");
    tabBtnUpload.classList.remove("active");
    tabContentPaste.classList.remove("hidden");
    tabContentUpload.classList.add("hidden");
  });

  // -------------------------------------------------------------
  // File Selection & Drag-and-Drop
  // -------------------------------------------------------------
  landingBrowseBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    landingFileInput?.click();
  });

  landingDropzone?.addEventListener("click", () => {
    landingFileInput?.click();
  });

  landingFileInput?.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFileSelected(file);
  });

  landingClearFileBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelectedFile();
  });

  function handleFileSelected(file) {
    const allowed = [".txt", ".pdf", ".png", ".jpg", ".jpeg", ".webp"];
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!allowed.includes(ext)) {
      alert("Unsupported file format. Please upload a PDF, PNG, JPG, or TXT file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File is too large. Maximum supported size is 10MB.");
      return;
    }

    landingState.selectedFile = file;
    if (landingSelectedName) landingSelectedName.textContent = file.name;
    landingSelectedBadge?.classList.remove("hidden");
    landingDropzone?.classList.add("has-file");
  }

  function clearSelectedFile() {
    landingState.selectedFile = null;
    if (landingFileInput) landingFileInput.value = "";
    landingSelectedBadge?.classList.add("hidden");
    landingDropzone?.classList.remove("has-file");
  }

  ["dragenter", "dragover"].forEach((eventName) => {
    landingDropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      landingDropzone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    landingDropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      landingDropzone.classList.remove("drag-over");
    });
  });

  landingDropzone?.addEventListener("drop", (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // Paste Text Char Counter
  landingPasteText?.addEventListener("input", () => {
    const len = landingPasteText.value.length;
    if (landingPasteCount) landingPasteCount.textContent = len;
  });

  // -------------------------------------------------------------
  // Tool Screen Transitions
  // -------------------------------------------------------------
  function switchToolScreen(screenName) {
    const map = {
      input: toolScreenInput,
      processing: toolScreenProcessing,
      analysis: toolScreenAnalysis,
      questions: toolScreenQuestions,
      failure: toolScreenFailure,
    };
    Object.keys(map).forEach((k) => {
      if (map[k]) {
        if (k === screenName) {
          map[k].classList.remove("hidden");
        } else {
          map[k].classList.add("hidden");
        }
      }
    });
    toolSection?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // -------------------------------------------------------------
  // Primary Product Tool Submission (Analyze)
  // -------------------------------------------------------------
  landingBtnAnalyze?.addEventListener("click", async () => {
    const file = landingState.selectedFile;
    const text = landingPasteText ? landingPasteText.value.trim() : "";

    if (landingState.activeTab === "upload" && !file) {
      if (text.length >= 20) {
        // Auto-switch to paste tab if user typed there
        landingState.activeTab = "paste";
        tabBtnPaste?.click();
      } else {
        alert("Please drop or choose a job description file first.");
        landingDropzone?.focus();
        return;
      }
    } else if (landingState.activeTab === "paste" && text.length < 20) {
      alert("Please enter at least 20 characters of the job description text.");
      landingPasteText?.focus();
      return;
    }

    landingBtnAnalyze.disabled = true;
    setupProcessingScreen("ANALYZE");
    switchToolScreen("processing");

    try {
      let res;
      if (landingState.activeTab === "upload" && file) {
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

      landingState.currentAnalysisJobId = data.jobId;
      startPolling(data.jobId, "ANALYZE");
    } catch (err) {
      handleToolError({
        errorCode: "PROVIDER_ERROR",
        failure: { text: err.message || "Failed to submit job description. Please try again.", canRetry: true },
      }, landingState.currentAnalysisJobId);
    } finally {
      landingBtnAnalyze.disabled = false;
    }
  });

  // -------------------------------------------------------------
  // Processing Stepper Setup
  // -------------------------------------------------------------
  function setupProcessingScreen(type) {
    if (type === "ANALYZE") {
      toolProcessingTitle.textContent = "Analyzing your job description...";
      toolProcessingSubtitle.textContent =
        "Interra AI is identifying the important skills, qualifications, experience and responsibilities.";
      if (toolStep1) toolStep1.textContent = "Job description uploaded";
      if (toolStep2) toolStep2.textContent = "Extracting role requirements";
      if (toolStep3) toolStep3.textContent = "Validating skills & responsibilities";
      if (toolStep4) toolStep4.textContent = "Structuring interview focus areas";
    } else {
      toolProcessingTitle.textContent = "Generating mock interview preparation...";
      toolProcessingSubtitle.textContent =
        "Generating questions and sample answers based strictly on the validated requirements.";
      if (toolStep1) toolStep1.textContent = "Job requirements verified";
      if (toolStep2) toolStep2.textContent = "Targeting role-specific interview topics";
      if (toolStep3) toolStep3.textContent = "Drafting technical & behavioural questions";
      if (toolStep4) toolStep4.textContent = "Synthesizing structured sample answers";
    }
  }

  // -------------------------------------------------------------
  // Polling Job Status
  // -------------------------------------------------------------
  function startPolling(jobId, expectedType) {
    if (landingState.pollInterval) clearInterval(landingState.pollInterval);
    if (toolJobIdEl) toolJobIdEl.textContent = jobId;

    landingState.pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const job = await res.json();

        if (!res.ok) {
          throw new Error(job.message || "Failed to retrieve job status.");
        }

        if (job.status === "DONE") {
          clearInterval(landingState.pollInterval);
          landingState.pollInterval = null;

          if (expectedType === "ANALYZE") {
            landingState.analysisResult = job.result;
            renderAnalysisResults(job.result);
            switchToolScreen("analysis");
          } else if (expectedType === "PREPARE") {
            landingState.prepResult = job.result;
            renderQuestions(job.result);
            switchToolScreen("questions");
          }
        } else if (job.status === "FAILED") {
          clearInterval(landingState.pollInterval);
          landingState.pollInterval = null;
          handleToolError(job, jobId);
        }
      } catch (err) {
        clearInterval(landingState.pollInterval);
        landingState.pollInterval = null;
        handleToolError({
          errorCode: "TIMEOUT",
          failure: { text: err.message || "The request timed out. Please try again.", canRetry: true },
        }, jobId);
      }
    }, 2000);
  }

  // -------------------------------------------------------------
  // Error Handling
  // -------------------------------------------------------------
  function handleToolError(job, jobId) {
    landingState.failedJobId = jobId;
    const failureInfo = job.failure || {
      text: "We couldn't analyze this file. Try again, or upload a clearer job description.",
      canRetry: true,
    };

    if (job.errorCode === "NOT_A_JOB_DESCRIPTION") {
      toolFailureTitle.textContent = "This document does not appear to be a job description";
    } else if (job.errorCode === "RATE_LIMITED") {
      toolFailureTitle.textContent = "Service is temporarily busy";
    } else if (job.errorCode === "TIMEOUT") {
      toolFailureTitle.textContent = "Request timed out";
    } else {
      toolFailureTitle.textContent = "We couldn't analyze this file";
    }

    toolFailureSubtitle.textContent = failureInfo.text;

    if (failureInfo.canRetry && jobId) {
      toolBtnRetry.classList.remove("hidden");
    } else {
      toolBtnRetry.classList.add("hidden");
    }

    switchToolScreen("failure");
  }

  toolBtnRetry?.addEventListener("click", async () => {
    if (!landingState.failedJobId) return;
    toolBtnRetry.disabled = true;
    try {
      const res = await fetch(`/api/jobs/${landingState.failedJobId}/retry`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to retry job.");

      setupProcessingScreen(data.type);
      switchToolScreen("processing");
      startPolling(data.jobId, data.type);
    } catch (err) {
      alert(err.message || "Retry failed.");
    } finally {
      toolBtnRetry.disabled = false;
    }
  });

  toolBtnUploadAnother?.addEventListener("click", () => {
    resetToolForm();
    switchToolScreen("input");
  });

  landingBtnResetAnalysis?.addEventListener("click", () => {
    resetToolForm();
    switchToolScreen("input");
  });

  landingBtnRestart?.addEventListener("click", () => {
    resetToolForm();
    switchToolScreen("input");
  });

  function resetToolForm() {
    clearSelectedFile();
    if (landingPasteText) landingPasteText.value = "";
    if (landingPasteCount) landingPasteCount.textContent = "0";
    landingState.currentAnalysisJobId = null;
    landingState.currentPrepareJobId = null;
    landingState.analysisResult = null;
    landingState.prepResult = null;
  }

  // -------------------------------------------------------------
  // Render Step 3: Validated Job Requirements
  // -------------------------------------------------------------
  function renderAnalysisResults(r) {
    if (!r) return;

    if (landingRoleTitle) landingRoleTitle.textContent = r.jobTitle || "Job Title Not Specified";
    if (landingRoleCompany) landingRoleCompany.textContent = r.company ? r.company : "Company not specified";

    const formatEmpType = (t) => {
      if (!t) return "Standard Employment";
      return t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");
    };

    if (landingBadgeEmployment) landingBadgeEmployment.textContent = formatEmpType(r.employmentType);
    if (landingBadgeLocation) landingBadgeLocation.textContent = r.location || "Location not specified";

    // Required Skills
    if (landingRequiredSkills) {
      landingRequiredSkills.innerHTML = "";
      if (r.requiredSkills && r.requiredSkills.length > 0) {
        r.requiredSkills.forEach((skill) => {
          const tag = document.createElement("span");
          tag.className = "skill-tag";
          tag.textContent = skill;
          landingRequiredSkills.appendChild(tag);
        });
      } else {
        landingRequiredSkills.innerHTML = "<span class='text-muted'>None explicitly listed</span>";
      }
    }

    // Preferred Skills
    if (landingPreferredSkills && landingPreferredGroup) {
      landingPreferredSkills.innerHTML = "";
      if (r.preferredSkills && r.preferredSkills.length > 0) {
        landingPreferredGroup.style.display = "block";
        r.preferredSkills.forEach((skill) => {
          const tag = document.createElement("span");
          tag.className = "skill-tag preferred";
          tag.textContent = skill;
          landingPreferredSkills.appendChild(tag);
        });
      } else {
        landingPreferredGroup.style.display = "none";
      }
    }

    // Responsibilities
    if (landingResponsibilities) {
      landingResponsibilities.innerHTML = "";
      if (r.responsibilities && r.responsibilities.length > 0) {
        r.responsibilities.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          landingResponsibilities.appendChild(li);
        });
      } else {
        landingResponsibilities.innerHTML = "<li>No specific responsibilities parsed.</li>";
      }
    }

    // Experience & Qualifications
    if (landingExperienceQuals) {
      landingExperienceQuals.innerHTML = "";
      let hasItem = false;
      if (r.requiredExperience && r.requiredExperience.length > 0) {
        r.requiredExperience.forEach((exp) => {
          hasItem = true;
          const li = document.createElement("li");
          const yrs = exp.minYears ? ` (${exp.minYears}+ years)` : "";
          li.textContent = `${exp.description}${yrs}`;
          landingExperienceQuals.appendChild(li);
        });
      }
      if (r.qualifications && r.qualifications.length > 0) {
        r.qualifications.forEach((qual) => {
          hasItem = true;
          const li = document.createElement("li");
          li.textContent = qual;
          landingExperienceQuals.appendChild(li);
        });
      }
      if (!hasItem) {
        landingExperienceQuals.innerHTML = "<li>Industry standard qualifications expected.</li>";
      }
    }
  }

  // -------------------------------------------------------------
  // Trigger Step 4 & 5: Generate Mock Interview
  // -------------------------------------------------------------
  landingBtnPrepare?.addEventListener("click", async () => {
    if (!landingState.currentAnalysisJobId) {
      alert("Missing active analysis job.");
      return;
    }

    landingBtnPrepare.disabled = true;
    setupProcessingScreen("PREPARE");
    switchToolScreen("processing");

    try {
      const res = await fetch("/api/jobs/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentJobId: landingState.currentAnalysisJobId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to trigger mock interview preparation.");
      }

      landingState.currentPrepareJobId = data.jobId;
      startPolling(data.jobId, "PREPARE");
    } catch (err) {
      handleToolError({
        errorCode: "PROVIDER_ERROR",
        failure: { text: err.message || "Failed to prepare mock interview questions.", canRetry: true },
      }, landingState.currentAnalysisJobId);
    } finally {
      landingBtnPrepare.disabled = false;
    }
  });

  // -------------------------------------------------------------
  // Render Step 6: Questions & Sample Answers
  // -------------------------------------------------------------
  function renderQuestions(prepData) {
    if (!prepData || !prepData.questions) return;
    landingState.allQuestions = prepData.questions;
    landingState.selectedCategory = "all";
    filterLandingQuestions();

    if (landingPrepBadge && landingState.analysisResult) {
      landingPrepBadge.textContent = landingState.analysisResult.jobTitle || "Role Specific";
    }
  }

  function filterLandingQuestions() {
    if (landingState.selectedCategory === "all") {
      landingState.filteredQuestions = [...landingState.allQuestions];
    } else {
      landingState.filteredQuestions = landingState.allQuestions.filter(
        (q) => q.category === landingState.selectedCategory
      );
    }
    landingState.currentQuestionIndex = 0;
    renderCurrentLandingQuestion();
  }

  landingCatPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      landingCatPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      landingState.selectedCategory = pill.dataset.cat || "all";
      filterLandingQuestions();
    });
  });

  function renderCurrentLandingQuestion() {
    const list = landingState.filteredQuestions;
    const total = list.length;

    if (total === 0) {
      landingQuestionCard.innerHTML = `<div style="text-align: center; padding: 2.5rem; color: #64748b;">No questions in this category.</div>`;
      if (landingBtnPrevQ) landingBtnPrevQ.disabled = true;
      if (landingBtnNextQ) landingBtnNextQ.disabled = true;
      if (landingQNavCounter) landingQNavCounter.textContent = "0 of 0";
      if (landingQDots) landingQDots.innerHTML = "";
      return;
    }

    const q = list[landingState.currentQuestionIndex];
    const displayNum = String(landingState.currentQuestionIndex + 1).padStart(2, "0");
    const categoryLabel = q.category.replace("_", " ");

    landingQuestionCard.innerHTML = `
      <div class="question-card-top-row">
        <div>
          <span class="question-index-badge">${displayNum}</span>
          <span class="question-category-label">${categoryLabel} Question</span>
        </div>
        <span class="badge badge-accent">${escapeHtml(q.relatedRequirement)}</span>
      </div>

      <h3 class="question-text-heading">${escapeHtml(q.question)}</h3>

      <!-- Sample Answer Section with clear guidance note -->
      <div class="sample-answer-box" id="landing-sample-box">
        <div class="sample-answer-header" id="landing-sample-toggle" tabindex="0" role="button" aria-expanded="true">
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
        <p class="sample-answer-guide-tip">Use sample answers as guidance and adapt them to your own experience.</p>
        <div class="sample-answer-content" id="landing-sample-content">
          ${escapeHtml(q.sampleAnswer)}
        </div>
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
          ${escapeHtml(q.interviewerLookingFor)}
        </div>
      </div>

      <!-- Derived Requirement Pill -->
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
    const toggle = document.getElementById("landing-sample-toggle");
    const box = document.getElementById("landing-sample-box");
    toggle?.addEventListener("click", () => {
      box?.classList.toggle("collapsed");
      const isExpanded = !box?.classList.contains("collapsed");
      toggle.setAttribute("aria-expanded", String(isExpanded));
    });

    // Navigation updates
    if (landingBtnPrevQ) landingBtnPrevQ.disabled = landingState.currentQuestionIndex === 0;
    if (landingBtnNextQ) landingBtnNextQ.disabled = landingState.currentQuestionIndex >= total - 1;
    if (landingQNavCounter) landingQNavCounter.textContent = `Question ${landingState.currentQuestionIndex + 1} of ${total}`;

    if (landingQDots) {
      landingQDots.innerHTML = "";
      for (let i = 0; i < total; i++) {
        const dot = document.createElement("span");
        dot.className = `q-dot ${i === landingState.currentQuestionIndex ? "active" : ""}`;
        landingQDots.appendChild(dot);
      }
    }
  }

  landingBtnPrevQ?.addEventListener("click", () => {
    if (landingState.currentQuestionIndex > 0) {
      landingState.currentQuestionIndex--;
      renderCurrentLandingQuestion();
    }
  });

  landingBtnNextQ?.addEventListener("click", () => {
    if (landingState.currentQuestionIndex < landingState.filteredQuestions.length - 1) {
      landingState.currentQuestionIndex++;
      renderCurrentLandingQuestion();
    }
  });

  // -------------------------------------------------------------
  // FAQ Accordion
  // -------------------------------------------------------------
  document.querySelectorAll(".faq-trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const item = trigger.closest(".faq-item");
      const isExpanded = trigger.getAttribute("aria-expanded") === "true";
      // Close any other open faq item
      document.querySelectorAll(".faq-item").forEach((other) => {
        if (other !== item) {
          other.classList.remove("open");
          other.querySelector(".faq-trigger")?.setAttribute("aria-expanded", "false");
        }
      });
      // Toggle current
      item?.classList.toggle("open", !isExpanded);
      trigger.setAttribute("aria-expanded", String(!isExpanded));
    });
  });

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
