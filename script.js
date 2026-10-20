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
    const invalidCharacters = {
      name: /[^\p{L}\p{M} .'’-]/gu,
      email: /[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g,
      identifier: /[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g,
      password: /[^\x20-\x7E]/g,
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

    const validatePassword = () => {
      if (!password || !isJoinForm) return;
      const value = password.value;
      const checks = {
        length: value.length >= 8,
        lowercase: /[a-z]/.test(value),
        uppercase: /[A-Z]/.test(value),
        number: /\d/.test(value),
        symbol: /[^A-Za-z0-9\s]/.test(value),
      };
      const isStrong = Object.values(checks).every(Boolean);

      passwordRules?.querySelectorAll("[data-password-rule]").forEach((rule) => {
        const met = checks[rule.dataset.passwordRule];
        rule.classList.toggle("is-met", met);
        const marker = rule.querySelector("span");
        if (marker) marker.textContent = met ? "✓" : "○";
      });

      password.setCustomValidity(
        value && !isStrong
          ? "Gunakan minimal 8 karakter dengan huruf besar, huruf kecil, angka, dan simbol."
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

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      validatePassword();
      validateConfirmation();
      if (!form.reportValidity()) return;

      if (message) {
        message.textContent = form.dataset.authForm === "join"
          ? "Formulir siap dihubungkan ke layanan pendaftaran."
          : "Formulir siap dihubungkan ke layanan akun.";
      }
    });
  });

  document.querySelectorAll("[data-forgot-password]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const message = link.closest(".auth-card")?.querySelector("[data-auth-message]");
      if (message) message.textContent = "Pemulihan kata sandi belum tersedia.";
    });
  });
})();
