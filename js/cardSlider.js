'use strict';

/**
 * ============================================================
 * cardSlider.js
 * 作品カードカルーセル（無限スクロール + ドラッグ + スプリング物理）
 * ------------------------------------------------------------
 * 設計方針
 *  - カルーセル全体をtransformで動かすのではなく、各カード(Cardクラス)が
 *    「自身の基準位置・ドラッグ量・速度・スケール」を独立して保持し、
 *    自分自身のtransformだけを書き換える。
 *  - 無限スクロールは cloneNode/appendChild による実行時のDOM操作ではなく、
 *    各カードの位置を「モジュロ演算による周回」で計算することで実現する。
 *    ベルトコンベア上をカードが等間隔で流れ続けるイメージ。
 *  - ドラッグ中の位置は、スクロールによる基準位置(baseOffset + scrollOffset)
 *    とは別に dragX / dragY として加算するだけなので、
 *    ドラッグ中でも他のカードやベルト自体の流れは止まらない。
 *  - リリース時は dragX / dragY だけをばね物理でゼロへ収束させる。
 * ============================================================
 */

(() => {
  // ---------------------------------------------------------
  // 設定値（チューニングはここに集約）
  // ---------------------------------------------------------
  const CONFIG = {
    SPEED: 40,               // 自動スクロール速度 (px/秒)
    SPRING_STIFFNESS: 200,   // ばねの強さ（大きいほど速く戻る）
    SPRING_DAMPING: 12,      // 減衰係数（小さいほどよく揺れる）
    SETTLE_DIST: 0.05,       // これ未満なら「静止」とみなす位置閾値(px)
    SETTLE_VEL: 0.05,        // これ未満なら「静止」とみなす速度閾値(px/秒)
    HOVER_SCALE: 1.01,       // ホバー時の拡大率
    DRAG_SCALE: 1.03,        // ドラッグ中の拡大率
    SCALE_LERP: 0.2,         // スケール変化の補間係数（0〜1、大きいほど速い）
    MAX_DT: 0.1,             // 1フレームの最大経過時間(秒)。タブ復帰時の跳躍防止
    BUFFER_STEPS: 2,         // 画面端に余裕を持たせるための追加カード枚数
    GAP_FALLBACK: 16,        // --sp-md が取得できない場合のフォールバック(px)
    VERTICAL_MARGIN: 8,      // 縦ドラッグ可動域の上下に残す安全マージン(px)
    RUBBER_BAND_FACTOR: 0.35,// 可動域を超えた分をどれだけ抑えるか（小さいほど硬い）
  };

  /**
   * ラバーバンド（ゴムひも）抵抗を適用する。
   * |value| が max を超えた分は RUBBER_BAND_FACTOR 倍に圧縮されるため、
   * 指の動きには追従しつつ、コンテナの外へは実質的にはみ出さない。
   */
  function applyRubberBand(value, max) {
    if (max <= 0) return 0;
    const abs = Math.abs(value);
    if (abs <= max) return value;
    const overflow = abs - max;
    const damped = max + overflow * CONFIG.RUBBER_BAND_FACTOR;
    return value < 0 ? -damped : damped;
  }

  /* ================================================================
   * Card クラス
   * 1枚のカードの状態（位置・ドラッグ量・速度・スケール）と、
   * それに紐づくポインター操作を管理する。
   * ================================================================ */
  class Card {
    constructor(el, index) {
      this.el = el;
      this.index = index;

      // ベルトの流れの中での基準オフセット（Carouselが設定）
      this.baseOffset = 0;

      // ドラッグによる位置のズレ（基準位置からの相対値）
      this.dragX = 0;
      this.dragY = 0;

      // 縦方向にドラッグできる範囲（Carouselがバウンド要素の矩形から算出して設定）
      // 上方向・下方向で余白が異なる場合があるため、それぞれ別に持つ。
      // これを超えるとラバーバンド抵抗がかかり、指定した範囲の外へ実質はみ出さなくなる
      this.maxDragUp = Infinity;
      this.maxDragDown = Infinity;

      // ばね物理・フリック用の速度
      this.velX = 0;
      this.velY = 0;

      // ドラッグ状態
      this.isDragging = false;
      this.pointerId = null;
      this.startPointerX = 0;
      this.startPointerY = 0;
      this.startDragX = 0;
      this.startDragY = 0;
      this.lastPointerX = 0;
      this.lastPointerY = 0;
      this.lastMoveTime = 0;

      // ホバー/ドラッグによる拡大表現
      this.targetScale = 1;
      this.currentScale = 1;

      // 直前に描画したtransform値（無駄なDOM書き込みを避けるためのキャッシュ）
      this.lastRenderX = null;
      this.lastRenderY = null;
      this.lastRenderScale = null;

      this._bindEvents();
    }

    /** イベントリスナーをカード要素に登録 */
    _bindEvents() {
      this.el.addEventListener('pointerdown', this._onPointerDown.bind(this));
      this.el.addEventListener('pointermove', this._onPointerMove.bind(this));
      this.el.addEventListener('pointerup', this._onPointerUp.bind(this));
      this.el.addEventListener('pointercancel', this._onPointerUp.bind(this));
      this.el.addEventListener('pointerenter', this._onPointerEnter.bind(this));
      this.el.addEventListener('pointerleave', this._onPointerLeave.bind(this));
    }

    /** ドラッグ開始 */
    _onPointerDown(e) {
      this.isDragging = true;
      this.pointerId = e.pointerId;
      this.el.setPointerCapture(e.pointerId);

      this.startPointerX = e.clientX;
      this.startPointerY = e.clientY;
      this.startDragX = this.dragX;
      this.startDragY = this.dragY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.lastMoveTime = performance.now();

      // ばねの残存速度を打ち消してから掴む
      this.velX = 0;
      this.velY = 0;

      this.targetScale = CONFIG.DRAG_SCALE;
      this.el.classList.add('dragging');
    }

    /** ドラッグ中の移動（このカードだけが動く。他カードには一切影響しない） */
    _onPointerMove(e) {
      if (!this.isDragging || e.pointerId !== this.pointerId) return;

      const now = performance.now();
      const dt = Math.max((now - this.lastMoveTime) / 1000, 1 / 120);

      // ポインター移動量をそのままドラッグオフセットへ反映（1:1で自由に追従）
      this.dragX = this.startDragX + (e.clientX - this.startPointerX);

      // 縦方向のみ、上下それぞれの可動域に応じてラバーバンド抵抗をかける
      const rawDragY = this.startDragY + (e.clientY - this.startPointerY);
      this.dragY =
        rawDragY >= 0
          ? applyRubberBand(rawDragY, this.maxDragDown)   // 下方向
          : -applyRubberBand(-rawDragY, this.maxDragUp);  // 上方向

      // リリース時に「勢い」を残すため、直近の移動速度を記録しておく
      this.velX = (e.clientX - this.lastPointerX) / dt;
      this.velY = (e.clientY - this.lastPointerY) / dt;

      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.lastMoveTime = now;
    }

    /** ドラッグ終了 → 以降はupdate()内のばね物理で元の位置へ戻る */
    _onPointerUp(e) {
      if (!this.isDragging || e.pointerId !== this.pointerId) return;
      this.isDragging = false;
      this.pointerId = null;
      this.el.classList.remove('dragging');

      this.targetScale = this.el.matches(':hover') ? CONFIG.HOVER_SCALE : 1;
      // velX/velYは直前のpointermoveで記録した値をそのままばねの初速として使う
    }

    _onPointerEnter(e) {
      if (e.pointerType !== 'mouse') return;
      if (!this.isDragging) this.targetScale = CONFIG.HOVER_SCALE;
    }

    _onPointerLeave(e) {
      if (e.pointerType !== 'mouse') return;
      if (!this.isDragging) this.targetScale = 1;
    }

    /**
     * ばね物理の更新（ドラッグ中でない軸のみ呼ばれる）
     * 減衰振動モデル: accel = -k・disp - c・vel
     * 「少し行き過ぎる→戻る→少し揺れる→停止」を表現する。
     */
    _updateSpringAxis(dispKey, velKey, dt) {
      let disp = this[dispKey];
      let vel = this[velKey];

      if (Math.abs(disp) < CONFIG.SETTLE_DIST && Math.abs(vel) < CONFIG.SETTLE_VEL) {
        this[dispKey] = 0;
        this[velKey] = 0;
        return;
      }

      const accel = -CONFIG.SPRING_STIFFNESS * disp - CONFIG.SPRING_DAMPING * vel;
      vel += accel * dt;
      disp += vel * dt;

      this[dispKey] = disp;
      this[velKey] = vel;
    }

    /** 毎フレームの状態更新（物理・スケール補間）。DOM操作は行わない */
    update(dt) {
      if (!this.isDragging) {
        this._updateSpringAxis('dragX', 'velX', dt);
        this._updateSpringAxis('dragY', 'velY', dt);
      }
      this.currentScale += (this.targetScale - this.currentScale) * CONFIG.SCALE_LERP;
    }

    /** 実際のDOM描画。値がほぼ変化していない場合は書き込みをスキップする */
    render(baseX, baseY) {
      const x = baseX + this.dragX;
      const y = baseY + this.dragY;
      const scale = this.currentScale;

      if (
        this.lastRenderX !== null &&
        Math.abs(x - this.lastRenderX) < 0.05 &&
        Math.abs(y - this.lastRenderY) < 0.05 &&
        Math.abs(scale - this.lastRenderScale) < 0.001
      ) {
        return;
      }

      this.el.style.transform =
        `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(3)})`;

      this.lastRenderX = x;
      this.lastRenderY = y;
      this.lastRenderScale = scale;
    }
  }

  /* ================================================================
   * Carousel クラス
   * 複数のCardを管理し、無限スクロールのレイアウト計算とrAFループを担当する。
   * ================================================================ */
  class Carousel {
    constructor(container, track, boundsEl) {
      this.container = container;
      this.track = track;
      // ドラッグの縦方向可動域の基準となる要素（未指定ならcontainer自身）
      this.boundsEl = boundsEl || container;

      this.cardData = [];   // 元データ（画像・タイトル・クラス名）
      this.cards = [];      // Cardインスタンス配列

      this.cardWidth = 0;
      this.cardHeight = 0;
      this.gap = 0;
      this.step = 0;        // 1枚分の占有幅 (cardWidth + gap)
      this.trackWidth = 0;  // 周回に使うループ長 (step * カード総数)

      this.scrollOffset = 0;
      this.lastTime = null;
      this.isVisible = true;

      this._init();
    }

    _init() {
      this._extractData();
      this._buildCards();
      this._measure();
      this._bindGlobalEvents();
      requestAnimationFrame(this._loop.bind(this));
    }

    /** 既存DOMからカードデータ（画像・タイトル・クラス）を抽出し、一旦空にする */
    _extractData() {
      const originalCards = Array.from(this.track.children);
      this.cardData = originalCards.map((el) => ({
        className: [...el.classList].find((c) => c !== 'work-card') || '',
        imgSrc: el.querySelector('.work-thumb')?.getAttribute('src') || '',
        imgAlt: el.querySelector('.work-thumb')?.getAttribute('alt') || '',
        title: el.querySelector('.work-title')?.textContent || '',
      }));
      this.track.innerHTML = '';
    }

    /**
     * カード要素を生成する。
     * 画面幅を十分に埋められる枚数まで元データを複製するが、
     * これは初期構築時（および resize 時）にのみ行う処理であり、
     * スクロールアニメーション中に cloneNode/appendChild を行うものではない。
     */
    _buildCards() {
      // フェーズ1: 実寸を測るため元データ分だけ仮生成
      this.track.innerHTML = '';
      this.cards = [];
      this.cardData.forEach((data, i) => {
        const el = this._createCardElement(data);
        this.track.appendChild(el);
        this.cards.push(new Card(el, i));
      });

      this._measureCardSize();

      // フェーズ2: 画面幅 + バッファを埋められる枚数まで複製
      const containerWidth = this.container.clientWidth || window.innerWidth;
      const minCount =
        Math.ceil(containerWidth / this.step) + this.cardData.length + CONFIG.BUFFER_STEPS;
      const repeat = Math.max(1, Math.ceil(minCount / this.cardData.length));

      if (repeat > 1) {
        this.track.innerHTML = '';
        this.cards = [];
        let index = 0;
        for (let r = 0; r < repeat; r++) {
          for (const data of this.cardData) {
            const el = this._createCardElement(data);
            this.track.appendChild(el);
            this.cards.push(new Card(el, index));
            index++;
          }
        }
      }
    }

    _createCardElement(data) {
      const el = document.createElement('div');
      el.className = `work-card ${data.className}`.trim();

      const img = document.createElement('img');
      img.className = 'work-thumb';
      img.src = data.imgSrc;
      img.alt = data.imgAlt || data.title;
      img.draggable = false;

      const title = document.createElement('h4');
      title.className = 'work-title';
      title.textContent = data.title;

      el.appendChild(img);
      el.appendChild(title);
      return el;
    }

    /** カード1枚の実寸とカード間隔(--sp-md)を実測する */
    _measureCardSize() {
      const sample = this.cards[0]?.el;
      if (!sample) return;

      const rect = sample.getBoundingClientRect();
      this.cardWidth = rect.width;
      this.cardHeight = rect.height;

      const gapVar = getComputedStyle(this.container).getPropertyValue('--sp-md');
      this.gap = parseFloat(gapVar) || CONFIG.GAP_FALLBACK;

      this.step = this.cardWidth + this.gap || 1;
    }

    /** ループ幅・各カードの基準オフセット・縦位置を確定する */
    _measure() {
      this._measureCardSize();
      this.trackWidth = this.step * this.cards.length;

      this.cards.forEach((card, i) => {
        card.baseOffset = i * this.step;
      });

      this.containerHeight = this.container.clientHeight;
      this.baseY = (this.containerHeight - this.cardHeight) / 2;

      // カードの縦方向の可動域を、works-contentsではなく
      // boundsEl（#works セクション全体など）の矩形から算出する。
      // カードが画面内のどこにいても正しく計算できるよう、
      // ビューポート座標(getBoundingClientRect)で比較する。
      const containerRect = this.container.getBoundingClientRect();
      const boundsRect = this.boundsEl.getBoundingClientRect();

      // カード（静止時）の垂直方向の中心のビューポート座標
      const cardCenterY = containerRect.top + this.baseY + this.cardHeight / 2;

      const spaceAbove =
        cardCenterY - this.cardHeight / 2 - boundsRect.top - CONFIG.VERTICAL_MARGIN;
      const spaceBelow =
        boundsRect.bottom - (cardCenterY + this.cardHeight / 2) - CONFIG.VERTICAL_MARGIN;

      this.cards.forEach((card) => {
        card.maxDragUp = Math.max(0, spaceAbove);
        card.maxDragDown = Math.max(0, spaceBelow);
      });
    }

    /** リサイズ・タブの表示状態変化のイベント登録 */
    _bindGlobalEvents() {
      let resizeTimer = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => this._handleResize(), 150);
      });

      document.addEventListener('visibilitychange', () => {
        this.isVisible = document.visibilityState === 'visible';
        this.lastTime = null; // 復帰時に大きなdtが発生するのを防ぐ
      });
    }

    /** 画面幅変化に応じてカード枚数・サイズを再構築する */
    _handleResize() {
      this._buildCards();
      this._measure();
    }

    /** メインループ（rAF） */
    _loop(time) {
      requestAnimationFrame(this._loop.bind(this));
      if (!this.isVisible) return;

      if (this.lastTime === null) this.lastTime = time;
      let dt = (time - this.lastTime) / 1000;
      dt = Math.min(dt, CONFIG.MAX_DT);
      this.lastTime = time;

      this._update(dt);
      this._render();
    }

    /** 状態更新フェーズ（DOMの読み取り・書き込みを行わない） */
    _update(dt) {
      this.scrollOffset += CONFIG.SPEED * dt;
      // 数値が際限なく増加しないよう、ループ幅で早めに巻き戻しておく
      if (this.scrollOffset > this.trackWidth) {
        this.scrollOffset -= this.trackWidth;
      }
      for (const card of this.cards) {
        card.update(dt);
      }
    }

    /**
     * 描画フェーズ（DOM書き込みのみ）
     * 各カードの位置は baseOffset + scrollOffset をモジュロ演算で
     * trackWidth内に周回させることで求める。
     * cloneNode/appendChildによる複製や、scrollWidthの半分でリセットする
     * ような処理は行わず、純粋な位置計算のみでループを実現している。
     */
    _render() {
      for (const card of this.cards) {
        let x = card.baseOffset + this.scrollOffset;
        x = ((x % this.trackWidth) + this.trackWidth) % this.trackWidth;
        x -= this.step; // 左側に1枚分のバッファを持たせ、入場時の見切れを自然にする

        card.render(x, this.baseY);
      }
    }
  }

  // ---------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------
  function init() {
    const container = document.getElementById('worksContentsCard');
    const track = document.getElementById('cardBox');
    if (!container || !track) return;

    // ドラッグの縦方向可動域として使うセクション全体。
    // 見つからない場合は従来どおりcontainer自身を基準にする。
    const boundsEl = document.getElementById('works') || container;

    new Carousel(container, track, boundsEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();