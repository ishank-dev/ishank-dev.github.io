'use strict';

/*-----------------------------------*\
  #HELPERS
\*-----------------------------------*/

const elementToggleFunc = function (elem) { elem.classList.toggle("active"); };
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

/*-----------------------------------*\
  #THEME
\*-----------------------------------*/

const themeToggleBtn = $('[data-theme-toggle]');
const savedTheme = localStorage.getItem('theme');

const applyTheme = function (theme) {
  document.body.classList.toggle('dark-theme', theme === 'dark');
  document.body.classList.toggle('light-theme', theme === 'light');
  if (themeToggleBtn) {
    themeToggleBtn.textContent = theme === 'dark' ? '🌙' : '☀️';
    themeToggleBtn.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  }
};

applyTheme(savedTheme === 'light' ? 'light' : 'dark');

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', function () {
    const next = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });
}

/*-----------------------------------*\
  #SIDEBAR (mobile)
\*-----------------------------------*/

const sidebar = $("[data-sidebar]");
const sidebarBtn = $("[data-sidebar-btn]");

if (sidebarBtn && sidebar) {
  sidebarBtn.addEventListener("click", function () {
    elementToggleFunc(sidebar);
    this.setAttribute('aria-expanded', sidebar.classList.contains('active'));
  });
}

/*-----------------------------------*\
  #PORTFOLIO FILTERING
\*-----------------------------------*/

const select = $("[data-select]");
const selectValue = $("[data-selecct-value]");
const selectItems = $$("[data-select-item]");
const filterButtons = $$("[data-filter-btn]");
const filterItems = $$("[data-filter-item]");

if (select) {
  select.addEventListener("click", function () { elementToggleFunc(this); });

  document.addEventListener("click", function (e) {
    if (!select.contains(e.target) && !e.target.closest('.select-list')) {
      select.classList.remove("active");
    }
  });
}

const filterFunc = function (selectedValue) {
  const value = String(selectedValue).trim().toLowerCase();

  filterItems.forEach((item) => {
    const match = value === 'all' || item.dataset.category === value;
    item.classList.toggle('active', match);
  });
};

filterButtons.forEach((button) => {
  button.addEventListener('click', function () {
    filterFunc(this.textContent);
    filterButtons.forEach((btn) => btn.classList.remove('active'));
    this.classList.add('active');
  });
});

selectItems.forEach((button) => {
  button.addEventListener('click', function () {
    const value = this.textContent.trim();
    filterFunc(value);
    if (selectValue) selectValue.textContent = value;
    if (select) select.classList.remove('active');
    filterButtons.forEach((btn) => btn.classList.toggle('active', btn.textContent.trim() === value));
  });
});

/*-----------------------------------*\
  #CONTACT FORM
\*-----------------------------------*/

const form = $("[data-form]");
const formInputs = $$("[data-form-input]");
const formBtn = $("[data-form-btn]");

if (form && formBtn) {
  formInputs.forEach((input) => {
    input.addEventListener("input", function () {
      if (form.checkValidity()) {
        formBtn.removeAttribute("disabled");
      } else {
        formBtn.setAttribute("disabled", "");
      }
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const formData = new FormData(form);
    const name = formData.get('fullname') || 'Not provided';
    const email = formData.get('email') || 'Not provided';
    const subject = formData.get('subject') || `Portfolio contact from ${name}`;
    const message = formData.get('message') || 'Not provided';

    const body = `From: ${name}%0D%0AEmail: ${email}%0D%0A%0D%0AMessage:%0D%0A${encodeURIComponent(message)}`;
    window.location.href = `mailto:ishankdev@gmail.com?subject=${encodeURIComponent(subject)}&body=${body}`;

    form.reset();
    formBtn.setAttribute("disabled", "");
  });
}

/*-----------------------------------*\
  #PAGE NAVIGATION
\*-----------------------------------*/

const navigationLinks = $$("[data-nav-link]");
const pages = $$("[data-page]");

const goToPage = function (pageName) {
  const target = String(pageName).trim().toLowerCase();

  pages.forEach((page) => page.classList.toggle("active", page.dataset.page === target));
  navigationLinks.forEach((link) => {
    const isActive = link.textContent.trim().toLowerCase() === target;
    link.classList.toggle("active", isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (target === 'blog') loadMediumArticles();

  const active = pages.find((page) => page.dataset.page === target);
  if (active) observeReveals(active);

  if (history.replaceState) history.replaceState(null, '', `#${target}`);
};

navigationLinks.forEach((link) => {
  link.addEventListener("click", function () { goToPage(this.textContent); });
});

// deep link support (#resume, #portfolio, …)
const initialHash = window.location.hash.replace('#', '').toLowerCase();
if (initialHash && pages.some((page) => page.dataset.page === initialHash)) {
  goToPage(initialHash);
}

/*-----------------------------------*\
  #SCROLL REVEAL
\*-----------------------------------*/

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
  : null;

function observeReveals(scope = document) {
  if (!revealObserver) {
    $$('.reveal', scope).forEach((el) => el.classList.add('in-view'));
    return;
  }
  $$('.reveal:not(.in-view)', scope).forEach((el) => revealObserver.observe(el));
}

observeReveals();

/*-----------------------------------*\
  #BLOG (Medium RSS)
\*-----------------------------------*/

let articlesLoaded = false;

async function loadMediumArticles() {
  if (articlesLoaded) return;

  const loadingElement = document.getElementById('blog-loading');
  const errorElement = document.getElementById('blog-error');
  const postsListElement = document.getElementById('blog-posts-list');
  if (!loadingElement || !postsListElement) return;

  loadingElement.style.display = 'flex';
  errorElement.style.display = 'none';
  postsListElement.innerHTML = '';

  try {
    const mediumUsername = '@ishankdev';
    const rssUrl = `https://medium.com/feed/${mediumUsername}`;
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    if (data.status !== 'ok') throw new Error('Failed to fetch RSS feed');

    loadingElement.style.display = 'none';

    if (data.items && data.items.length > 0) {
      displayBlogPosts(data.items.slice(0, 6));
      articlesLoaded = true;
      observeReveals(postsListElement);
    } else {
      showNoPosts();
    }
  } catch (error) {
    console.error('Error fetching Medium articles:', error);
    loadingElement.style.display = 'none';
    errorElement.style.display = 'block';
  }
}

function displayBlogPosts(articles) {
  const postsListElement = document.getElementById('blog-posts-list');
  articles.forEach((article, i) => {
    postsListElement.appendChild(createBlogPostElement(article, i));
  });
}

function createBlogPostElement(article, index = 0) {
  const li = document.createElement('li');
  li.className = 'blog-post-item reveal';
  li.style.setProperty('--reveal-delay', `${index * 70}ms`);

  const imageMatch = (article.content || '').match(/<img[^>]+src="([^">]+)"/);
  const imageUrl = imageMatch ? imageMatch[1] : null;

  const description = (article.description || '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .substring(0, 150) + '…';

  const publishDate = new Date(article.pubDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  li.innerHTML = `
    <a href="${article.link}" target="_blank" rel="noopener">
      <figure class="blog-post-banner">
        ${imageUrl
          ? `<img src="${imageUrl}" alt="${article.title}" loading="lazy">`
          : `<div class="placeholder"><svg class="ionicon" viewBox="0 0 512 512" aria-hidden="true" style="font-size:40px"><path class="ionicon-fill-none ionicon-stroke-width" stroke-linejoin="round" d="M416 221.25V416a48 48 0 01-48 48H144a48 48 0 01-48-48V96a48 48 0 0148-48h98.75a32 32 0 0122.62 9.37l141.26 141.26a32 32 0 019.37 22.62z"/><path class="ionicon-fill-none ionicon-stroke-width" stroke-linecap="round" stroke-linejoin="round" d="M256 56v120a32 32 0 0032 32h120M176 288h160M176 368h160"/></svg></div>`}
      </figure>

      <div class="blog-post-content">
        <div class="blog-post-meta">
          <div class="blog-post-date">
            <svg class="ionicon" viewBox="0 0 512 512" aria-hidden="true"><rect x="48" y="80" width="416" height="384" rx="48" class="ionicon-fill-none ionicon-stroke-width" stroke-linejoin="round"/><path class="ionicon-fill-none ionicon-stroke-width" stroke-linecap="round" stroke-linejoin="round" d="M128 48v32M384 48v32M464 160H48"/></svg>
            <time datetime="${article.pubDate}">${publishDate}</time>
          </div>
        </div>

        <h3 class="blog-post-title">${article.title}</h3>

        <p class="blog-post-text">${description}</p>

        <div class="blog-post-link">
          Read more
          <svg class="ionicon" viewBox="0 0 512 512" aria-hidden="true"><path class="ionicon-fill-none ionicon-stroke-width" stroke-linecap="round" stroke-linejoin="round" d="M268 112l144 144-144 144M392 256H100"/></svg>
        </div>
      </div>
    </a>
  `;

  return li;
}

function showNoPosts() {
  const postsListElement = document.getElementById('blog-posts-list');
  postsListElement.innerHTML = `
    <li style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--muted);">
      <p>No articles found. Check back later for new content.</p>
    </li>
  `;
}
