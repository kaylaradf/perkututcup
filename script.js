(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    const password = form.querySelector('input[name="password"]');
    const confirmation = form.querySelector('input[name="confirmPassword"]');
    const message = form.querySelector("[data-auth-message]");
    const isJoinForm = form.dataset.authForm === "join";
    const passwordField = password?.closest(".auth-field");
    const passwordRules = passwordField?.querySelector(".password-rules");

    // ---- captcha perkalian: load soal, tombol refresh
    const captchaBox = form.querySelector("[data-captcha]");
    const captchaQuestion = form.querySelector("[data-captcha-question]");
    const loadCaptcha = async () => {
      if (!captchaBox || !captchaQuestion) return;
      captchaQuestion.textContent = "Memuat soal verifikasi…";
      try {
        const res = await fetch("/api/auth/captcha");
        const data = await res.json();
        captchaBox.dataset.captchaId = data.id;
        captchaQuestion.textContent = data.question;
      } catch {
        captchaQuestion.textContent = "Gagal memuat soal. Klik ikon untuk coba lagi.";
      }
    };
    loadCaptcha();
    form.querySelector("[data-captcha-refresh]")?.addEventListener("click", loadCaptcha);

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

    const meter = form.querySelector("[data-password-meter]");
    const meterFill = form.querySelector("[data-password-meter-fill]");
    const meterLabel = form.querySelector("[data-password-meter-label]");
    const PW_MIN = 15, PW_MAX = 64;

    const SCORE_LABELS = ["Sangat lemah", "Lemah", "Cukup", "Kuat", "Sangat kuat"];
    const SCORE_COLORS = ["#e5484d", "#e5784d", "#e2c34d", "#6bc26b", "#3fa650"];

    const validatePassword = () => {
      if (!password || !isJoinForm) return;
      const value = password.value;
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

      password.setCustomValidity(
        value && !isStrong
          ? `Gunakan minimal ${PW_MIN} karakter dan hindari kata sandi yang umum digunakan.`
          : ""
      );
    };

    const validateConfirmation = () => {
      if (!confirmation || !password) return;
      confirmation.setCustomValidity(
        confirmation.value && confirmation.value !== password.value
          ? "Kata sandi belum sama."
          : ""
      );
    };

    password?.addEventListener("input", () => {
      validatePassword();
      validateConfirmation();
    });
    password?.addEventListener("focus", () => {
      if (isJoinForm && passwordRules) passwordRules.hidden = false;
    });
    passwordField?.addEventListener("focusout", () => {
      if (!passwordField.contains(document.activeElement) && passwordRules) {
        passwordRules.hidden = true;
      }
    });
    confirmation?.addEventListener("input", validateConfirmation);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      validatePassword();
      validateConfirmation();
      if (!form.reportValidity()) return;

      const submitButton = form.querySelector(".auth-submit");
      if (submitButton) submitButton.disabled = true;
      if (message) {
        message.textContent = isJoinForm ? "Mendaftarkan akun..." : "Memverifikasi akun...";
      }

      const captchaId = form.querySelector("[data-captcha]")?.dataset.captchaId;
      const captchaAnswer = form.captchaAnswer?.value?.trim() || "";
      if (!captchaId || !captchaAnswer) {
        if (message) message.textContent = "Jawab soal verifikasi terlebih dahulu.";
        return;
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
            }
          : { email: form.email.value.trim(), password: password.value, captcha_id: captchaId, captcha_answer: captchaAnswer };

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));

        if (response.ok) {
          if (message) message.textContent = isJoinForm
            ? "Akun berhasil dibuat. Mengalihkan ke dashboard..."
            : "Login berhasil. Mengalihkan ke dashboard...";
          window.location.href = "../dashboard/profile/";
          return;
        }

        if (response.status === 422 && data.detail) {
          const first = Array.isArray(data.detail)
            ? data.detail.map((issue) => issue.msg).join(", ")
            : Object.values(data.detail).flat().join(", ");
          if (message) message.textContent = first || "Data formulir tidak valid.";
        } else if (response.status === 409) {
          if (message) message.textContent = "Email sudah terdaftar. Gunakan email lain.";
        } else if (response.status === 401) {
          if (message) message.textContent = data.detail || "Email atau kata sandi salah.";
        } else if (response.status === 400 && data.detail?.captcha) {
          if (message) message.textContent = data.detail.captcha;
          loadCaptcha();
          form.captchaAnswer.value = "";
        } else {
          if (message) message.textContent = data.detail || "Terjadi kesalahan. Coba lagi.";
        }
      } catch (error) {
        if (message) message.textContent = "Tidak dapat menghubungi server. Coba lagi nanti.";
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
        fillForm(me.user || {});

        // Metric registration: email terisi + terverifikasi sisi form = "Verified"
        setPlaceholder(document.querySelector("[data-registration-status]"),
          me.user && me.user.email ? "Verified" : "Belum lengkap");

        const teamData = await teamRes.json();
        const team = teamData.team;
        const countEl = document.querySelector("[data-team-member-count]");
        const trackEl = document.querySelector("[data-team-track]");
        const codeEl = document.querySelector("[data-team-code]");
        const leaderEl = document.querySelector("[data-team-leader-name]");
        const membersEl = document.querySelector("[data-team-members]");
        const tpl = document.querySelector("[data-team-member-template]");

        if (!team) {
          setPlaceholder(countEl, "0 / 1");
          setPlaceholder(trackEl, "—");
          setPlaceholder(codeEl, "# belum ada tim");
          if (membersEl) {
            membersEl.innerHTML =
              '<p class="proof-hint" style="padding:.4rem 0">Belum tergabung dalam tim. Data tim akan muncul di sini setelah kamu bergabung.</p>';
          }
        } else {
          const n = team.members.length;
          setPlaceholder(countEl, `${n} / ${Math.max(n, 1)}`);
          setPlaceholder(trackEl, team.track || "—");
          setPlaceholder(codeEl, `# ${team.code}`);
          if (leaderEl) {
            const leader = team.members.find((m) => m.role === "leader") || team.members[0];
            if (leader) leaderEl.textContent = leader.full_name;
          }
          if (membersEl && tpl) {
            membersEl.innerHTML = "";
            team.members.forEach((m) => {
              const node = tpl.content.cloneNode(true);
              const strong = node.querySelector("strong");
              const small = node.querySelector("small");
              strong.textContent = m.full_name;
              if (m.role === "leader") {
                const badge = document.createElement("span");
                badge.className = "team-badge";
                badge.textContent = "YOU";
                strong.appendChild(badge);
              }
              small.textContent = `${m.role === "leader" ? "Team Leader" : "Member"}${m.institution ? " • " + m.institution : ""}`;
              membersEl.appendChild(node);
            });
          }
        }
      } catch (error) {
        setPlaceholder(status, "Gagal memuat data profil.");
      }
    })();

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
