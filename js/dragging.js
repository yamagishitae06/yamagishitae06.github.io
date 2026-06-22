document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('profileCard');
    const container = document.getElementById('profile'); // 移動範囲の基準にするセクション

    if (!card) {
        console.error('profileCard が見つかりません');
        return;
    }
    if (!container) {
        console.error('profile セクションが見つかりません');
        return;
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let currentX = 0;
    let currentY = 0;

    let velocityX = 0;
    let velocityY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastTime = 0;
    let animationFrame = null;

    const friction = 0.95;
    const minVelocity = 0.6;
    const springStrength = 0.1;
    const springDamping = 0.2;
    const dragResistance = 0.4;

    let baseRect = null;

    function updateBaseRect() {
        const prevTransform = card.style.transform;
        card.style.transform = 'translate(0px, 0px)';
        baseRect = card.getBoundingClientRect();
        card.style.transform = prevTransform;
    }

    function getPoint(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // 境界を「window」ではなく「profileセクション」基準に変更
    function getBounds() {
        if (!baseRect) updateBaseRect();
        const containerRect = container.getBoundingClientRect();

        return {
            minX: containerRect.left - baseRect.left,
            maxX: containerRect.right - baseRect.right,
            minY: containerRect.top - baseRect.top,
            maxY: containerRect.bottom - baseRect.bottom
        };
    }

    function clampValue(v, min, max) {
        return Math.min(Math.max(v, min), max);
    }

    function dragStart(e) {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        updateBaseRect();

        isDragging = true;
        card.classList.add('dragging');

        const point = getPoint(e);
        startX = point.x;
        startY = point.y;
        initialX = currentX;
        initialY = currentY;

        lastX = point.x;
        lastY = point.y;
        lastTime = Date.now();
        velocityX = 0;
        velocityY = 0;
    }

    function dragMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        const point = getPoint(e);
        const dx = point.x - startX;
        const dy = point.y - startY;

        let targetX = initialX + dx;
        let targetY = initialY + dy;

        const bounds = getBounds();

        targetX = applyResistance(targetX, bounds.minX, bounds.maxX);
        targetY = applyResistance(targetY, bounds.minY, bounds.maxY);

        currentX = targetX;
        currentY = targetY;

        card.style.transform = `translate(${currentX}px, ${currentY}px)`;

        const now = Date.now();
        const dt = now - lastTime;
        if (dt > 0) {
            velocityX = (point.x - lastX) / dt * 16;
            velocityY = (point.y - lastY) / dt * 16;
        }
        lastX = point.x;
        lastY = point.y;
        lastTime = now;
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

    function dragEnd() {
        if (!isDragging) return;
        isDragging = false;
        card.classList.remove('dragging');

        animate();
    }

    function animate() {
        const bounds = getBounds();

        let forceX = 0;
        let forceY = 0;

        if (currentX < bounds.minX) {
            forceX = (bounds.minX - currentX) * springStrength;
        } else if (currentX > bounds.maxX) {
            forceX = (bounds.maxX - currentX) * springStrength;
        }

        if (currentY < bounds.minY) {
            forceY = (bounds.minY - currentY) * springStrength;
        } else if (currentY > bounds.maxY) {
            forceY = (bounds.maxY - currentY) * springStrength;
        }

        if (forceX !== 0 || forceY !== 0) {
            velocityX += forceX;
            velocityY += forceY;
            velocityX *= springDamping;
            velocityY *= springDamping;
        } else {
            velocityX *= friction;
            velocityY *= friction;
        }

        currentX += velocityX;
        currentY += velocityY;

        card.style.transform = `translate(${currentX}px, ${currentY}px)`;

        const settled =
            Math.abs(velocityX) < minVelocity &&
            Math.abs(velocityY) < minVelocity &&
            currentX >= bounds.minX && currentX <= bounds.maxX &&
            currentY >= bounds.minY && currentY <= bounds.maxY;

        if (settled) {
            currentX = clampValue(currentX, bounds.minX, bounds.maxX);
            currentY = clampValue(currentY, bounds.minY, bounds.maxY);
            card.style.transform = `translate(${currentX}px, ${currentY}px)`;
            animationFrame = null;
            return;
        }

        animationFrame = requestAnimationFrame(animate);
    }

    window.addEventListener('resize', () => {
        updateBaseRect();
    });

    card.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);

    card.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);
});