// js/works.js

async function showCategory(worksCategory) {
  // worksCategory には "works-commercial-web" のように "works-" を含む値がそのまま入る
  const res = await fetch(`${worksCategory}.html`);
  document.getElementById('works-content').innerHTML = await res.text();
  setActiveNav(worksCategory);

  // Modaalの再初期化
  $('.modal-button').modaal();
  // ① URLを更新（ページ遷移なし）
  history.pushState({ worksCategory }, '', `?category=${worksCategory}`);
}

function setActiveNav(worksCategory) {
  document.querySelectorAll('.gnavi a').forEach(a => {
    a.classList.remove('nowpage', 'bold');
    a.style.pointerEvents = '';
  });
  const active = document.querySelector(`[data-category="${worksCategory}"]`);
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
  const initial = params.get('category') || 'works-commercial-web';
  showCategory(initial);

  // ③ ブラウザの「戻る/進む」にも対応
  window.addEventListener('popstate', (e) => {
    if (e.state?.worksCategory) showCategory(e.state.worksCategory);
  });
});