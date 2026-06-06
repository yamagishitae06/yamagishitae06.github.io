// js/works.js

async function showCategory(category) {
  const res = await fetch(`${category}.html`);
  document.getElementById('works-content').innerHTML = await res.text();
  setActiveNav(category);

  // Modaalの再初期化
  $('.modal-button').modaal();
  // ① URLを更新（ページ遷移なし）
  history.pushState({ category }, '', `?category=${category}`);
}

function setActiveNav(category) {
  document.querySelectorAll('.gnavi a').forEach(a => {
    a.classList.remove('nowpage', 'bold');
    a.style.pointerEvents = '';
  });
  const active = document.querySelector(`[data-category="${category}"]`);
  if (active) {
    active.classList.add('nowpage', 'bold');
    active.style.pointerEvents = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.gnavi a[data-category]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      showCategory(a.dataset.category);
    });
  });

  // ② URLにcategoryがあればそれを初期表示、なければデフォルト
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('category') || 'commercial-webdesign';
  showCategory(initial);

  // ③ ブラウザの「戻る/進む」にも対応
  window.addEventListener('popstate', (e) => {
    if (e.state?.category) showCategory(e.state.category);
  });

  // 初期表示
  showCategory('works-commercial-webdesign');
});