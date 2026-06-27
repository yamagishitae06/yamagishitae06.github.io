document.addEventListener('DOMContentLoaded', () => {
    const stack = document.querySelector('.card-stack');
    const container = document.querySelector('.card-stack-box');
    

    if (!container || !stack) {
        console.error('card-stack-box セクションまたは card-stack が見つかりません');
        return;
    }

    // ._01 ~ ._04 を取得し、初期の重なり順（配列の最後 = 最前面）に並べる
    const allCards = Array.from(stack.querySelectorAll('.profile-card'));

    // 初期状態の定義：番号が小さいほど手前・回転が小さい
    // _01:0deg, _02:-0.5deg, _03:-1.0deg, _04:-1.5deg
    function getCardIndex(card) {
        const match = card.className.match(/_0?(\d+)/);
        return match ? parseInt(match[1], 10) : 1;
    }

    // 配列を「奥(_04)→手前(_01)」の順に並べ替える（最後の要素が最前面）
    allCards.sort((a, b) => getCardIndex(b) - getCardIndex(a));

    const baseDefs = new Map(); // カードごとの初期オフセット・回転を保持

    const rotations = [0, -0.5, 1, -1.5];

    allCards.forEach(card => {
        const index = getCardIndex(card); // 1,2,3,4
        const offset = (index - 1) * 3;

        baseDefs.set(card, {
            offsetX: offset,
            offsetY: offset,
            rotate: rotations[index - 1]
        });
    });

    // 各カードの状態（現在位置・速度・アニメーション）
    const cardStates = new Map();
    allCards.forEach(card => {
        cardStates.set(card, {
            currentX: 0,
            currentY: 0,
            velocityX: 0,
            velocityY: 0,
            animationFrame: null,
            baseRect: null
        });
    });

    // 慣性の減衰率（1に近いほど長く滑り、低いほどすぐ止まる）
    const friction = 1;
    // この速度未満になったらアニメーションを終了する閾値(px/frame程度)
    const minVelocity = 0.5;
    // 範囲外へ出たカードを内側へ戻す「バネ」の強さ
    // 値を大きくすると勢いよく戻り、小さいとゆっくり戻る
    const springStrength = 0.05;
    // バネの跳ね返り時の減衰率
    // 1に近いほどよく跳ね、低いほどすぐ収束する
    const springDamping = 0.5;
    // ドラッグ中に範囲外へ引っ張ったときの抵抗率
    // 1に近いほど抵抗が少なく、0に近いほどほとんど伸びなくなる
    const dragResistance = 0.4;

    let activeCard = null;
    let isDragging = false;
    let startX = 0, startY = 0, initialX = 0, initialY = 0;
    let lastX = 0, lastY = 0, lastTime = 0;

    // 初期状態（重なり・回転・オフセット）を適用
    function applyBaseStyle(card) {
        const def = baseDefs.get(card);
        const state = cardStates.get(card);
        state.currentX = 0;
        state.currentY = 0;
        state.velocityX = 0;
        state.velocityY = 0;
        card.style.transform =
            `translate(${def.offsetX}px, ${def.offsetY}px) rotate(${def.rotate}deg)`;
    }

    function applyZIndex() {
        // 配列の順番どおりにz-indexを振る（最後が最前面）
        allCards.forEach((card, i) => {
            card.style.zIndex = i + 1;
        });
    }

    function initStack(animate = false) {
        allCards.forEach(card => {
            if (animate) {
                card.style.transition = 'transform 0.6s ease';
            }
            applyBaseStyle(card);
        });
        applyZIndex();

        if (animate) {
            // アニメーション終了後にtransitionを解除（次回ドラッグに影響しないように）
            setTimeout(() => {
                allCards.forEach(card => {
                    card.style.transition = '';
                });
            }, 600);
        }
    }

    // 現在のtransformを基準に、回転を含まないbaseRectを測る
    function updateBaseRect(card) {
        const state = cardStates.get(card);
        const prevTransform = card.style.transform;
        card.style.transform = 'translate(0px, 0px) rotate(0deg)';
        state.baseRect = card.getBoundingClientRect();
        card.style.transform = prevTransform;
    }

    function getPoint(e) {
        return { x: e.clientX, y: e.clientY };
    }

    function getBounds(card) {
        const state = cardStates.get(card);
        if (!state.baseRect) updateBaseRect(card);
        const containerRect = container.getBoundingClientRect();

        return {
            minX: containerRect.left - state.baseRect.left,
            maxX: containerRect.right - state.baseRect.right,
            minY: containerRect.top - state.baseRect.top,
            maxY: containerRect.bottom - state.baseRect.bottom
        };
    }

    function clampValue(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    function applyResistance(value, min, max) {
        if (value < min) {
            const over = min - value;
            return min - over * dragResistance;
        }
        if (value > max) {
            const over = value - max;
            return max + over * dragResistance;
        }
        return value;
    }

    // カードを最前面に移動（配列とz-indexを更新）
    function bringToFront(card) {
        const idx = allCards.indexOf(card);
        if (idx !== -1) {
            allCards.splice(idx, 1);
            allCards.push(card);
            applyZIndex();
        }
    }

    function dragStart(e) {
        const card = e.currentTarget;

        if (animationFrame_for(card)) {
            cancelAnimationFrame(cardStates.get(card).animationFrame);
            cardStates.get(card).animationFrame = null;
        }

        bringToFront(card);
        updateBaseRect(card);

        activeCard = card;
        isDragging = true;
        card.classList.add('dragging');
        card.setPointerCapture && card.setPointerCapture(e.pointerId);

        const state = cardStates.get(card);
        const point = getPoint(e);
        startX = point.x;
        startY = point.y;
        initialX = state.currentX;
        initialY = state.currentY;

        lastX = point.x;
        lastY = point.y;
        lastTime = Date.now();
        state.velocityX = 0;
        state.velocityY = 0;
    }

    function animationFrame_for(card) {
        return cardStates.get(card).animationFrame;
    }

    function dragMove(e) {
        if (!isDragging || !activeCard) return;
        e.preventDefault();

        const card = activeCard;
        const state = cardStates.get(card);

        const point = getPoint(e);
        const dx = point.x - startX;
        const dy = point.y - startY;

        let targetX = initialX + dx;
        let targetY = initialY + dy;

        const bounds = getBounds(card);
        targetX = applyResistance(targetX, bounds.minX, bounds.maxX);
        targetY = applyResistance(targetY, bounds.minY, bounds.maxY);

        state.currentX = targetX;
        state.currentY = targetY;

        const def = baseDefs.get(card);
        card.style.transform =
            `translate(${state.currentX}px, ${state.currentY}px) rotate(${def.rotate}deg)`;

        const now = Date.now();
        const dt = now - lastTime;
        if (dt > 0) {
            state.velocityX = (point.x - lastX) / dt * 16;
            state.velocityY = (point.y - lastY) / dt * 16;
        }
        lastX = point.x;
        lastY = point.y;
        lastTime = now;
    }

    function dragEnd(e) {
        if (!isDragging || !activeCard) return;
        const card = activeCard;
        isDragging = false;
        card.classList.remove('dragging');
        card.releasePointerCapture && e && card.releasePointerCapture(e.pointerId);

        animate(card);
        activeCard = null;
    }

    function animate(card) {
        const state = cardStates.get(card);
        const def = baseDefs.get(card);
        const bounds = getBounds(card);

        let forceX = 0;
        let forceY = 0;

        if (state.currentX < bounds.minX) {
            forceX = (bounds.minX - state.currentX) * springStrength;
        } else if (state.currentX > bounds.maxX) {
            forceX = (bounds.maxX - state.currentX) * springStrength;
        }

        if (state.currentY < bounds.minY) {
            forceY = (bounds.minY - state.currentY) * springStrength;
        } else if (state.currentY > bounds.maxY) {
            forceY = (bounds.maxY - state.currentY) * springStrength;
        }

        if (forceX !== 0 || forceY !== 0) {
            state.velocityX += forceX;
            state.velocityY += forceY;
            state.velocityX *= springDamping;
            state.velocityY *= springDamping;
        } else {
            state.velocityX *= friction;
            state.velocityY *= friction;
        }

        state.currentX += state.velocityX;
        state.currentY += state.velocityY;

        card.style.transform =
            `translate(${state.currentX}px, ${state.currentY}px) rotate(${def.rotate}deg)`;

        const settled =
            Math.abs(state.velocityX) < minVelocity &&
            Math.abs(state.velocityY) < minVelocity &&
            state.currentX >= bounds.minX && state.currentX <= bounds.maxX &&
            state.currentY >= bounds.minY && state.currentY <= bounds.maxY;

        if (settled) {
            state.currentX = clampValue(state.currentX, bounds.minX, bounds.maxX);
            state.currentY = clampValue(state.currentY, bounds.minY, bounds.maxY);
            card.style.transform =
                `translate(${state.currentX}px, ${state.currentY}px) rotate(${def.rotate}deg)`;
            state.animationFrame = null;
            return;
        }

        state.animationFrame = requestAnimationFrame(() => animate(card));
    }

    // 各カードにPointer Eventsを設定
    allCards.forEach(card => {
        card.addEventListener('pointerdown', dragStart);
    });
    document.addEventListener('pointermove', dragMove);
    document.addEventListener('pointerup', dragEnd);
    document.addEventListener('pointercancel', dragEnd);

    // リサイズ時に初期状態へ戻す
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            allCards.forEach(card => {
                const state = cardStates.get(card);
                if (state.animationFrame) {
                    cancelAnimationFrame(state.animationFrame);
                    state.animationFrame = null;
                }
                state.baseRect = null; // 再計測させる
            });

            // 重なり順も元の番号順(_01が最前面)に戻す
            allCards.sort((a, b) => getCardIndex(b) - getCardIndex(a));
            initStack(true); // ← true を渡してアニメーションさせる
        }, 80);
    });

    // 初期化
    initStack();
});