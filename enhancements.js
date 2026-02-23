(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const queryAll = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const normalizeAssetUrl = (value) => {
    if (!value) return "";
    const url = value.trim();
    if (!url) return "";
    if (url.startsWith("//")) return `https:${url}`;
    return url;
  };

  const looksLikePlaceholder = (src) => {
    if (!src) return true;
    return src.includes("transparent_placeholder") || src.startsWith("data:image/gif");
  };

  const getReadableName = (raw) => {
    const text = (raw || "").trim();
    if (!text) return "";
    if (text.toLowerCase().includes("logo")) return text;
    if (text.length < 2) return "";
    return text;
  };

  const revealOnScroll = () => {
    const revealTargets = queryAll(
      'section[data-ux="Section"], [data-ux="GridCell"], [data-aid*="_CELL_RENDERED"], [data-aid*="_CARD_RENDERED"]'
    ).filter((el) => !el.closest('[data-aid="HEADER_SECTION"]'));

    revealTargets.forEach((el, index) => {
      el.classList.add("reveal-item");
      el.style.setProperty("--reveal-delay", `${Math.min((index % 8) * 45, 315)}ms`);
    });

    if (reducedMotion || !("IntersectionObserver" in window)) {
      revealTargets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    revealTargets.forEach((el) => observer.observe(el));
  };

  const collectPartnerItems = (scope) => {
    const linkedNodes = queryAll("a", scope).filter((a) => a.querySelector("img"));
    const standaloneImageNodes = queryAll("img", scope)
      .filter((img) => !img.closest("a"))
      .map((img) => img);
    const rawNodes = [...linkedNodes, ...standaloneImageNodes];

    const seen = new Set();
    const items = [];

    const extractFromSrcset = (value) => {
      if (!value) return "";
      const parts = String(value)
        .split(",")
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean);
      return parts.find((src) => !looksLikePlaceholder(src)) || "";
    };

    const resolveImageSource = (img) => {
      const picture = img.closest("picture");
      const sourceTag = picture ? picture.querySelector("source") : null;
      const candidates = [
        img.getAttribute("data-srclazy"),
        img.getAttribute("data-src"),
        img.getAttribute("data-original"),
        img.getAttribute("src"),
        img.getAttribute("srcset"),
        sourceTag ? sourceTag.getAttribute("srcset") : "",
        picture ? picture.getAttribute("data-srclazy") : "",
      ];

      for (const candidate of candidates) {
        if (!candidate) continue;
        const parsed = candidate.includes(",") || candidate.includes(" ")
          ? extractFromSrcset(candidate)
          : candidate;
        const src = normalizeAssetUrl(parsed);
        if (src && !looksLikePlaceholder(src)) return src;
      }
      return "";
    };

    rawNodes.forEach((node) => {
      const img = node.tagName === "IMG" ? node : node.querySelector("img");
      if (!img) return;

      const src = resolveImageSource(img);
      if (!src || looksLikePlaceholder(src)) return;

      const href = node.tagName === "A" ? node.getAttribute("href") || "" : "";
      const key = `${src}|${href}`;
      if (seen.has(key)) return;
      seen.add(key);

      const alt = getReadableName(img.getAttribute("alt") || "");
      items.push({ src, href, alt });
    });

    return items;
  };

  const getSectionByHeading = (pattern) => {
    const heading = queryAll('h1, h2, h3, h4, [data-ux*="Heading"]').find((el) =>
      pattern.test((el.textContent || "").trim())
    );
    if (!heading) return null;
    return heading.closest('section[data-ux="Section"]') || heading.closest("section") || heading.parentElement;
  };

  const removeLegacyPartnerLayout = (section) => {
    const targets = queryAll(
      '[data-aid="LOGO_ROWS_CONTAINER"], [id^="gallery4-"], [data-aid^="GALLERY_IMAGE"], [data-aid^="GALLERY_IMAGE"][data-aid$="_CELL_RENDERED"], [data-ux="Element"][id^="bs-9"]',
      section
    );
    if (!targets.length) return;

    targets.forEach((el) => {
      const keepSectionHeading = el.matches('[data-aid="GALLERY_SECTION_TITLE_RENDERED"]');
      if (!keepSectionHeading) el.remove();
    });
  };

  const createCarouselItem = (item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "partner-carousel__item";

    const cardTag = item.href ? "a" : "div";
    const card = document.createElement(cardTag);
    card.className = "partner-carousel__card";

    if (item.href) {
      card.setAttribute("href", item.href);
      if (/^https?:\/\//i.test(item.href)) {
        card.setAttribute("target", "_blank");
        card.setAttribute("rel", "noopener noreferrer");
      }
    }

    const image = document.createElement("img");
    image.className = "partner-carousel__logo";
    image.src = item.src;
    image.alt = item.alt || "Partner logo";
    image.loading = "lazy";
    image.decoding = "async";

    if (item.alt) {
      card.title = item.alt;
      card.setAttribute("aria-label", item.alt);
    }

    card.appendChild(image);
    wrapper.appendChild(card);
    return wrapper;
  };

  const enableCarouselMotion = (root, viewport, track) => {
    let raf = 0;
    let last = 0;
    let paused = false;
    let isDragging = false;
    let startX = 0;
    let startScroll = 0;
    let dragMoved = false;
    const speedPxPerMs = 0.052;

    const pause = () => {
      paused = true;
    };

    const play = () => {
      paused = false;
    };

    const ensureLoopFill = () => {
      const children = Array.from(track.children);
      if (!children.length) return;
      let guard = 0;
      // Ensure there is enough content width to produce visible marquee motion.
      while (track.scrollWidth < viewport.clientWidth * 2.4 && guard < 20) {
        children.forEach((child) => track.appendChild(child.cloneNode(true)));
        guard += 1;
      }
    };

    ensureLoopFill();
    window.addEventListener("resize", ensureLoopFill, { passive: true });

    const loop = (ts) => {
      if (!last) last = ts;
      const dt = ts - last;
      last = ts;

      if (!paused) {
        viewport.scrollLeft += dt * speedPxPerMs;
        const resetPoint = track.scrollWidth / 2;
        if (viewport.scrollLeft >= resetPoint) {
          viewport.scrollLeft -= resetPoint;
        }
      }

      raf = window.requestAnimationFrame(loop);
    };

    root.addEventListener("mouseenter", pause);
    root.addEventListener("mouseleave", play);
    root.addEventListener("focusin", pause);
    root.addEventListener("focusout", (event) => {
      if (!root.contains(event.relatedTarget)) play();
    });

    viewport.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      pause();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      viewport.scrollBy({ left: direction * 260, behavior: "smooth" });
    });

    viewport.addEventListener("pointerdown", (event) => {
      isDragging = true;
      dragMoved = false;
      pause();
      viewport.classList.add("is-dragging");
      startX = event.clientX;
      startScroll = viewport.scrollLeft;
      viewport.setPointerCapture?.(event.pointerId);
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!isDragging) return;
      const delta = event.clientX - startX;
      if (Math.abs(delta) > 3) dragMoved = true;
      viewport.scrollLeft = startScroll - delta;
    });

    const stopDrag = (event) => {
      if (!isDragging) return;
      isDragging = false;
      viewport.classList.remove("is-dragging");
      viewport.releasePointerCapture?.(event.pointerId);
      play();
    };

    viewport.addEventListener("pointerup", stopDrag);
    viewport.addEventListener("pointercancel", stopDrag);
    viewport.addEventListener("pointerleave", () => {
      if (isDragging) {
        isDragging = false;
        viewport.classList.remove("is-dragging");
        play();
      }
    });

    viewport.addEventListener(
      "click",
      (event) => {
        if (!dragMoved) return;
        event.preventDefault();
        event.stopPropagation();
        dragMoved = false;
      },
      true
    );

    raf = window.requestAnimationFrame(loop);
    root.dataset.carouselRaf = String(raf);
  };

  const buildPartnerCarousel = (section, label) => {
    if (!section || section.dataset.partnerCarouselEnhanced === "1") return;

    const items = collectPartnerItems(section);
    if (items.length < 2) return;

    removeLegacyPartnerLayout(section);

    const carousel = document.createElement("div");
    carousel.className = "partner-carousel";
    carousel.setAttribute("role", "region");
    carousel.setAttribute("aria-label", `${label} carousel`);

    const viewport = document.createElement("div");
    viewport.className = "partner-carousel__viewport";
    viewport.tabIndex = 0;

    const track = document.createElement("div");
    track.className = "partner-carousel__track";

    const baseItems = items.map(createCarouselItem);
    baseItems.forEach((el) => track.appendChild(el));

    if (!reducedMotion) {
      baseItems.forEach((el) => track.appendChild(el.cloneNode(true)));
    } else {
      carousel.classList.add("is-reduced-motion");
    }

    viewport.appendChild(track);
    carousel.appendChild(viewport);
    section.appendChild(carousel);

    if (!reducedMotion) {
      enableCarouselMotion(carousel, viewport, track);
    }

    if (/premier(e)?\s+partners/i.test(label)) {
      // Keep the section title and carousel only.
      queryAll(
        '[data-aid="LOGO_ROWS_CONTAINER"], [id^="gallery4-"], [data-aid^="GALLERY_IMAGE"], [data-ux="Element"][id^="bs-9"]',
        section
      ).forEach((el) => el.remove());
    }

    section.dataset.partnerCarouselEnhanced = "1";
  };

  const initPartnerCarousels = () => {
    const ourPartnersSection = getSectionByHeading(/our\s+partners/i);
    const premierPartnersSection = getSectionByHeading(/premier(e)?\s+partners/i);

    buildPartnerCarousel(ourPartnersSection, "Our Partners");
    buildPartnerCarousel(premierPartnersSection, "Premier Partners");
  };

  const init = () => {
    revealOnScroll();
    initPartnerCarousels();
    initChatbot();
  };

  const initChatbot = () => {
    if (document.querySelector(".itrm-chatbot")) return;

    const getKnowledgeChunks = () => {
      const nodes = queryAll("h1, h2, h3, h4, p, li");
      const chunks = [];
      const seen = new Set();
      nodes.forEach((node) => {
        const text = (node.textContent || "").replace(/\s+/g, " ").trim();
        if (text.length < 24) return;
        if (text.length > 380) return;
        if (seen.has(text)) return;
        seen.add(text);
        chunks.push(text);
      });
      return chunks.slice(0, 280);
    };

    const extractContacts = () => {
      const phone = queryAll("a[href^='tel:']")[0]?.textContent?.trim();
      const address = queryAll("[data-aid='FOOTER_ADDRESS_RENDERED'], p")
        .map((el) => (el.textContent || "").trim())
        .find((t) => /,\s*GA\b|Winder/i.test(t));
      return { phone, address };
    };

    const knowledge = getKnowledgeChunks();
    const contacts = extractContacts();

    const tokenize = (text) =>
      (text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);

    const scoreChunk = (queryTokens, chunk) => {
      const words = tokenize(chunk);
      if (!words.length) return 0;
      const wordSet = new Set(words);
      let score = 0;
      queryTokens.forEach((token) => {
        if (wordSet.has(token)) score += 1;
      });
      return score;
    };

    const answer = (question) => {
      const q = (question || "").trim();
      if (!q) return "Posez-moi une question sur le site (services, contact, candidatures, partenaires, etc.).";

      const lower = q.toLowerCase();
      if (/phone|tel|contact|num|appel|telephone/.test(lower) && contacts.phone) {
        return `Vous pouvez les contacter au ${contacts.phone}.`;
      }
      if (/adresse|address|where|location|localisation/.test(lower) && contacts.address) {
        return `Adresse trouvée sur le site: ${contacts.address}`;
      }

      const tokens = tokenize(q);
      const ranked = knowledge
        .map((chunk) => ({ chunk, score: scoreChunk(tokens, chunk) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2);

      if (!ranked.length) {
        return "Je n’ai pas trouvé d’info précise dans cette page. Essayez avec des mots-clés comme services, apply, employers, job seekers, contact.";
      }

      return ranked.map((r) => r.chunk).join(" ");
    };

    const root = document.createElement("div");
    root.className = "itrm-chatbot";
    root.innerHTML = `
      <div class="itrm-chatbot__panel" role="dialog" aria-label="ITRM Chatbot">
        <div class="itrm-chatbot__head">ITRM Assistant</div>
        <div class="itrm-chatbot__msgs" id="itrmChatMsgs">
          <p class="itrm-chatbot__msg bot">Bonjour. Je peux répondre aux questions basiques à partir du contenu de cette page.</p>
        </div>
        <form class="itrm-chatbot__form" id="itrmChatForm">
          <input class="itrm-chatbot__input" id="itrmChatInput" type="text" placeholder="Posez votre question..." />
          <button class="itrm-chatbot__send" type="submit">Envoyer</button>
        </form>
      </div>
      <button class="itrm-chatbot__toggle" type="button" id="itrmChatToggle" aria-expanded="false">Chat</button>
    `;
    document.body.appendChild(root);

    const panel = root.querySelector(".itrm-chatbot__panel");
    const toggle = root.querySelector("#itrmChatToggle");
    const form = root.querySelector("#itrmChatForm");
    const input = root.querySelector("#itrmChatInput");
    const msgs = root.querySelector("#itrmChatMsgs");

    const addMsg = (text, role) => {
      const p = document.createElement("p");
      p.className = `itrm-chatbot__msg ${role}`;
      p.textContent = text;
      msgs.appendChild(p);
      msgs.scrollTop = msgs.scrollHeight;
    };

    toggle.addEventListener("click", () => {
      const open = root.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      if (open) input.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      const a = answer(q);
      addMsg(a, "bot");
      input.value = "";
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
