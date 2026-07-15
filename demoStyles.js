<script>
    (function () {
    const demoStyles = document.createElement('style');
    demoStyles.innerHTML = `
        .mc-demo-trigger { position: fixed; bottom: 32px; right: 32px; height: 56px; padding: 0 24px; background: #1A1B22; color: #FFF; border: none; border-radius: 28px; font-family: 'Inter', sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; box-shadow: 0 12px 24px rgba(26,27,34,0.3); display: flex; align-items: center; gap: 10px; z-index: 9999; transition: transform 0.2s, box-shadow 0.2s; }
        .mc-demo-trigger:hover { transform: translateY(-4px); box-shadow: 0 16px 32px rgba(26,27,34,0.4); }
        .mc-demo-trigger svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.5; stroke-linecap: round; }
        .mc-demo-panel { position: fixed; bottom: 100px; right: 32px; width: 340px; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(0,0,0,0.08); border-radius: 24px; box-shadow: 0 24px 80px rgba(0,0,0,0.15); z-index: 9998; font-family: 'Inter', sans-serif; overflow: hidden; opacity: 0; visibility: hidden; transform: translateY(20px) scale(0.95); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; max-height: calc(100vh - 140px); }
        .mc-demo-panel.is-open { opacity: 1; visibility: visible; transform: translateY(0) scale(1); }
        .mc-demo-header { padding: 20px 24px; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: space-between; }
        .mc-demo-title { font-size: 16px; font-weight: 800; color: #1A1B22; margin: 0; }
        .mc-demo-close { width: 32px; height: 32px; background: #F1F3FA; border: none; border-radius: 50%; color: #8B8FA8; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .mc-demo-close:hover { background: #E4E6F0; color: #1A1B22; }
        .mc-demo-body { padding: 0; overflow-y: auto; flex: 1; scrollbar-width: none; }
        .mc-demo-body::-webkit-scrollbar { display: none; }
        .mc-demo-section { padding: 24px; border-bottom: 1px solid rgba(0,0,0,0.06); }
        .mc-demo-section:last-child { border-bottom: none; }
        .mc-demo-label { display: block; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #8B8FA8; margin-bottom: 16px; letter-spacing: 0.5px; }
        .mc-demo-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .mc-demo-row:last-child { margin-bottom: 0; }
        .mc-demo-row-text { font-size: 14px; font-weight: 600; color: #1A1B22; }
        .mc-demo-switch { position: relative; width: 44px; height: 24px; background: #E4E6F0; border-radius: 24px; cursor: pointer; transition: 0.3s; display: block; }
        .mc-demo-switch input { display: none; }
        .mc-demo-slider { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: #FFF; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .mc-demo-switch input:checked + .mc-demo-slider { transform: translateX(20px); }
        .mc-demo-switch:has(input:checked) { background: #00B35A; }
        .mc-demo-select { width: 100%; height: 40px; background: #F1F3FA; border: 1px solid transparent; border-radius: 10px; padding: 0 12px; font-family: inherit; font-size: 13px; font-weight: 600; color: #1A1B22; outline: none; cursor: pointer; margin-bottom: 16px; }
        .mc-demo-select:focus { border-color: #1A1B22; }
        .mc-demo-input { width: 70px; height: 32px; background: #F1F3FA; border: 1px solid transparent; border-radius: 8px; text-align: center; font-family: inherit; font-size: 13px; font-weight: 700; color: #1A1B22; outline: none; transition: 0.2s; }
        .mc-demo-input:focus { border-color: #1A1B22; }
        .mc-demo-color-picker { width: 32px; height: 32px; border: none; border-radius: 8px; cursor: pointer; padding: 0; background: transparent; }
        .mc-demo-color-picker::-webkit-color-swatch-wrapper { padding: 0; }
        .mc-demo-color-picker::-webkit-color-swatch { border: 2px solid rgba(0,0,0,0.1); border-radius: 8px; }
    `;
    document.head.appendChild(demoStyles);

    const dynamicFeaturesStyle = document.createElement('style');
    dynamicFeaturesStyle.id = 'mc-demo-dynamic-styles';
    document.head.appendChild(dynamicFeaturesStyle);

    function updateDynamicStyles() {
        let css = '';
        if (!document.getElementById('demo-tog-credit').checked) css += `.modal-credit-block, .card-btn-credit { display: none !important; }`;
        if (!document.getElementById('demo-tog-discount').checked) {
            css += `.badge-discount, .price-old, .modal-discount-badge, .modal-price-old { display: none !important; }`;
            css += `.modal-price-row { display: block !important; }`;
        }
        if (!document.getElementById('demo-tog-desc').checked) css += `#modalDescBlock { display: none !important; }`;
        dynamicFeaturesStyle.innerHTML = css;
    }

    const widgetHTML = `
        <button class="mc-demo-trigger" id="mc-demo-trigger"><svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>Настроить дизайн</button>
        <div class="mc-demo-panel" id="mc-demo-panel">
            <div class="mc-demo-header">
                <h3 class="mc-demo-title">Настройки демо</h3>
                <button class="mc-demo-close" id="mc-demo-close">×</button>
            </div>
            <div class="mc-demo-body">
                <div class="mc-demo-section">
                    <span class="mc-demo-label">Внешний вид</span>
                    <select class="mc-demo-select" id="demo-layout">
                        <option value="horizontal">Сетка фильтров (Горизонтально)</option>
                        <option value="vertical">Сайдбар слева (Вертикально)</option>
                        <option value="showcase">Витрина (Только карточки)</option>
                    </select>
                    <div class="mc-demo-row" id="demo-showcase-limit-row" style="display: none;">
                        <span class="mc-demo-row-text">Количество карточек</span>
                        <input type="number" id="demo-showcase-limit" class="mc-demo-input" min="1" max="100" value="9">
                    </div>
                    <div class="mc-demo-row">
                        <span class="mc-demo-row-text">Темная тема</span>
                        <label class="mc-demo-switch"><input type="checkbox" id="demo-tog-theme"><div class="mc-demo-slider"></div></label>
                    </div>
                    <div class="mc-demo-row">
                        <span class="mc-demo-row-text">Цветовая тема (Умная)</span>
                        <input type="color" class="mc-demo-color-picker" id="demo-color-primary" value="#FFD100">
                    </div>
                </div>
                <div class="mc-demo-section">
                    <span class="mc-demo-label">Отображение</span>
                    <div class="mc-demo-row"><span class="mc-demo-row-text">Показывать скидки</span><label class="mc-demo-switch"><input type="checkbox" id="demo-tog-discount" checked><div class="mc-demo-slider"></div></label></div>
                    <div class="mc-demo-row"><span class="mc-demo-row-text">Блок «В кредит»</span><label class="mc-demo-switch"><input type="checkbox" id="demo-tog-credit" checked><div class="mc-demo-slider"></div></label></div>
                    <div class="mc-demo-row"><span class="mc-demo-row-text">Текстовое описание</span><label class="mc-demo-switch"><input type="checkbox" id="demo-tog-desc" checked><div class="mc-demo-slider"></div></label></div>
                </div>
                <div class="mc-demo-section">
                    <span class="mc-demo-label">Формула кредита</span>
                    <div class="mc-demo-row"><span class="mc-demo-row-text">Срок (лет)</span><input type="number" id="demo-cr-term" class="mc-demo-input" min="1" max="30"></div>
                    <div class="mc-demo-row"><span class="mc-demo-row-text">Первый взнос (%)</span><input type="number" id="demo-cr-dp" class="mc-demo-input" min="0" max="100"></div>
                    <div class="mc-demo-row"><span class="mc-demo-row-text">Наценка (%)</span><input type="number" id="demo-cr-markup" class="mc-demo-input" min="0" max="100"></div>
                </div>
                <div class="mc-demo-section" id="demo-filters-wrap">
                    <span class="mc-demo-label">Фильтры</span>
                    <div id="demo-filters-loading" style="font-size: 13px; color: #8B8FA8;">Сбор фильтров...</div>
                    <div id="demo-filters-list"></div>
                </div>
            </div>
        </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = widgetHTML;
    document.body.appendChild(container);

    const panel = document.getElementById('mc-demo-panel');
    const catalogRoot = document.querySelector('.make-catalog');
    const colorPicker = document.getElementById('demo-color-primary');
    const themeToggle = document.getElementById('demo-tog-theme');

    const layoutSelect = document.getElementById('demo-layout');
    const limitRow = document.getElementById('demo-showcase-limit-row');
    const limitInput = document.getElementById('demo-showcase-limit');

    const crTerm = document.getElementById('demo-cr-term'), crDp = document.getElementById('demo-cr-dp'), crMarkup = document.getElementById('demo-cr-markup');

    if (window.makeCatalogConfig) {
        if (window.makeCatalogConfig.themeColor) colorPicker.value = window.makeCatalogConfig.themeColor;
        if (window.makeCatalogConfig.themeMode === 'dark') themeToggle.checked = true;
        if (window.makeCatalogConfig.credit) {
            crTerm.value = window.makeCatalogConfig.credit.termYears;
            crDp.value = window.makeCatalogConfig.credit.downPaymentPercent;
            crMarkup.value = window.makeCatalogConfig.credit.markupPercent;
        }
    }

    document.getElementById('mc-demo-trigger').addEventListener('click', () => panel.classList.add('is-open'));
    document.getElementById('mc-demo-close').addEventListener('click', () => panel.classList.remove('is-open'));
    colorPicker.addEventListener('input', (e) => { if(window.makeCatalogApplyTheme) window.makeCatalogApplyTheme(e.target.value, themeToggle.checked ? 'dark' : 'light'); });
    themeToggle.addEventListener('change', (e) => { if(window.makeCatalogApplyTheme) window.makeCatalogApplyTheme(colorPicker.value, e.target.checked ? 'dark' : 'light'); });

    // Обработчики нового селекта и инпута для Витрины (Showcase)
    layoutSelect.addEventListener('change', (e) => {
        const layout = e.target.value;
        if (layout === 'showcase') {
            limitRow.style.display = 'flex';
            if (window.makeCatalogSetLayout) window.makeCatalogSetLayout('showcase', parseInt(limitInput.value) || 9);
        } else {
            limitRow.style.display = 'none';
            if (window.makeCatalogSetLayout) window.makeCatalogSetLayout(layout);
        }
    });
    limitInput.addEventListener('input', (e) => {
        if (layoutSelect.value === 'showcase' && window.makeCatalogSetLayout) {
            window.makeCatalogSetLayout('showcase', parseInt(e.target.value) || 9);
        }
    });

    ['demo-tog-discount', 'demo-tog-credit', 'demo-tog-desc'].forEach(id => { document.getElementById(id).addEventListener('change', updateDynamicStyles); });

    ['demo-cr-term', 'demo-cr-dp', 'demo-cr-markup'].forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            if (!window.makeCatalogConfig) return;
            const val = parseFloat(e.target.value) || 0;
            if (id === 'demo-cr-term') window.makeCatalogConfig.credit.termYears = val;
            if (id === 'demo-cr-dp') window.makeCatalogConfig.credit.downPaymentPercent = val;
            if (id === 'demo-cr-markup') window.makeCatalogConfig.credit.markupPercent = val;
            if (window.makeCatalogReRender) window.makeCatalogReRender();
        });
    });

    function initFiltersToggle() {
        const filtersList = document.getElementById('demo-filters-list');
        const renderedFilters = document.querySelectorAll('.make-catalog .filter-group[data-key]');
        if (renderedFilters.length === 0) return false;

        document.getElementById('demo-filters-loading').style.display = 'none';
        filtersList.innerHTML = '';
        renderedFilters.forEach(group => {
            const key = group.dataset.key, labelEl = group.querySelector('.filter-label');
            if (!labelEl) return;
            filtersList.insertAdjacentHTML('beforeend', `
                <div class="mc-demo-row">
                    <span class="mc-demo-row-text">${labelEl.textContent}</span>
                    <label class="mc-demo-switch">
                        <input type="checkbox" checked data-filter-target="${key}"><div class="mc-demo-slider"></div>
                    </label>
                </div>
            `);
        });

        filtersList.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const targetKey = e.target.dataset.filterTarget;
                const targetGroup = document.querySelector(`.make-catalog .filter-group[data-key="${targetKey}"]`);
                if (targetGroup) targetGroup.style.display = e.target.checked ? '' : 'none';
            });
        });
        return true;
    }

    const checkInterval = setInterval(() => { if (initFiltersToggle()) clearInterval(checkInterval); }, 500);
})();
</script>