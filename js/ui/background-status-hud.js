'use strict';

export function initBackgroundStatusHUD() {
    const STATE = {
        tasks: new Map(),
        container: null,
        cardEl: null,
        completionCardEl: null,
        barEl: null,
        titleEl: null,
        percentEl: null,
        hasShownCompletion: false,
        rafId: null,
        lastVisualPercent: 0,
        autoHideTimeoutId: null,
        dismissing: false,
        pendingDismissAfterActivity: null,
        activityListenersRemoved: false,
        _onActivity: null,
    };

    const DISMISS_AFTER_ACTIVITY_DELAY_MS = 2000;
    const MAX_HUD_DISPLAY_TIME = 30000;

    function ensureStyles() {
        if (document.getElementById('bg-status-hud-styles')) return;
        const css = `
    #bg-status-hud {
      position: fixed; right: 16px; top: 16px; z-index: 9998;
      width: 320px; max-width: calc(100vw - 32px);
      font-family: inherit;
      color: var(--color-text-primary, #111);
    }
    #bg-status-hud .hud-card{
      background: var(--color-surface-2, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px 14px; backdrop-filter: saturate(1.1) blur(2px);
      position: relative;
      transition: transform 0.3s ease-out;
    }
    #bg-status-hud .hud-title { display:flex; align-items:center; gap:8px;
      font-weight:600; font-size:14px; margin-bottom:8px; }
    #bg-status-hud .hud-title .dot { width:8px; height:8px; border-radius:9999px;
      background: var(--color-primary, #2563eb); box-shadow:0 0 0 3px color-mix(in srgb, var(--color-primary, #2563eb) 30%, transparent); }
    #bg-status-hud .hud-sub { font-size:12px; opacity:.8; margin-bottom:8px; }
    #bg-status-hud .hud-progress { width:100%; height:10px; border-radius:9999px;
      background: color-mix(in srgb, var(--color-surface-2, #fff) 60%, var(--color-text-primary, #111) 10%);
      overflow:hidden; border:1px solid var(--color-border, rgba(0,0,0,.12));
    }
    #bg-status-hud .hud-bar {
      height:100%; width:0%;
      background: linear-gradient(90deg,
        color-mix(in srgb, var(--color-primary, #2563eb) 95%, #fff 5%),
        color-mix(in srgb, var(--color-primary, #2563eb) 80%, #fff 20%)
      );
      transition: width .28s ease, background .3s ease, animation .3s ease;
      background-size: 24px 24px;
      animation: hud-stripes 2.2s linear infinite;
    }
    #bg-status-hud .hud-bar.completed {
      animation: none !important;
      background: var(--color-primary, #2563eb) !important;
      background-size: auto !important;
    }
    #bg-status-hud .hud-footer { display:flex; justify-content:flex-start; align-items:center; margin-top:8px; font-size:12px; opacity:.9; gap:8px; }
    #bg-status-hud .hud-close {
      position: absolute; top: 8px; right: 8px;
      width: 28px; height: 28px; border-radius: 8px;
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      background: color-mix(in srgb, var(--color-surface-2, #fff) 85%, var(--color-text-primary, #111) 5%);
      color: var(--color-text-primary, #111);
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; opacity: .75;
    }
    #bg-status-hud .hud-close:hover { opacity: 1; }
    #bg-status-hud .hud-close:focus { outline: 2px solid color-mix(in srgb, var(--color-primary, #2563eb) 60%, transparent); outline-offset: 2px; }
    #bg-status-hud #bg-hud-percent { display: none !important; }
    #bg-status-hud { display: flex; flex-direction: column; gap: 10px; }
    #bg-status-hud .hud-completion-card {
      background: var(--color-surface-2, #fff);
      border: 1px solid var(--color-border, rgba(0,0,0,.12));
      border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px 14px; backdrop-filter: saturate(1.1) blur(2px);
      position: relative;
      transition: transform 0.3s ease-out;
      display: flex; align-items: center; gap: 10px;
      color: var(--color-text-primary, #111);
    }
    #bg-status-hud .hud-completion-card .hud-completion-icon { color: var(--color-success, #16a34a); font-size: 18px; }
    #bg-status-hud .hud-completion-card .hud-completion-text { font-size: 14px; font-weight: 600; }
    @media (prefers-reduced-motion: reduce){ #bg-status-hud .hud-bar{ animation: none; } }
    @keyframes hud-stripes{ 0%{ background-position: 0 0; } 100%{ background-position: 24px 0; } }
  `;
        const style = document.createElement('style');
        style.id = 'bg-status-hud-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    function ensureContainer() {
        if (STATE.container) return;
        ensureStyles();
        const root = document.createElement('div');
        root.id = 'bg-status-hud';
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');
        root.style.display = 'none';
        root.innerHTML = `
    <div class="hud-card">
      <button type="button" id="bg-hud-close" class="hud-close" aria-label="Скрыть">✕</button>
      <div class="hud-title"><span class="dot"></span><span>Фоновая инициализация...</span></div>
      <div class="hud-sub" id="bg-hud-title">Подготовка…</div>
      <div class="hud-progress"><div class="hud-bar" id="bg-hud-bar"></div></div>
      <div class="hud-footer"></div>
    </div>`;
        document.body.appendChild(root);
        STATE.container = root;
        STATE.cardEl = root.querySelector('.hud-card');
        STATE.barEl = root.querySelector('#bg-hud-bar');
        STATE.titleEl = root.querySelector('#bg-hud-title');
        STATE.percentEl = root.querySelector('#bg-hud-percent');
        root.querySelector('#bg-hud-close').addEventListener('click', () => dismissAnimated());
    }

    function computeTopOffset() {
        let top = 16;
        const imp = document.getElementById('important-notifications-container');
        if (imp && imp.children.length > 0) {
            const s = parseInt(getComputedStyle(imp).top || '0', 10);
            top = Math.max(top, s + imp.offsetHeight + 8);
        }
        const toast = document.getElementById('notification-container');
        if (toast && toast.children.length > 0) {
            top = Math.max(top, 90);
        }
        STATE.container.style.top = `${top}px`;
    }

    function aggregatePercent() {
        let totalWeight = 0;
        let acc = 0;
        for (const t of STATE.tasks.values()) {
            if (!t.total || t.total <= 0) continue;
            const w = t.weight ?? 1;
            totalWeight += w;
            acc += w * Math.min(1, t.processed / t.total);
        }
        if (totalWeight === 0) return 0;
        return (acc / totalWeight) * 100;
    }

    function tick() {
        const target = aggregatePercent();
        const next =
            STATE.lastVisualPercent +
            Math.min(2.5, Math.max(0.4, (target - STATE.lastVisualPercent) * 0.2));
        STATE.lastVisualPercent = Math.min(100, Math.max(0, next));
        if (STATE.barEl) {
            STATE.barEl.style.width = `${STATE.lastVisualPercent.toFixed(1)}%`;
            if (STATE.tasks.size === 0) {
                STATE.lastVisualPercent = 100;
                STATE.barEl.style.width = '100%';
                STATE.barEl.classList.add('completed');
            } else {
                STATE.barEl.classList.remove('completed');
            }
        }
        if (STATE.percentEl)
            STATE.percentEl.textContent = `${Math.round(STATE.lastVisualPercent)}%`;
        if (STATE.tasks.size > 0) STATE.rafId = requestAnimationFrame(tick);
    }

    function show() {
        ensureContainer();
        computeTopOffset();
        STATE.container.style.display = '';
        if (!STATE.rafId) STATE.rafId = requestAnimationFrame(tick);

        if (STATE.autoHideTimeoutId) {
            clearTimeout(STATE.autoHideTimeoutId);
        }
        STATE.autoHideTimeoutId = setTimeout(() => {
            console.warn(
                '[BackgroundStatusHUD] Принудительное скрытие по таймауту. Незавершённые задачи:',
                [...STATE.tasks.keys()],
            );
            STATE.tasks.clear();
            hide();
        }, MAX_HUD_DISPLAY_TIME);
    }

    function removeActivityListeners() {
        if (STATE.activityListenersRemoved) return;
        STATE.activityListenersRemoved = true;
        if (STATE.pendingDismissAfterActivity) {
            clearTimeout(STATE.pendingDismissAfterActivity);
            STATE.pendingDismissAfterActivity = null;
        }
        document.removeEventListener('mousemove', STATE._onActivity);
        document.removeEventListener('keydown', STATE._onActivity);
        document.removeEventListener('touchstart', STATE._onActivity);
        STATE._onActivity = null;
    }

    function hide() {
        removeActivityListeners();
        if (!STATE.container) return;
        STATE.container.style.display = 'none';
        if (STATE.cardEl) {
            STATE.cardEl.style.transform = '';
            STATE.cardEl.style.transition = '';
        }
        if (STATE.completionCardEl && STATE.completionCardEl.parentNode) {
            STATE.completionCardEl.remove();
            STATE.completionCardEl = null;
        }
        if (STATE.rafId) cancelAnimationFrame(STATE.rafId);
        STATE.rafId = null;
        STATE.lastVisualPercent = 0;
        STATE.dismissing = false;
        if (STATE.autoHideTimeoutId) {
            clearTimeout(STATE.autoHideTimeoutId);
            STATE.autoHideTimeoutId = null;
        }
    }

    function dismissAnimated(onDone) {
        if (!STATE.container || STATE.dismissing) {
            if (onDone) onDone();
            return;
        }
        STATE.dismissing = true;
        const card = STATE.cardEl || STATE.container.querySelector('.hud-card');
        const cardsToAnimate = [card, STATE.completionCardEl].filter(Boolean);
        if (cardsToAnimate.length === 0) {
            hide();
            if (onDone) onDone();
            return;
        }
        const duration = 300;
        cardsToAnimate.forEach((el) => {
            el.style.transition = `transform ${duration}ms ease-out`;
            el.style.transform = 'translateX(calc(100% + 32px))';
        });
        let ended = 0;
        const onEnd = () => {
            ended += 1;
            if (ended < cardsToAnimate.length) return;
            cardsToAnimate.forEach((el) => el.removeEventListener('transitionend', onEnd));
            clearTimeout(fallback);
            hide();
            if (onDone) onDone();
        };
        cardsToAnimate.forEach((el) => el.addEventListener('transitionend', onEnd));
        const fallback = setTimeout(onEnd, duration + 50);
    }

    function updateTitle() {
        const active = [...STATE.tasks.values()];
        if (!STATE.titleEl) return;
        if (active.length === 0) {
            STATE.titleEl.textContent = 'Готово';
            if (STATE.barEl) {
                STATE.lastVisualPercent = 100;
                STATE.barEl.style.width = '100%';
                STATE.barEl.classList.add('completed');
            }
            return;
        }
        const main = active[0];
        const others = Math.max(0, active.length - 1);
        const prefix = main.id === 'app-init' ? 'Выполняется' : 'Индексируется';
        STATE.titleEl.textContent =
            others > 0
                ? `${prefix}: ${main.label} + ещё ${others}`
                : `${prefix}: ${main.label}`;
    }

    function showCompletionCard() {
        if (!STATE.container || STATE.hasShownCompletion || STATE.completionCardEl) return;
        STATE.hasShownCompletion = true;
        const card = document.createElement('div');
        card.className = 'hud-completion-card';
        card.setAttribute('role', 'status');
        card.innerHTML = `
            <span class="hud-completion-icon" aria-hidden="true"><i class="fas fa-check-circle"></i></span>
            <span class="hud-completion-text">Приложение полностью загружено</span>`;
        STATE.container.appendChild(card);
        STATE.completionCardEl = card;
    }

    function scheduleDismissAfterActivity() {
        STATE._onActivity = () => {
            removeActivityListeners();
            STATE.pendingDismissAfterActivity = setTimeout(() => {
                STATE.pendingDismissAfterActivity = null;
                dismissAnimated(() => {});
            }, DISMISS_AFTER_ACTIVITY_DELAY_MS);
        };
        document.addEventListener('mousemove', STATE._onActivity, { once: false, passive: true });
        document.addEventListener('keydown', STATE._onActivity, { once: false });
        document.addEventListener('touchstart', STATE._onActivity, { once: false, passive: true });
    }

    function maybeFinishAll() {
        if (STATE.tasks.size === 0) {
            if (STATE.barEl) {
                STATE.lastVisualPercent = 100;
                STATE.barEl.style.width = '100%';
                STATE.barEl.classList.add('completed');
            }
            setTimeout(() => {
                showCompletionCard();
                scheduleDismissAfterActivity();
            }, 300);
        }
    }

    const API = {
        startTask(id, label, opts = {}) {
            console.log(`[BackgroundStatusHUD] startTask: ${id} (${label})`);
            ensureContainer();
            STATE.tasks.set(id, {
                id,
                label,
                weight: typeof opts.weight === 'number' ? opts.weight : 1,
                processed: 0,
                total: Math.max(1, opts.total ?? 100),
            });
            updateTitle();
            show();
        },
        updateTask(id, processed, total) {
            const t = STATE.tasks.get(id);
            if (!t) return;
            if (typeof total === 'number' && total > 0) t.total = total;
            if (typeof processed === 'number') {
                t.processed = Math.min(total ?? t.total, Math.max(0, processed));
            }
            computeTopOffset();
            updateTitle();
        },
        finishTask(id, success = true) {
            console.log(
                `[BackgroundStatusHUD] finishTask: ${id} (success: ${success}). Оставшиеся задачи: ${STATE.tasks.size - 1}`,
            );
            STATE.tasks.delete(id);
            updateTitle();
            maybeFinishAll();
        },
        reportIndexProgress(processed, total, error) {
            const id = 'search-index-build';
            if (!STATE.tasks.has(id)) {
                API.startTask(id, 'Индексация контента', {
                    weight: 0.6,
                    total: Math.max(1, total || 100),
                });
            }
            if (error) {
                API.finishTask(id, false);
            } else {
                API.updateTask(id, processed, total);
                if (total && processed >= total) API.finishTask(id, true);
            }
        },
    };

    return API;
}
