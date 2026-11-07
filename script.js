(() => {
  // Katalog kompetisi publik
  const renderCompetitionCatalog = async () => {
    const grid = document.getElementById("competition-grid");
    if (!grid) return;
    const escape = (value) => String(value ?? "").replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
    try {
      const response = await fetch("/api/competitions");
      if (!response.ok) throw new Error(`Server merespons ${response.status}.`);
      const data = await response.json();
      const items = data.competitions || [];
      grid.setAttribute("aria-busy", "false");
      if (!items.length) { grid.innerHTML = '<p class="catalog-message">Belum ada kompetisi yang tersedia.</p>'; return; }
      grid.innerHTML = items.map((c) => {
        const open = c.is_open && c.status === "OPEN";
        const status = c.status === "UPCOMING" ? "SEGERA HADIR" : open ? "PENDAFTARAN DIBUKA" : "PENDAFTARAN DITUTUP";
        return `<article class="comp-card"><div class="comp-top"><div class="comp-icon" aria-hidden="true">🏆</div><span class="comp-tag">${escape(c.audience || "NASIONAL")}</span></div><div><h3>${escape(c.name)}</h3><p class="comp-audience">${escape(c.audience || "SEMUA JENJANG")}</p></div><p class="desc">${escape(c.description || "Informasi kompetisi akan segera tersedia.")}</p><span class="comp-tag">${escape(c.participation_type === "TEAM" ? "TIM" : "INDIVIDU")}</span>${open ? `<a class="btn btn-primary btn-block" href="join/?competition=${encodeURIComponent(c.slug)}">DAFTAR <img src="assets/svg/arrow-up-right.svg" alt="" width="17" height="17" /></a>` : `<span class="btn btn-muted" aria-disabled="true">${status}</span>`}</article>`;
      }).join("");
    } catch (error) { grid.setAttribute("aria-busy", "false"); grid.innerHTML = `<p class="catalog-message" role="status">Daftar kompetisi belum dapat dimuat. ${escape(error.message)} Silakan coba lagi nanti.</p>`; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderCompetitionCatalog); else renderCompetitionCatalog();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ------------------------------------------------ dialog error autentikasi
  // Native <dialog> + showModal(): focus trap, background inert, Escape,
  // dan pemulihan fokus ditangani browser (WAI-ARIA APG / WCAG 2.2).
  // Digunakan khusus untuk kegagalan autentikasi kritis / penguncian akun (lockout).
  let authDialog = null;

  const ensureAuthDialog = () => {
    if (authDialog) return authDialog;
    authDialog = document.createElement("dialog");
    authDialog.className = "auth-dialog";
    authDialog.setAttribute("role", "alertdialog");
    authDialog.setAttribute("aria-labelledby", "auth-dialog-title");
    authDialog.setAttribute("aria-describedby", "auth-dialog-text");
    authDialog.innerHTML = `
      <div class="auth-dialog-card">
        <div class="auth-dialog-header">
          <div class="auth-dialog-badge" data-auth-dialog-badge aria-hidden="true">
            <svg class="auth-dialog-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <button class="auth-dialog-close" type="button" data-auth-dialog-close aria-label="Tutup dialog">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <h3 class="auth-dialog-title" id="auth-dialog-title" data-auth-dialog-title-text>Gagal Masuk</h3>
        <p class="auth-dialog-text" id="auth-dialog-text" data-auth-dialog-text></p>
        <div class="auth-dialog-actions">
          <button class="auth-dialog-ok" type="button" data-auth-dialog-close autofocus>Mengerti</button>
        </div>
      </div>`;
    document.body.appendChild(authDialog);
    authDialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-auth-dialog-close]")) authDialog.close();
    });
    // klik di backdrop (di luar kartu dialog) menutup modal
    authDialog.addEventListener("click", (event) => {
      if (event.target === authDialog) authDialog.close();
    });
    return authDialog;
  };

  const showAuthError = (form, text) => {
    const message = form?.querySelector("[data-auth-message]");
    const dialog = ensureAuthDialog();
    const isLockout = typeof text === "string" && text.includes("Akun dikunci");
    const isRateLimit = typeof text === "string" && text.includes("Terlalu banyak percobaan");
    const titleText = isLockout
      ? "Akun Dikunci"
      : isRateLimit
      ? "Batas Percobaan Terlampaui"
      : "Gagal Masuk";

    const titleEl = dialog.querySelector("[data-auth-dialog-title-text]");
    const textEl = dialog.querySelector("[data-auth-dialog-text]");
    const badgeEl = dialog.querySelector("[data-auth-dialog-badge]");

    if (titleEl) titleEl.textContent = titleText;
    if (textEl) textEl.textContent = text;
    if (badgeEl) badgeEl.classList.toggle("is-lockout", isLockout);

    // Persist inline message di form (live region)
    if (message) {
      message.textContent = text;
      message.classList.add("is-error");
    }
    // Tampilkan modal alert dialog
    if (!dialog.open) dialog.showModal();
  };

  const splitTitle = (heading) => {
    const title = heading.textContent.trim();
    const letters = document.createDocumentFragment();
    heading.setAttribute("aria-label", title);

    Array.from(title).forEach((character, index) => {
      const letter = document.createElement("span");
      letter.className = "title-letter";
      letter.setAttribute("aria-hidden", "true");
      letter.style.setProperty("--letter-delay", `${index * 34}ms`);
      letter.textContent = character;
      letters.append(letter);
    });

    heading.replaceChildren(letters);
  };

  if (!reduceMotion) {
    document
      .querySelectorAll(".home-page .hero-title, .about-page .policy-title, .timeline-page .coming-soon-title")
      .forEach(splitTitle);
  }

  const motionGroups = [
    [".hero-title", "hero-title", 0],
    [".hero-year", "hero-year", 150],
    [".hero-sub", "hero-sub", 380],
    [".sponsors-label", "sponsor-label", 0],
    [".sponsor-line", "sponsor-row", 130],
    [".theme-copy", "theme-copy", 0],
    [".theme-mascot", "theme-mascot", 0],
    [".started .section-head", "timeline-heading", 0],
    [".step", "timeline-step", 90],
    [".team .section-head", "team-heading", 0],
    [".team-card", "team-card", 110],
    [".competition .section-head", "competition-heading", 0],
    [".comp-card", "competition-card", 65],
    [".faq .section-head", "faq-heading", 0],
    [".faq-item", "faq-item", 70],
    [".footer-legal", "footer-legal", 0],
    [".policy-title", "policy-title", 0],
    [".policy-copy", "policy-copy", 100],
    [".policy-signoff", "policy-signoff", 0],
    [".coming-soon-title", "coming-soon-title", 0],
  ];

  const motionTargets = [];
  for (const [selector, motionName, delayStep] of motionGroups) {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.dataset.motion = motionName;
      element.style.setProperty("--motion-delay", `${Math.min(index * delayStep, 455)}ms`);
      motionTargets.push(element);
    });
  }

  const nav = document.querySelector(".nav");
  const navToggle = document.querySelector(".nav-toggle");
  const closeMenu = () => {
    if (!nav || !navToggle) return;
    nav.classList.remove("menu-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation");
  };

  navToggle?.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") !== "true";
    nav.classList.toggle("menu-open", isOpen);
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  nav?.querySelectorAll(".nav-links a, .nav-actions a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("pointerdown", (event) => {
    if (nav?.classList.contains("menu-open") && !nav.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  window.matchMedia("(min-width: 769px)").addEventListener("change", closeMenu);

  if ("IntersectionObserver" in window && !reduceMotion && motionTargets.length) {
    document.documentElement.classList.add("has-motion");
    const motionObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.14, rootMargin: "0px 0px -28px 0px" });

    motionTargets.forEach((element) => motionObserver.observe(element));
  }

  const faqList = document.querySelector(".faq-list");
  faqList?.addEventListener("click", (event) => {
    const selected = event.target.closest(".faq-question");
    if (!selected || !faqList.contains(selected)) return;

    const shouldOpen = selected.getAttribute("aria-expanded") !== "true";
    faqList.querySelectorAll(".faq-question").forEach((question) => {
      const isOpen = question === selected && shouldOpen;
      const item = question.closest(".faq-item");
      const answer = item.querySelector(".faq-answer");
      question.setAttribute("aria-expanded", String(isOpen));
      item.classList.toggle("is-open", isOpen);
      answer.setAttribute("aria-hidden", String(!isOpen));
      answer.inert = !isOpen;
    });
  });

  document.querySelectorAll(".team-card, .comp-card").forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty("--pointer-x", `${event.clientX - bounds.left}px`);
      card.style.setProperty("--pointer-y", `${event.clientY - bounds.top}px`);
    });
  });

  const mascot = document.querySelector(".theme-mascot .mascot");
  const showcase = document.querySelector(".theme-mascot");
  if (mascot && showcase && !reduceMotion && window.matchMedia("(hover: hover)").matches) {
    showcase.addEventListener("pointermove", (event) => {
      const bounds = showcase.getBoundingClientRect();
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;
      mascot.style.transform = `translate(${x * 8}px, ${y * 6}px) rotate(${x * 2.5}deg)`;
    });
    showcase.addEventListener("pointerleave", () => {
      mascot.style.transform = "translate(0, 0) rotate(0deg)";
    });
  }

  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".auth-control")?.querySelector("input");
      if (!input) return;

      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.setAttribute("aria-pressed", String(reveal));
      button.setAttribute("aria-label", reveal ? "Sembunyikan kata sandi" : "Tampilkan kata sandi");
    });
  });

  document.querySelectorAll("[data-auth-form]").forEach((form) => {
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    const confirmation = form.querySelector('input[name="confirmPassword"]');
    const message = form.querySelector("[data-auth-message]");
    const isJoinForm = form.dataset.authForm === "join";
    const passwordField = password?.closest(".auth-field");
    const passwordRules = passwordField?.querySelector(".password-rules");

    // ---- captcha perkalian: load soal, tombol refresh, auto-retry
    const captchaBox = form.querySelector("[data-captcha]");
    const captchaQuestion = form.querySelector("[data-captcha-question]");
    const loadCaptcha = async () => {
      if (!captchaBox || !captchaQuestion) return;
      captchaQuestion.textContent = "Memuat soal verifikasi…";
      captchaQuestion.classList.remove("is-error");
      try {
        const res = await fetch("/api/auth/captcha");
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        captchaBox.dataset.captchaId = data.id;
        captchaQuestion.textContent = data.question;
      } catch {
        captchaQuestion.textContent = "Gagal memuat soal — klik ikon ↻ untuk coba lagi.";
        captchaQuestion.classList.add("is-error");
      }
    };
    loadCaptcha();
    form.querySelector("[data-captcha-refresh]")?.addEventListener("click", loadCaptcha);

    // ---- competition loading & selection (khusus join)
    let competitionsList = [];
    const compSelect = form.querySelector('select[name="competition"]');
    const compCard = form.querySelector("[data-competition-card]");
    const compTag = form.querySelector("[data-competition-tag]");
    const compMeta = form.querySelector("[data-competition-meta]");

    const updateCompetitionDisplay = (selectedSlug) => {
      if (!compCard) return;
      const comp = competitionsList.find((c) => c.slug === selectedSlug);
      if (!comp) {
        compCard.hidden = true;
        return;
      }
      compCard.hidden = false;
      if (compTag) {
        const typeLabel = comp.participation_type === "TEAM"
          ? `Tim (${comp.min_team_members}–${comp.max_team_members} Orang)`
          : "Individu";
        compTag.innerHTML = `<span>${comp.name}</span> <span class="competition-card-badge">${typeLabel}</span>`;
      }
      if (compMeta) {
        const audienceText = comp.audience ? `Jenjang: ${comp.audience}` : "";
        const descText = comp.description || "";
        compMeta.textContent = [audienceText, descText].filter(Boolean).join(" • ");
      }
    };

    const loadCompetitions = async () => {
      if (!compSelect) return;
      try {
        const res = await fetch("/api/competitions");
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        competitionsList = data.competitions || [];
        const openComps = competitionsList.filter((c) => c.is_open);

        compSelect.innerHTML = "";
        if (openComps.length === 0) {
          const opt = document.createElement("option");
          opt.value = "";
          opt.textContent = "Belum ada pendaftaran kompetisi yang dibuka";
          compSelect.appendChild(opt);
          return;
        }

        const placeholderOpt = document.createElement("option");
        placeholderOpt.value = "";
        placeholderOpt.textContent = "— Pilih Kompetisi —";
        compSelect.appendChild(placeholderOpt);

        openComps.forEach((comp) => {
          const opt = document.createElement("option");
          opt.value = comp.slug;
          const typeLabel = comp.participation_type === "TEAM" ? "Tim" : "Individu";
          opt.textContent = `${comp.name} (${comp.audience}) · ${typeLabel}`;
          compSelect.appendChild(opt);
        });

        const urlParams = new URLSearchParams(window.location.search);
        const targetSlug = urlParams.get("competition")?.trim().toLowerCase();

        if (targetSlug) {
          const matched = openComps.find((c) => c.slug === targetSlug);
          if (matched) {
            compSelect.value = targetSlug;
            updateCompetitionDisplay(targetSlug);
          } else {
            const closedOrUnknown = competitionsList.find((c) => c.slug === targetSlug);
            if (closedOrUnknown) {
              setFieldError("competition", `Kompetisi "${closedOrUnknown.name}" belum membuka pendaftaran.`);
            } else {
              setFieldError("competition", `Kompetisi "${targetSlug}" tidak ditemukan.`);
            }
          }
        } else if (openComps.length === 1) {
          compSelect.value = openComps[0].slug;
          updateCompetitionDisplay(openComps[0].slug);
        }
      } catch (err) {
        compSelect.innerHTML = '<option value="">Gagal memuat kompetisi</option>';
      }
    };

    if (isJoinForm && compSelect) {
      loadCompetitions();
      compSelect.addEventListener("change", () => {
        updateCompetitionDisplay(compSelect.value);
        if (compSelect.value) {
          setFieldError("competition", "");
        }
      });
    }

    const validateCompetition = (showInline = false) => {
      if (!isJoinForm || !compSelect) return true;
      const val = compSelect.value?.trim();
      if (!val) {
        if (showInline) setFieldError("competition", "Pilih kompetisi terlebih dahulu.");
        else compSelect.setCustomValidity("Pilih kompetisi terlebih dahulu.");
        return false;
      }
      setFieldError("competition", "");
      return true;
    };

    const invalidCharacters = {
      name: /[^\p{L}\p{M} .'’-]/gu,
      email: /[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g,
      identifier: /[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g,
      digits: /\D/g,
    };

    form.querySelectorAll("[data-allowlist]").forEach((input) => {
      const invalid = invalidCharacters[input.dataset.allowlist];
      if (!invalid) return;

      input.addEventListener("input", () => {
        const original = input.value;
        const caret = input.selectionStart ?? original.length;
        const sanitized = original.replace(invalid, "");
        if (sanitized === original) return;

        const sanitizedCaret = original.slice(0, caret).replace(invalid, "").length;
        input.value = sanitized;
        input.setSelectionRange(sanitizedCaret, sanitizedCaret);
      });
    });

    const setFieldError = (fieldName, errorMsg) => {
      const input = form.querySelector(`input[name="${fieldName}"], select[name="${fieldName}"]`);
      if (!input) return;
      const field = input.closest(".auth-field");
      const errorEl = field?.querySelector(`[data-field-error="${fieldName}"], .auth-field-error`);
      if (errorMsg) {
        input.setAttribute("aria-invalid", "true");
        if (field) field.classList.add("has-error");
        if (errorEl) errorEl.textContent = errorMsg;
        input.setCustomValidity(errorMsg);
      } else {
        input.setAttribute("aria-invalid", "false");
        if (field) field.classList.remove("has-error");
        if (errorEl) errorEl.textContent = "";
        input.setCustomValidity("");
      }
    };

    // RFC 5322-compatible regex for client-side email format prevention
    const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

    let emailTouched = false;
    const validateEmail = (showInline = false) => {
      if (!email) return true;
      const val = email.value.trim();
      if (!val) {
        if (showInline) setFieldError("email", "Alamat email wajib diisi.");
        else email.setCustomValidity("Alamat email wajib diisi.");
        return false;
      }
      if (val.length > 254) {
        const msg = "Alamat email terlalu panjang (maksimal 254 karakter).";
        if (showInline) setFieldError("email", msg);
        else email.setCustomValidity(msg);
        return false;
      }
      if (!EMAIL_REGEX.test(val)) {
        const msg = "Format email tidak valid (contoh: nama@domain.com).";
        if (showInline) setFieldError("email", msg);
        else email.setCustomValidity(msg);
        return false;
      }
      setFieldError("email", "");
      return true;
    };

    email?.addEventListener("input", () => {
      const field = email.closest(".auth-field");
      const hasError = field?.classList.contains("has-error");
      if (emailTouched || hasError) {
        validateEmail(true);
      } else {
        validateEmail(false);
      }
    });

    email?.addEventListener("blur", () => {
      if (email.value.trim().length > 0) {
        emailTouched = true;
        validateEmail(true);
      }
    });

    let fullNameTouched = false;
    const validateFullName = (showInline = false) => {
      if (!isJoinForm || !form.fullName) return true;
      const val = form.fullName.value.trim();
      if (!val) {
        if (showInline) setFieldError("fullName", "Nama lengkap wajib diisi.");
        else form.fullName.setCustomValidity("Nama lengkap wajib diisi.");
        return false;
      }
      if (val.length > 100) {
        const msg = "Nama lengkap maksimal 100 karakter.";
        if (showInline) setFieldError("fullName", msg);
        else form.fullName.setCustomValidity(msg);
        return false;
      }
      setFieldError("fullName", "");
      return true;
    };

    form.fullName?.addEventListener("input", () => {
      const field = form.fullName.closest(".auth-field");
      const hasError = field?.classList.contains("has-error");
      if (fullNameTouched || hasError) validateFullName(true);
      else validateFullName(false);
    });

    form.fullName?.addEventListener("blur", () => {
      if (form.fullName.value.trim().length > 0) {
        fullNameTouched = true;
        validateFullName(true);
      }
    });

    const meter = form.querySelector("[data-password-meter]");
    const meterFill = form.querySelector("[data-password-meter-fill]");
    const meterLabel = form.querySelector("[data-password-meter-label]");
    const PW_MIN = 15, PW_MAX = 64;

    const SCORE_LABELS = ["Sangat lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"];
    const SCORE_COLORS = ["#e5484d", "#e5784d", "#e2c34d", "#6bc26b", "#3fa650"];

    let passwordTouched = false;
    const validatePassword = (showInline = false) => {
      if (!password) return true;
      const value = password.value;
      if (!value) {
        if (showInline) setFieldError("password", "Kata sandi wajib diisi.");
        else password.setCustomValidity("Kata sandi wajib diisi.");
        return false;
      }
      if (!isJoinForm) {
        setFieldError("password", "");
        return true;
      }
      const checks = {
        length: value.length >= PW_MIN && value.length <= PW_MAX,
        common: value.length >= PW_MIN && typeof window.zxcvbn === "function"
          ? window.zxcvbn(value.slice(0, 64)).score >= 3
          : value.length >= PW_MIN,
        charset: value.length === 0 || [...value].every((ch) => {
          const cp = ch.codePointAt(0);
          return (cp >= 0x20 && cp <= 0x7E) || cp >= 0xA0;
        }),
      };
      const isStrong = Object.values(checks).every(Boolean);

      passwordRules?.querySelectorAll("[data-password-rule]").forEach((rule) => {
        const met = checks[rule.dataset.passwordRule];
        rule.classList.toggle("is-met", met);
        const marker = rule.querySelector("span");
        if (marker) marker.textContent = met ? "✓" : "○";
      });

      // floating meter: tampil saat mengetik, hilang saat kosong/fokus keluar
      if (meter) {
        const show = value.length > 0 && document.activeElement === password;
        meter.hidden = !show;
        if (value.length > 0 && meterFill && meterLabel) {
          let score = 0;
          if (typeof window.zxcvbn === "function" && value.length >= PW_MIN) {
            score = window.zxcvbn(value.slice(0, 64)).score;
          }
          const pct = Math.min(100, Math.round((value.length / PW_MIN) * 60 + score * 8));
          meterFill.style.width = `${Math.min(100, pct)}%`;
          meterFill.style.background = SCORE_COLORS[score];
          meterLabel.textContent = `${SCORE_LABELS[score]}${value.length < PW_MIN ? ` — ${PW_MIN - value.length} karakter lagi` : ""}`;
        }
      }

      if (!isStrong) {
        const msg = `Kata sandi minimal ${PW_MIN} karakter dan tidak mudah ditebak.`;
        if (showInline) setFieldError("password", msg);
        else password.setCustomValidity(msg);
        return false;
      }

      setFieldError("password", "");
      return true;
    };

    let confirmTouched = false;
    const validateConfirmation = (showInline = false) => {
      if (!confirmation || !isJoinForm) return true;
      if (!confirmation.value) {
        if (showInline) setFieldError("confirmPassword", "Konfirmasi kata sandi wajib diisi.");
        else confirmation.setCustomValidity("Konfirmasi kata sandi wajib diisi.");
        return false;
      }
      if (confirmation.value !== password?.value) {
        const msg = "Kata sandi belum sama.";
        if (showInline) setFieldError("confirmPassword", msg);
        else confirmation.setCustomValidity(msg);
        return false;
      }
      setFieldError("confirmPassword", "");
      return true;
    };

    password?.addEventListener("input", () => {
      const field = password.closest(".auth-field");
      const hasError = field?.classList.contains("has-error");
      if (passwordTouched || hasError) validatePassword(true);
      else validatePassword(false);
      if (confirmation && (confirmTouched || confirmation.value)) {
        validateConfirmation(true);
      }
    });
    password?.addEventListener("focus", () => {
      if (isJoinForm && meter && password.value.length > 0) meter.hidden = false;
    });
    passwordField?.addEventListener("focusout", () => {
      if (!passwordField.contains(document.activeElement) && meter) {
        meter.hidden = true;
      }
    });
    password?.addEventListener("blur", () => {
      if (password.value) {
        passwordTouched = true;
        validatePassword(true);
      }
    });

    confirmation?.addEventListener("input", () => {
      const field = confirmation.closest(".auth-field");
      const hasError = field?.classList.contains("has-error");
      if (confirmTouched || hasError) validateConfirmation(true);
      else validateConfirmation(false);
    });
    confirmation?.addEventListener("blur", () => {
      if (confirmation.value) {
        confirmTouched = true;
        validateConfirmation(true);
      }
    });

    const validateCaptcha = (showInline = false) => {
      const captchaInput = form.querySelector('input[name="captchaAnswer"]');
      const val = captchaInput?.value?.trim() || "";
      if (!val) {
        if (showInline) setFieldError("captchaAnswer", "Jawab soal verifikasi terlebih dahulu.");
        else captchaInput?.setCustomValidity("Jawab soal verifikasi terlebih dahulu.");
        return false;
      }
      setFieldError("captchaAnswer", "");
      return true;
    };

    form.querySelector('input[name="captchaAnswer"]')?.addEventListener("input", () => {
      const captchaInput = form.querySelector('input[name="captchaAnswer"]');
      const hasError = captchaInput?.closest(".auth-field")?.classList.contains("has-error");
      if (hasError) validateCaptcha(true);
    });

    const handleValidationErrors = (detail) => {
      let firstInvalidInput = null;

      const recordError = (fieldKey, msg) => {
        let inputName = fieldKey;
        if (fieldKey === "confirm_password") inputName = "confirmPassword";
        if (fieldKey === "full_name") inputName = "fullName";
        if (fieldKey === "captcha_answer" || fieldKey === "captcha_id") inputName = "captchaAnswer";

        let indonesianMsg = msg;
        if (fieldKey === "email") {
          indonesianMsg = "Format email tidak valid atau tidak didukung.";
        } else if (fieldKey === "confirm_password" || fieldKey === "confirmPassword") {
          indonesianMsg = "Kata sandi belum sama.";
        } else if (fieldKey === "password") {
          indonesianMsg = typeof msg === "string" && msg.includes("Minimal")
            ? msg
            : "Kata sandi tidak memenuhi kebijakan keamanan.";
        } else if (fieldKey === "captcha" || fieldKey === "captcha_answer") {
          indonesianMsg = "Jawaban verifikasi salah atau kedaluwarsa.";
          loadCaptcha();
        } else if (fieldKey === "full_name") {
          indonesianMsg = "Nama lengkap tidak valid.";
        } else if (fieldKey === "competition") {
          indonesianMsg = typeof msg === "string" ? msg : "Pilihan kompetisi tidak valid.";
        }

        const input = form.querySelector(`input[name="${inputName}"]`);
        if (input) {
          setFieldError(inputName, indonesianMsg);
          if (!firstInvalidInput) firstInvalidInput = input;
        } else if (message) {
          message.textContent = indonesianMsg || "Data formulir tidak valid.";
          message.classList.add("is-error");
        }
      };

      if (Array.isArray(detail)) {
        detail.forEach((issue) => {
          const fieldKey = issue.loc && issue.loc.length ? issue.loc[issue.loc.length - 1] : "";
          recordError(fieldKey, issue.msg);
        });
      } else if (typeof detail === "object" && detail !== null) {
        Object.entries(detail).forEach(([key, val]) => {
          const text = Array.isArray(val) ? val.join(". ") : String(val);
          recordError(key, text);
        });
      } else if (message) {
        message.textContent = typeof detail === "string" ? detail : "Data formulir tidak valid.";
        message.classList.add("is-error");
      }

      if (firstInvalidInput) {
        firstInvalidInput.focus();
      }
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (message) {
        message.textContent = "";
        message.classList.remove("is-error");
      }

      // 1. Jalankan semua validasi inline client-side
      const isFullNameValid = validateFullName(true);
      const isEmailValid = validateEmail(true);
      const isPasswordValid = validatePassword(true);
      const isConfirmValid = validateConfirmation(true);
      const isCaptchaValid = validateCaptcha(true);
      const isCompetitionValid = validateCompetition(true);

      const isValid = isFullNameValid && isEmailValid && isPasswordValid && isConfirmValid && isCaptchaValid && isCompetitionValid;
      if (!isValid) {
        const firstErrorField = form.querySelector(".auth-field.has-error input, .auth-field.has-error select");
        if (firstErrorField) firstErrorField.focus();
        return;
      }

      const captchaId = form.querySelector("[data-captcha]")?.dataset.captchaId;
      const captchaAnswer = form.captchaAnswer?.value?.trim() || "";
      if (!captchaId || !captchaAnswer) {
        setFieldError("captchaAnswer", "Jawab soal verifikasi terlebih dahulu.");
        form.captchaAnswer?.focus();
        return;
      }

      const submitButton = form.querySelector(".auth-submit");
      if (submitButton) submitButton.disabled = true;
      if (message) {
        message.textContent = isJoinForm ? "Mendaftarkan akun..." : "Memverifikasi akun...";
      }

      try {
        const endpoint = isJoinForm ? "/api/auth/register" : "/api/auth/login";
        const body = isJoinForm
          ? {
              full_name: form.fullName.value.trim(),
              email: form.email.value.trim(),
              password: password.value,
              confirm_password: confirmation.value,
              captcha_id: captchaId,
              captcha_answer: captchaAnswer,
              competition: compSelect?.value || undefined,
            }
          : {
              email: form.email.value.trim(),
              password: password.value,
              captcha_id: captchaId,
              captcha_answer: captchaAnswer,
            };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          if (message) {
            message.textContent = isJoinForm
              ? "Akun berhasil dibuat. Mengalihkan ke dashboard..."
              : "Login berhasil. Mengalihkan ke dashboard...";
          }
          window.location.href = "../dashboard/profile/";
          return;
        }

        // Tangani respons error — refresh captcha setelah setiap percobaan gagal
        const refreshCaptchaAfterError = (focusCaptcha = false) => {
          loadCaptcha();
          if (form.captchaAnswer) {
            form.captchaAnswer.value = "";
            if (focusCaptcha) form.captchaAnswer.focus();
          }
        };

        if (response.status === 422 && data.detail) {
          // Field error lokal: cegah modal popup, tampilkan inline
          if (message) message.textContent = "";
          handleValidationErrors(data.detail);
          refreshCaptchaAfterError();
        } else if (response.status === 409) {
          // Email atau kompetisi sudah terdaftar: tampilkan inline di bawah input terkait
          if (message) message.textContent = "";
          if (data.detail?.competition) {
            const compMsg = Array.isArray(data.detail.competition)
              ? data.detail.competition.join(". ")
              : String(data.detail.competition);
            setFieldError("competition", compMsg);
            compSelect?.focus();
          } else if (data.detail?.email) {
            setFieldError("email", "Email sudah terdaftar. Gunakan email lain atau silakan masuk.");
            form.email?.focus();
          } else {
            const errorText = typeof data.detail === "string" ? data.detail : "Data pendaftaran sudah terdaftar.";
            showAuthError(form, errorText);
          }
          refreshCaptchaAfterError();
        } else if (response.status === 400 && data.detail?.captcha) {
          // Captcha salah: tampilkan inline di bawah input captcha
          if (message) message.textContent = "";
          setFieldError("captchaAnswer", data.detail.captcha || "Jawaban verifikasi salah atau kedaluwarsa.");
          refreshCaptchaAfterError(true);
        } else if (response.status === 401) {
          // Kegagalan autentikasi kredensial -> alert dialog
          const text = typeof data.detail === "string" ? data.detail : "Email atau kata sandi salah.";
          showAuthError(form, text);
          refreshCaptchaAfterError();
        } else if (response.status === 423 && data.detail?.lockout) {
          // Akun dikunci (lockout) -> alert dialog
          showAuthError(form, data.detail.lockout);
          refreshCaptchaAfterError();
        } else if (response.status === 429) {
          // Rate limit -> alert dialog
          showAuthError(form, typeof data.detail === "string" ? data.detail : "Terlalu banyak percobaan. Coba lagi sebentar lagi.");
          refreshCaptchaAfterError();
        } else {
          showAuthError(form, typeof data.detail === "string" ? data.detail : "Terjadi kesalahan. Coba lagi.");
          refreshCaptchaAfterError();
        }
      } catch (error) {
        showAuthError(form, "Tidak dapat menghubungi server. Coba lagi nanti.");
        loadCaptcha();
        if (form.captchaAnswer) form.captchaAnswer.value = "";
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  });

  document.querySelectorAll(".tabs").forEach((tabs) => {
    const buttons = tabs.querySelectorAll(".tab");
    const panel = document.getElementById(tabs.querySelector(".tab").getAttribute("aria-controls"));
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((other) => {
          const selected = other === button;
          other.classList.toggle("is-active", selected);
          other.setAttribute("aria-selected", String(selected));
        });
        if (panel) panel.setAttribute("aria-labelledby", button.id);
      });
    });
  });

  document.querySelectorAll("[data-dash-form]").forEach((form) => {
    const status = form.querySelector("[data-dash-status]");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (status) status.textContent = "Perubahan profil siap dihubungkan ke layanan akun.";
    });

    form.querySelectorAll("[data-upload]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!status) return;
        status.textContent = "Unggah dokumen siap dihubungkan ke layanan penyimpanan.";
      });
    });
  });

  document.querySelectorAll("[data-logout]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      } catch (error) {
        /* tetap arahkan ke sign-in walau request logout gagal */
      }
      window.location.href = link.getAttribute("href");
    });
  });

  // ------------------------------------------------ dashboard: profil & tim

  const DASH_EMPTY = (label) => `${label} belum diisi`;

  const setPlaceholder = (el, text) => {
    if (el) el.textContent = text;
  };

  const dashboardRoot = document.querySelector("[data-dash-form='profile']");

  if (dashboardRoot) {
    const form = dashboardRoot;
    const inputs = {
      fullName: form.querySelector("input[name='fullName']"),
      institution: form.querySelector("input[name='institution']"),
      email: form.querySelector("input[name='email']"),
      phone: form.querySelector("input[name='phone']"),
      birthDate: form.querySelector("input[name='birthDate']"),
      instagram: form.querySelector("input[name='instagram']"),
    };
    const status = form.querySelector("[data-dash-status]");
    const avatar = document.querySelector(".dash-avatar");

    const displayDate = (iso) => {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    };
    const parseDate = (text) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
      return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
    };

    const fillForm = (user) => {
      inputs.fullName.value = user.full_name || "";
      inputs.institution.value = user.institution || "";
      inputs.email.value = user.email || "";
      inputs.phone.value = user.phone || "";
      inputs.birthDate.value = user.birth_date ? displayDate(user.birth_date) : "";
      inputs.instagram.value = user.instagram_handle || "";
      inputs.fullName.placeholder = user.full_name ? "" : DASH_EMPTY("Nama lengkap");
      inputs.institution.placeholder = user.institution ? "" : DASH_EMPTY("Institusi");
      inputs.phone.placeholder = user.phone ? "" : DASH_EMPTY("Nomor telepon");
      inputs.birthDate.placeholder = user.birth_date ? "" : "dd/mm/yyyy";
      inputs.instagram.placeholder = user.instagram_handle ? "" : DASH_EMPTY("Instagram");
      if (avatar && user.full_name) avatar.textContent = user.full_name.trim().charAt(0).toUpperCase();
    };

    let currentProfileUser = null;

    const renderTeam = (team, currentUser) => {
      const countEl = document.querySelector("[data-team-member-count]");
      const trackEl = document.querySelector("[data-team-track]");
      const codeEl = document.querySelector("[data-team-code]");
      const leaderEl = document.querySelector("[data-team-leader-name]");
      const membersEl = document.querySelector("[data-team-members]");
      const tpl = document.querySelector("[data-team-member-template]");

      const copyBtn = document.querySelector("[data-copy-code]");
      const typeBadge = document.querySelector("[data-comp-type-badge]");
      const quotaInfo = document.querySelector("[data-comp-quota-info]");
      const individualNotice = document.querySelector("[data-individual-notice]");
      const addMemberSection = document.querySelector("[data-add-member-section]");
      const joinTeamSection = document.querySelector("[data-join-team-section]");
      const leaveTeamSection = document.querySelector("[data-leave-team-section]");
      const leaveTeamBtn = document.querySelector("[data-leave-team-btn]");

      if (copyBtn && team && team.code) {
        copyBtn.onclick = async () => {
          try {
            await navigator.clipboard.writeText(team.code);
            copyBtn.textContent = "Tersalin!";
            setTimeout(() => { copyBtn.textContent = "Salin"; }, 2000);
          } catch (e) {
            prompt("Salin kode tim:", team.code);
          }
        };
      }

      if (!team) {
        setPlaceholder(countEl, "0 / 1");
        setPlaceholder(trackEl, "—");
        setPlaceholder(codeEl, "# belum ada tim");
        if (typeBadge) typeBadge.textContent = "BELUM ADA TIM";
        if (quotaInfo) quotaInfo.textContent = "";
        if (individualNotice) individualNotice.hidden = true;
        if (addMemberSection) addMemberSection.hidden = true;
        if (leaveTeamSection) leaveTeamSection.hidden = true;
        if (joinTeamSection) joinTeamSection.hidden = false;
        if (membersEl) {
          membersEl.innerHTML =
            '<p class="proof-hint" style="padding:.4rem 0">Belum tergabung dalam tim. Masukkan kode tim di bawah atau pilih kompetisi baru.</p>';
        }
        return;
      }

      const n = team.members ? team.members.length : 0;
      const maxM = team.max_team_members || Math.max(n, 1);
      const minM = team.min_team_members || 1;
      const isIndiv = team.participation_type === "INDIVIDUAL" || maxM <= 1;

      setPlaceholder(countEl, `${n} / ${maxM}`);
      setPlaceholder(trackEl, team.track || "—");
      setPlaceholder(codeEl, `# ${team.code}`);

      if (leaderEl) {
        const leader = team.members?.find((m) => m.role === "leader") || team.members?.[0];
        if (leader) leaderEl.textContent = leader.full_name;
      }

      if (typeBadge) {
        typeBadge.textContent = isIndiv ? "INDIVIDU (1 Peserta)" : `TIM (${minM}–${maxM} Orang)`;
      }
      if (quotaInfo) {
        quotaInfo.textContent = isIndiv ? "Kuota: 1 / 1 peserta" : `Kuota: ${n} / ${maxM} anggota terisi`;
      }

      // Atur visibilitas fitur anggota berdasarkan aturan kompetisi dan peran user
      if (isIndiv) {
        if (individualNotice) individualNotice.hidden = false;
        if (addMemberSection) addMemberSection.hidden = true;
        if (joinTeamSection) joinTeamSection.hidden = true;
        if (leaveTeamSection) leaveTeamSection.hidden = true;
      } else {
        if (individualNotice) individualNotice.hidden = true;

        if (team.role === "leader") {
          if (joinTeamSection) joinTeamSection.hidden = true;
          if (addMemberSection) {
            addMemberSection.hidden = false;
            const emailInput = addMemberSection.querySelector("input[name='memberEmail']");
            const submitBtn = addMemberSection.querySelector("button[type='submit']");
            const isFull = n >= maxM;
            if (emailInput) emailInput.disabled = isFull;
            if (submitBtn) submitBtn.disabled = isFull;
            const hint = addMemberSection.querySelector(".proof-hint");
            if (hint) {
              hint.textContent = isFull
                ? `Kuota tim sudah penuh (maksimal ${maxM} anggota). Keluarkan anggota terlebih dahulu bila ingin mengganti.`
                : `Undang anggota menggunakan email akun Perkutut Cup mereka (sisa kuota: ${maxM - n} orang):`;
            }
          }
          if (leaveTeamSection) {
            leaveTeamSection.hidden = false;
            if (leaveTeamBtn) {
              leaveTeamBtn.textContent = n === 1 ? "BUBARKAN TIM" : "KELUAR DARI TIM";
            }
          }
        } else {
          // Member biasa (bukan leader)
          if (addMemberSection) addMemberSection.hidden = true;
          if (joinTeamSection) joinTeamSection.hidden = true;
          if (leaveTeamSection) {
            leaveTeamSection.hidden = false;
            if (leaveTeamBtn) leaveTeamBtn.textContent = "KELUAR DARI TIM";
          }
        }
      }

      // Render daftar anggota
      if (membersEl && tpl) {
        membersEl.innerHTML = "";
        team.members.forEach((m) => {
          const node = tpl.content.cloneNode(true);
          const strong = node.querySelector("strong");
          const small = node.querySelector("small");
          const isCaller = currentUser && (m.user_id === currentUser.id || m.email === currentUser.email);

          strong.textContent = m.full_name;
          if (isCaller) {
            const badge = document.createElement("span");
            badge.className = "team-badge";
            badge.textContent = "YOU";
            strong.appendChild(badge);
          }
          small.textContent = `${m.role === "leader" ? "Team Leader" : "Member"}${m.institution ? " • " + m.institution : ""}`;

          // Tombol remove member khusus leader untuk anggota lain
          const removeBtn = node.querySelector("[data-remove-member]");
          if (removeBtn) {
            if (team.role === "leader" && m.role !== "leader" && !isCaller) {
              removeBtn.hidden = false;
              removeBtn.addEventListener("click", async () => {
                if (!confirm(`Keluarkan ${m.full_name} dari tim?`)) return;
                try {
                  const res = await fetch(`/api/team/members/${m.user_id}`, {
                    method: "DELETE",
                    credentials: "same-origin",
                  });
                  const resData = await res.json().catch(() => ({}));
                  if (res.ok) {
                    await reloadTeam();
                  } else {
                    alert(resData.detail || "Gagal mengeluarkan anggota tim.");
                  }
                } catch (err) {
                  alert("Tidak dapat menghubungi server.");
                }
              });
            } else {
              removeBtn.hidden = true;
            }
          }

          membersEl.appendChild(node);
        });
      }
    };

    const reloadTeam = async () => {
      try {
        const teamRes = await fetch("/api/team", { credentials: "same-origin" });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          renderTeam(teamData.team, currentProfileUser);
        }
      } catch (e) {}
    };

    (async () => {
      try {
        const [meRes, teamRes] = await Promise.all([
          fetch("/api/me", { credentials: "same-origin" }),
          fetch("/api/team", { credentials: "same-origin" }),
        ]);
        if (meRes.status === 401) {
          window.location.replace("/404.html");
          return;
        }
        const me = await meRes.json();
        currentProfileUser = me.user || {};
        fillForm(currentProfileUser);

        // Periksa RBAC admin untuk menu dashboard
        if (currentProfileUser.role === "admin") {
          document.querySelectorAll("[data-admin-nav]").forEach((el) => {
            el.hidden = false;
          });
          const asideTeamSmall = document.querySelector(".dash-team small");
          if (asideTeamSmall) asideTeamSmall.textContent = "ADMINISTRATOR";
        }

        // Metric registration: email terisi + terverifikasi sisi form = "Verified"
        setPlaceholder(document.querySelector("[data-registration-status]"),
          currentProfileUser.email ? "Verified" : "Belum lengkap");

        const teamData = await teamRes.json();
        renderTeam(teamData.team, currentProfileUser);
      } catch (error) {
        setPlaceholder(status, "Gagal memuat data profil.");
      }
    })();

    // Event listener: Tambah Anggota Tim
    const addMemberForm = document.querySelector("[data-add-member-form]");
    const addMemberStatus = document.querySelector("[data-add-member-status]");
    if (addMemberForm) {
      addMemberForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = addMemberForm.querySelector("input[name='memberEmail']");
        const emailVal = input?.value?.trim();
        if (!emailVal) return;

        if (addMemberStatus) {
          addMemberStatus.textContent = "Menambahkan anggota…";
          addMemberStatus.style.color = "var(--dash-text-muted)";
        }

        try {
          const res = await fetch("/api/team/members", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ email: emailVal }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            if (addMemberStatus) {
              addMemberStatus.textContent = data.message || "Anggota berhasil ditambahkan.";
              addMemberStatus.style.color = "#2ecc71";
            }
            if (input) input.value = "";
            await reloadTeam();
          } else {
            if (addMemberStatus) {
              addMemberStatus.textContent = data.detail || "Gagal menambahkan anggota.";
              addMemberStatus.style.color = "#e74c3c";
            }
          }
        } catch (err) {
          if (addMemberStatus) {
            addMemberStatus.textContent = "Tidak dapat menghubungi server.";
            addMemberStatus.style.color = "#e74c3c";
          }
        }
      });
    }

    // Event listener: Gabung Tim via Kode
    const joinTeamForm = document.querySelector("[data-join-team-form]");
    const joinTeamStatus = document.querySelector("[data-join-team-status]");
    if (joinTeamForm) {
      joinTeamForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = joinTeamForm.querySelector("input[name='teamCode']");
        const codeVal = input?.value?.trim().toUpperCase();
        if (!codeVal) return;

        if (joinTeamStatus) {
          joinTeamStatus.textContent = "Memverifikasi dan bergabung ke tim…";
          joinTeamStatus.style.color = "var(--dash-text-muted)";
        }

        try {
          const res = await fetch("/api/team/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ code: codeVal }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            if (joinTeamStatus) {
              joinTeamStatus.textContent = data.message || "Berhasil bergabung ke tim.";
              joinTeamStatus.style.color = "#2ecc71";
            }
            if (input) input.value = "";
            await reloadTeam();
          } else {
            if (joinTeamStatus) {
              joinTeamStatus.textContent = data.detail || "Gagal bergabung ke tim.";
              joinTeamStatus.style.color = "#e74c3c";
            }
          }
        } catch (err) {
          if (joinTeamStatus) {
            joinTeamStatus.textContent = "Tidak dapat menghubungi server.";
            joinTeamStatus.style.color = "#e74c3c";
          }
        }
      });
    }

    // Event listener: Keluar / Bubarkan Tim
    const leaveTeamBtn = document.querySelector("[data-leave-team-btn]");
    const leaveTeamStatus = document.querySelector("[data-leave-team-status]");
    if (leaveTeamBtn) {
      leaveTeamBtn.addEventListener("click", async () => {
        const isDisband = leaveTeamBtn.textContent.includes("BUBARKAN");
        const confirmMsg = isDisband
          ? "Apakah Anda yakin ingin membubarkan tim ini?"
          : "Apakah Anda yakin ingin keluar dari tim ini?";
        if (!confirm(confirmMsg)) return;

        if (leaveTeamStatus) {
          leaveTeamStatus.textContent = "Memproses…";
          leaveTeamStatus.style.color = "var(--dash-text-muted)";
        }

        try {
          const res = await fetch("/api/team/leave", {
            method: "POST",
            credentials: "same-origin",
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            if (leaveTeamStatus) {
              leaveTeamStatus.textContent = data.message || "Berhasil memproses permintaan tim.";
              leaveTeamStatus.style.color = "#2ecc71";
            }
            await reloadTeam();
          } else {
            if (leaveTeamStatus) {
              leaveTeamStatus.textContent = data.detail || "Gagal memproses permintaan tim.";
              leaveTeamStatus.style.color = "#e74c3c";
            }
          }
        } catch (err) {
          if (leaveTeamStatus) {
            leaveTeamStatus.textContent = "Tidak dapat menghubungi server.";
            leaveTeamStatus.style.color = "#e74c3c";
          }
        }
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;

      const birthISO = parseDate(inputs.birthDate.value);
      if (inputs.birthDate.value && !birthISO) {
        setPlaceholder(status, "Format tanggal lahir harus dd/mm/yyyy.");
        return;
      }

      const saveButton = form.querySelector(".btn-save");
      if (saveButton) saveButton.disabled = true;
      setPlaceholder(status, "Menyimpan perubahan...");

      try {
        const response = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            full_name: inputs.fullName.value.trim(),
            institution: inputs.institution.value.trim(),
            email: inputs.email.value.trim(),
            phone: inputs.phone.value.trim(),
            birth_date: birthISO,
            instagram_handle: inputs.instagram.value.trim(),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          fillForm(data.user || {});
          if (avatar && data.user.full_name) {
            avatar.textContent = data.user.full_name.trim().charAt(0).toUpperCase();
          }
          setPlaceholder(status, "Perubahan tersimpan.");
        } else if (response.status === 409) {
          setPlaceholder(status, "Email sudah dipakai akun lain.");
        } else if (response.status === 401) {
          window.location.replace("/404.html");
        } else {
          setPlaceholder(status, data.detail || "Gagal menyimpan. Coba lagi.");
        }
      } catch (error) {
        setPlaceholder(status, "Tidak dapat menghubungi server.");
      } finally {
        if (saveButton) saveButton.disabled = false;
      }
    });
  }

  document.querySelectorAll("[data-forgot-password]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const message = link.closest(".auth-card")?.querySelector("[data-auth-message]");
      if (message) message.textContent = "Lupa kata sandi? Silakan lapor admin untuk reset.";
    });
  });
})();
