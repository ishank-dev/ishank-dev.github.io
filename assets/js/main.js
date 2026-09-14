/* =====================================================================
   main.js — interaction layer
   Theme, scroll-spy nav, command palette, pointer tilt, project filter,
   Medium feed, contact form, reveal-on-scroll, back-to-top.
   No dependencies.
   ===================================================================== */

(function () {
  'use strict';

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* =================================================================
     THEME
     ================================================================= */

  const themeBtn = $('[data-theme-toggle]');

  function setTheme(mode, persist) {
    root.classList.toggle('dark', mode === 'dark');
    root.classList.toggle('light', mode === 'light');
    if (themeBtn) {
      themeBtn.setAttribute('aria-label',
        'Switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' theme');
    }
    if (window.Scene && window.Scene.setTheme) window.Scene.setTheme(mode === 'dark');
    if (persist) {
      try { localStorage.setItem('theme', mode); } catch (e) { /* private mode */ }
    }
  }

  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* ignore */ }
  setTheme(saved === 'light' ? 'light' : 'dark', false);

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      setTheme(root.classList.contains('dark') ? 'light' : 'dark', true);
    });
  }

  /* =================================================================
     YEAR
     ================================================================= */

  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* =================================================================
     REVEAL ON SCROLL
     ================================================================= */

  let revealObserver = null;

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
  }

  function observeReveals(scope) {
    const items = $$('.reveal:not(.is-in)', scope || document);
    if (!revealObserver) { items.forEach(el => el.classList.add('is-in')); return; }
    items.forEach(el => revealObserver.observe(el));
  }

  observeReveals();

  /* =================================================================
     SCROLL: progress bar, sticky header, scroll-spy, scene shapes
     ================================================================= */

  const progressEl = $('[data-progress]');
  const topbar = $('[data-topbar]');
  const toTop = $('[data-to-top]');
  const navLinks = $$('[data-navlink]');
  const sections = $$('main section[id]');

  let lastY = window.scrollY;
  let ticking = false;
  let currentId = '';
  let currentShape = -1;

  function onScrollFrame() {
    ticking = false;
    const y = window.scrollY;
    const docH = document.documentElement.scrollHeight - window.innerHeight;

    // progress
    if (progressEl) {
      progressEl.style.transform = 'scaleX(' + (docH > 0 ? Math.min(y / docH, 1) : 0) + ')';
    }

    // header: solid after hero, hidden while scrolling down
    if (topbar) {
      topbar.classList.toggle('is-stuck', y > 40);
      const goingDown = y > lastY && y > 420;
      topbar.classList.toggle('is-hidden', goingDown && !paletteOpen && !sheetOpen);
    }

    if (toTop) {
      const show = y > window.innerHeight * 0.9;
      if (show === toTop.hidden) toTop.hidden = !show;
    }

    // the point cloud steps back once you leave the hero
    root.classList.toggle('past-hero', y > window.innerHeight * 0.6);

    // scroll-spy — the section occupying the middle of the viewport wins
    const line = y + window.innerHeight * 0.38;
    let active = sections[0];
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= line) active = sections[i];
    }

    if (active && active.id !== currentId) {
      currentId = active.id;
      navLinks.forEach(function (a) {
        const on = a.getAttribute('href') === '#' + currentId;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });

      // hand the scene its shape for this section
      const shape = parseInt(active.getAttribute('data-shape'), 10);
      if (!isNaN(shape) && shape !== currentShape && window.Scene) {
        currentShape = shape;
        window.Scene.setShape(shape);
      }
    }

    // camera drifts back as you descend, so the cloud recedes behind content
    if (window.Scene) {
      const t = docH > 0 ? y / docH : 0;
      window.Scene.setCamera(-t * 0.9, 6.6 + t * 2.1);
    }

    lastY = y;
  }

  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScrollFrame();

  /* smooth in-page links, with focus moved for keyboard users */
  document.addEventListener('click', function (e) {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;

    e.preventDefault();
    closeSheet();
    target.scrollIntoView({
      behavior: reduceMotion.matches ? 'auto' : 'smooth',
      block: 'start'
    });
    target.setAttribute('tabindex', '-1');
    setTimeout(function () { target.focus({ preventScroll: true }); }, 420);
    history.replaceState(null, '', '#' + id);
  });

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    });
  }

  /* =================================================================
     MOBILE SHEET
     ================================================================= */

  const sheet = $('[data-sheet]');
  const menuBtn = $('[data-menu-toggle]');
  let sheetOpen = false;

  function openSheet() {
    if (!sheet) return;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('is-open'));
    menuBtn.setAttribute('aria-expanded', 'true');
    menuBtn.setAttribute('aria-label', 'Close menu');
    document.body.classList.add('no-scroll');
    sheetOpen = true;
  }

  function closeSheet() {
    if (!sheet || !sheetOpen) return;
    sheet.classList.remove('is-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('no-scroll');
    sheetOpen = false;
    setTimeout(function () { if (!sheetOpen) sheet.hidden = true; }, 260);
  }

  if (menuBtn) {
    menuBtn.addEventListener('click', function () {
      sheetOpen ? closeSheet() : openSheet();
    });
  }

  /* =================================================================
     POINTER TILT  (3D cards)
     ================================================================= */

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (canHover && !reduceMotion.matches) {
    $$('[data-tilt]').forEach(function (el) {
      let raf = 0, rx = 0, ry = 0, gx = 50, gy = 50;

      function apply() {
        raf = 0;
        el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
        el.style.setProperty('--gx', gx.toFixed(1) + '%');
        el.style.setProperty('--gy', gy.toFixed(1) + '%');
      }

      el.addEventListener('pointermove', function (e) {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry = (px - 0.5) * 11;
        rx = (0.5 - py) * 9;
        gx = px * 100;
        gy = py * 100;
        el.classList.add('is-tilting');
        if (!raf) raf = requestAnimationFrame(apply);
      });

      el.addEventListener('pointerleave', function () {
        rx = ry = 0; gx = gy = 50;
        el.classList.remove('is-tilting');
        if (!raf) raf = requestAnimationFrame(apply);
      });
    });
  }

  /* =================================================================
     PROJECT FILTER
     ================================================================= */

  const filterBtns = $$('[data-filter]');
  const projects = $$('.project');
  const emptyState = $('[data-empty]');

  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const cat = btn.getAttribute('data-filter');
      let shown = 0;

      filterBtns.forEach(function (b) {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });

      projects.forEach(function (p, i) {
        const match = cat === 'all' || p.getAttribute('data-cat') === cat;
        p.classList.toggle('is-shown', match);
        p.style.setProperty('--i', String(i));
        if (match) shown++;
      });

      if (emptyState) emptyState.hidden = shown > 0;
      if (window.Scene) window.Scene.pulse();
    });
  });

  /* =================================================================
     COPY TO CLIPBOARD + TOAST
     ================================================================= */

  const toast = $('[data-toast]');
  let toastTimer = 0;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-on');
      setTimeout(function () { toast.hidden = true; }, 300);
    }, 2200);
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.getAttribute('data-copy');

    const done = function () { showToast('Copied ' + text); btn.classList.add('did-copy');
      setTimeout(() => btn.classList.remove('did-copy'), 1400); };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }

    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); }
      catch (err) { showToast(text); }
      document.body.removeChild(ta);
    }
  });

  /* =================================================================
     COMMAND PALETTE
     ================================================================= */

  const palette = $('[data-palette]');
  const paletteInput = $('[data-palette-input]');
  const paletteList = $('[data-palette-list]');
  let paletteOpen = false;
  let paletteIndex = 0;
  let paletteItems = [];
  let lastFocused = null;

  const COMMANDS = [
    { label: 'About', hint: 'Section', href: '#about', kind: 'section' },
    { label: 'Work & experience', hint: 'Section', href: '#work', kind: 'section' },
    { label: 'Projects', hint: 'Section', href: '#projects', kind: 'section' },
    { label: 'Writing', hint: 'Section', href: '#writing', kind: 'section' },
    { label: 'Awards', hint: 'Section', href: '#awards', kind: 'section' },
    { label: 'Contact', hint: 'Section', href: '#contact', kind: 'section' },
    { label: 'Ella AI Assistant', hint: 'Project · Vertex AI, RAG', href: 'https://github.com/ishank-dev/google-adk-hackathon', kind: 'project' },
    { label: 'Semantic Data Navigator', hint: 'Project · LangChain, ChromaDB', href: 'https://github.com/ishank-dev/semantic-data-navigator/tree/main', kind: 'project' },
    { label: 'CECS 551 AI Coursework', hint: 'Project · PyTorch', href: 'https://github.com/ishank-dev/CECS_CSULB_2026/tree/main/CECS_551_AI', kind: 'project' },
    { label: 'Firebolt Geospatial Analytics', hint: 'Project · Firebolt, Mapbox', href: 'https://github.com/ishank-dev/firebolt-demo/tree/main/geospatial-application-demo', kind: 'project' },
    { label: 'Mock Server Framework', hint: 'Project · Node.js', href: 'https://github.com/ishank-dev/NodeJS-MockServer', kind: 'project' },
    { label: 'Police Beats Allocation', hint: 'Project · Django REST', href: 'https://github.com/On-Duty-Org/Beats-Allocation-SIH', kind: 'project' },
    { label: 'Download résumé', hint: 'Link · Google Drive', href: 'https://drive.google.com/file/d/1404iiQMMYz3IyRc-CMJpiAF6XFwhwEYf/view?usp=sharing', kind: 'link' },
    { label: 'GitHub — @ishank-dev', hint: 'Link', href: 'https://github.com/ishank-dev', kind: 'link' },
    { label: 'LinkedIn', hint: 'Link', href: 'https://www.linkedin.com/in/ishank-sharma-438a32144/', kind: 'link' },
    { label: 'Medium — @ishankdev', hint: 'Link', href: 'https://medium.com/@ishankdev', kind: 'link' },
    { label: 'Email ishankdev@gmail.com', hint: 'Action · opens mail client', href: 'mailto:ishankdev@gmail.com', kind: 'link' },
    { label: 'Copy email address', hint: 'Action', copy: 'ishankdev@gmail.com', kind: 'action' },
    { label: 'Toggle theme', hint: 'Action', action: 'theme', kind: 'action' }
  ];

  function score(cmd, q) {
    if (!q) return 1;
    const hay = (cmd.label + ' ' + cmd.hint).toLowerCase();
    if (hay.indexOf(q) === 0) return 3;
    if (hay.indexOf(q) > -1) return 2;
    // loose subsequence match: "sdn" matches "Semantic Data Navigator"
    let i = 0;
    for (let c = 0; c < hay.length && i < q.length; c++) {
      if (hay[c] === q[i]) i++;
    }
    return i === q.length ? 1 : 0;
  }

  function renderPalette(q) {
    const query = (q || '').trim().toLowerCase();
    paletteItems = COMMANDS
      .map(function (c) { return { cmd: c, s: score(c, query) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .map(function (r) { return r.cmd; });

    paletteIndex = 0;
    paletteList.innerHTML = paletteItems.length
      ? paletteItems.map(function (c, i) {
          return '<li role="option" aria-selected="' + (i === 0) + '"' +
            ' class="palette-item' + (i === 0 ? ' is-sel' : '') + '" data-i="' + i + '">' +
            '<span class="pi-kind pi-' + c.kind + '">' + c.kind + '</span>' +
            '<span class="pi-label">' + c.label + '</span>' +
            '<span class="pi-hint">' + c.hint + '</span></li>';
        }).join('')
      : '<li class="palette-empty">No matches. Try “projects” or “résumé”.</li>';
  }

  function moveSelection(delta) {
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
    $$('.palette-item', paletteList).forEach(function (el, i) {
      const on = i === paletteIndex;
      el.classList.toggle('is-sel', on);
      el.setAttribute('aria-selected', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function runCommand(cmd) {
    if (!cmd) return;
    closePalette();

    if (cmd.action === 'theme') {
      setTheme(root.classList.contains('dark') ? 'light' : 'dark', true);
      return;
    }
    if (cmd.copy) {
      const b = document.createElement('button');
      b.setAttribute('data-copy', cmd.copy);
      b.style.display = 'none';
      document.body.appendChild(b);
      b.click();
      document.body.removeChild(b);
      return;
    }
    if (cmd.href && cmd.href.charAt(0) === '#') {
      const t = document.getElementById(cmd.href.slice(1));
      if (t) {
        t.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        t.setAttribute('tabindex', '-1');
        setTimeout(function () { t.focus({ preventScroll: true }); }, 420);
      }
      return;
    }
    if (cmd.href && cmd.href.indexOf('mailto:') === 0) {
      window.location.href = cmd.href;
      return;
    }
    if (cmd.href) window.open(cmd.href, '_blank', 'noopener');
  }

  function openPalette() {
    if (!palette || paletteOpen) return;
    lastFocused = document.activeElement;
    palette.hidden = false;
    requestAnimationFrame(function () { palette.classList.add('is-open'); });
    paletteInput.value = '';
    renderPalette('');
    paletteInput.focus();
    document.body.classList.add('no-scroll');
    paletteOpen = true;
  }

  function closePalette() {
    if (!palette || !paletteOpen) return;
    palette.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    paletteOpen = false;
    setTimeout(function () { if (!paletteOpen) palette.hidden = true; }, 200);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  $$('[data-open-palette]').forEach(function (b) { b.addEventListener('click', openPalette); });
  $$('[data-palette-close]').forEach(function (b) { b.addEventListener('click', closePalette); });

  if (paletteInput) {
    paletteInput.addEventListener('input', function () { renderPalette(this.value); });

    paletteInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runCommand(paletteItems[paletteIndex]); }
      else if (e.key === 'Tab') {
        // keep focus inside the dialog
        e.preventDefault();
      }
    });
  }

  if (paletteList) {
    paletteList.addEventListener('click', function (e) {
      const li = e.target.closest('.palette-item');
      if (li) runCommand(paletteItems[parseInt(li.getAttribute('data-i'), 10)]);
    });
    paletteList.addEventListener('pointermove', function (e) {
      const li = e.target.closest('.palette-item');
      if (!li) return;
      const i = parseInt(li.getAttribute('data-i'), 10);
      if (i !== paletteIndex) moveSelection(i - paletteIndex);
    });
  }

  document.addEventListener('keydown', function (e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) ||
      e.target.isContentEditable;

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      paletteOpen ? closePalette() : openPalette();
      return;
    }
    if (e.key === '/' && !typing && !paletteOpen) {
      e.preventDefault();
      openPalette();
      return;
    }
    if (e.key === 'Escape') {
      if (paletteOpen) closePalette();
      else if (sheetOpen) closeSheet();
    }
  });

  /* =================================================================
     CONTACT FORM  (validates, then hands off to the mail client)
     ================================================================= */

  const form = $('[data-form]');
  const status = $('[data-form-status]');

  if (form) {
    const setError = function (name, msg) {
      const field = form.elements[name];
      const slot = $('[data-error-for="' + name + '"]', form);
      if (slot) slot.textContent = msg || '';
      if (field) {
        field.classList.toggle('has-error', !!msg);
        field.setAttribute('aria-invalid', msg ? 'true' : 'false');
      }
      return !msg;
    };

    ['name', 'email', 'message'].forEach(function (n) {
      const f = form.elements[n];
      if (f) f.addEventListener('input', function () { setError(n, ''); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = form.elements.name.value.trim();
      const email = form.elements.email.value.trim();
      const subject = form.elements.subject.value.trim();
      const message = form.elements.message.value.trim();

      let ok = true;
      ok = setError('name', name ? '' : 'Tell me who you are.') && ok;
      ok = setError('email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
        ? '' : 'That email address looks off.') && ok;
      ok = setError('message', message.length >= 10
        ? '' : 'A little more detail would help.') && ok;

      if (!ok) {
        const firstBad = $('.has-error', form);
        if (firstBad) firstBad.focus();
        if (status) status.textContent = 'Check the highlighted fields.';
        return;
      }

      const body = 'From: ' + name + '\nEmail: ' + email + '\n\n' + message;
      window.location.href = 'mailto:ishankdev@gmail.com' +
        '?subject=' + encodeURIComponent(subject || ('Portfolio message from ' + name)) +
        '&body=' + encodeURIComponent(body);

      if (status) status.textContent = 'Opening your mail client…';
      form.reset();
    });
  }

  /* =================================================================
     MEDIUM FEED
     ================================================================= */

  const postsList = $('[data-posts-list]');
  const postsLoading = $('[data-posts-loading]');
  const postsError = $('[data-posts-error]');
  let postsLoaded = false;

  function showPostsError() {
    if (postsLoading) postsLoading.hidden = true;
    if (postsError) postsError.hidden = false;
  }

  function renderPosts(items) {
    const html = items.slice(0, 4).map(function (a, i) {
      const img = (a.thumbnail && /^https?:/.test(a.thumbnail))
        ? a.thumbnail
        : ((a.content || '').match(/<img[^>]+src="([^">]+)"/) || [])[1];

      const text = (a.description || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 150) + '…';

      const date = new Date(a.pubDate).toLocaleDateString('en-US',
        { year: 'numeric', month: 'short', day: 'numeric' });

      const words = (a.content || '').replace(/<[^>]*>/g, ' ').split(/\s+/).length;
      const mins = Math.max(1, Math.round(words / 220));

      return '<li class="post reveal" style="--d:' + (i * 70) + 'ms">' +
        '<a href="' + a.link + '" target="_blank" rel="noopener">' +
          (img ? '<div class="post-media"><img src="' + img + '" alt="" loading="lazy"></div>' : '') +
          '<div class="post-body">' +
            '<p class="post-meta"><time datetime="' + a.pubDate + '">' + date + '</time>' +
            '<span aria-hidden="true">·</span>' + mins + ' min read</p>' +
            '<h3 class="post-title">' + a.title + '</h3>' +
            '<p class="post-text">' + text + '</p>' +
            '<span class="post-link">Read on Medium</span>' +
          '</div>' +
        '</a></li>';
    }).join('');

    postsList.innerHTML = html;
    if (postsLoading) postsLoading.hidden = true;
    observeReveals(postsList);
  }

  function loadPosts() {
    if (postsLoaded || !postsList) return;
    postsLoaded = true;

    const feed = 'https://medium.com/feed/@ishankdev';
    const url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feed);

    const timeout = setTimeout(showPostsError, 9000);

    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        clearTimeout(timeout);
        if (data.status !== 'ok' || !data.items || !data.items.length) throw new Error('empty');
        renderPosts(data.items);
      })
      .catch(function () { clearTimeout(timeout); showPostsError(); });
  }

  // only fetch once the section is close to view
  const writing = document.getElementById('writing');
  if (writing && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { loadPosts(); io.disconnect(); }
    }, { rootMargin: '400px' });
    io.observe(writing);
  } else {
    loadPosts();
  }

  /* =================================================================
     DEEP LINK ON LOAD
     ================================================================= */

  if (window.location.hash.length > 1) {
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) {
      setTimeout(function () {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
        onScrollFrame();
      }, 60);
    }
  }
})();
