<script>
document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // КОНФИГУРАЦИЯ КАТАЛОГА
    // ==========================================
    const APP_CONFIG = {
        feedUrls: [
            'https://dhost.makeagency.ru/playback/test-catalog-feed.json',
            'http://s3.hommenest.ru/digital/backup/test-catalog-feed.json'
        ],
        cacheName: 'make_catalog_cache',
        cacheTTL: 25 * 60 * 1000, 
        autoLayoutThreshold: 5, // <--- Умный порог адаптивности: если включено больше 5 фильтров, сетка станет горизонтальной
        
        filters: [
            { key: 'original_mark_id', type: 'select', label: 'Марка',           enabled: true },
            { key: 'model',            type: 'select', label: 'Модель',          enabled: true, dependsOn: 'original_mark_id' },
            { key: 'generation',       type: 'select', label: 'Поколение',       enabled: false, dependsOn: 'model' },
            { key: 'price',            type: 'minmax', label: 'Стоимость, ₽',    enabled: true, step: 100000 },
            { key: 'year',             type: 'minmax', label: 'Год выпуска',     enabled: true, step: 1 },
            { key: 'run',              type: 'minmax', label: 'Пробег, км',      enabled: true, step: 10000 },
            { key: 'body_type',        type: 'select', label: 'Тип кузова',      enabled: true },
            { key: 'gearbox',          type: 'select', label: 'Коробка передач', enabled: true },
            { key: 'engine_type',      type: 'select', label: 'Двигатель',       enabled: true },
            { key: 'engine_volume',    type: 'minmax', label: 'Объем, л',        enabled: true, step: 0.5},
            { key: 'drive',            type: 'select', label: 'Тип привода',     enabled: true },
            { key: 'color',            type: 'select', label: 'Цвет кузова',     enabled: true },
            { key: 'pts',              type: 'select', label: 'ПТС',             enabled: true },
            { key: 'owners_number',    type: 'select', label: 'Владельцев',      enabled: true },
            { key: 'wheel',            type: 'toggle', label: 'Руль',            enabled: true },
            { key: 'salon',            type: 'select', label: 'Автосалон',       enabled: false }
        ]
    };

    const TILDA_CONFIG = {
        modelFieldName: 'Модель',
        popupHooks: ['#popup:model', '#popup:report'],
        getSelectors: (name) => [
            `input[name="${name}"]`, `textarea[name="${name}"]`, `select[name="${name}"]`,
            `input[data-tilda-name="${name}"]`, `textarea[data-tilda-name="${name}"]`, `[data-tilda-name="${name}"]`
        ]
    };

    // ========== DOM КЭШ И ПЕРЕМЕННЫЕ ==========
    const FDOM = {
        cardsContainer: document.getElementById('cards-grid'),
        randomGrid: document.querySelector('[data-make-random-grid]'),
        pagination: document.getElementById('pagination-container')
    };

    const hasFullCatalog = !!FDOM.cardsContainer;
    const hasRandomCatalog = !!FDOM.randomGrid;
    const randomCatalogLimit = hasRandomCatalog ? Math.max(1, parseInt(FDOM.randomGrid.getAttribute('data-limit') || '9', 10)) : 9;

    let cars = [];
    let filteredCars = [];
    let lastLeadCar = null;
    const filterInstances = { multiselects: {} };
    
    let currentPage = 1;
    let pageSize = parseInt(document.getElementById('page-size')?.value) || 16; 
    let lazyObserver = null;

    const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-family="Arial" font-size="16" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">Нет фото</text></svg>'
    );

    // ========== УТИЛИТЫ И SEO ==========
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function formatNum(n) { return Number(n).toLocaleString('ru-RU'); }
    function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }
    
    // Функция склонения слов (1 автомобиль, 2 автомобиля, 5 автомобилей)
    function getDeclension(number, words) {
        const value = Math.abs(number) % 100; 
        const num = value % 10;
        if(value > 10 && value < 20) return words[2]; 
        if(num > 1 && num < 5) return words[1];
        if(num == 1) return words[0]; 
        return words[2];
    }

    let scrollbarWidth = null;
    function getScrollbarWidth() {
        if (scrollbarWidth !== null) return scrollbarWidth;
        scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        return scrollbarWidth;
    }
    function lockBodyScroll() { document.body.style.paddingRight = getScrollbarWidth() + 'px'; document.body.style.overflow = 'hidden'; }
    function unlockBodyScroll() { document.body.style.paddingRight = ''; document.body.style.overflow = ''; }

    function generateSEOLinks() {
        const seoContainer = document.getElementById('seo-links-container');
        if (!seoContainer || !cars.length) return;
        const baseUrl = window.location.href.split('?')[0];
        const html = cars.map(car => `<a href="${baseUrl}?car=${car.id}">${escapeHtml(car.mark_id)} ${escapeHtml(car.year)}</a>`).join(' | ');
        seoContainer.innerHTML = html;
    }

    function renderSkeletons(count = 9) {
        const target = FDOM.cardsContainer || FDOM.randomGrid;
        if (!target) return;
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
            <div class="skeleton-card">
                <div class="skeleton-image"></div>
                <div class="skeleton-content">
                    <div class="skeleton-line title"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line" style="width: 50%"></div>
                    <div class="skeleton-line price"></div>
                    <div class="skeleton-btn"></div>
                </div>
            </div>`;
        }
        target.innerHTML = html;
    }

    // ========== ИНДЕКСИРОВАННАЯ БД ==========
    function openCacheDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(APP_CONFIG.cacheName, 1);
            req.onupgradeneeded = () => req.result.createObjectStore('feed');
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    }
    async function getCachedFeed() {
        try {
            const db = await openCacheDB();
            return new Promise(res => {
                const req = db.transaction('feed', 'readonly').objectStore('feed').get('current');
                req.onsuccess = () => res((req.result && Date.now() - req.result.ts <= APP_CONFIG.cacheTTL) ? req.result.data : null);
                req.onerror = () => res(null);
            });
        } catch(e) { return null; }
    }
    async function setCachedFeed(data) {
        try {
            const db = await openCacheDB();
            db.transaction('feed', 'readwrite').objectStore('feed').put({ ts: Date.now(), data }, 'current');
        } catch(e) {}
    }

    // ========== URL МЕНЕДЖЕР ==========
    class URLManager {
        constructor() { this.init(); }
        init() {
            window.addEventListener('popstate', () => this.handleUrlChange());
            setTimeout(() => this.handleUrlChange(), 100);
        }
        updateUrl(carId) {
            const url = new URL(window.location);
            url.searchParams.set('car', carId);
            window.history.pushState({ carId }, '', url);
        }
        clearCarUrl() {
            const url = new URL(window.location);
            url.searchParams.delete('car');
            window.history.replaceState(null, '', url);
        }
        syncFiltersToUrl() {
            if (!hasFullCatalog) return;
            const url = new URL(window.location);
            const setP = (k, v) => (v && v !== 'default' && v !== 'all') ? url.searchParams.set(k, v) : url.searchParams.delete(k);
            
            setP('sort', document.getElementById('sort-select')?.value);

            APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
                if (f.type === 'multiselect') {
                    const sel = filterInstances.multiselects[f.key]?.getSelectedValues() || [];
                    setP(f.key, sel.join(','));
                } else if (f.type === 'select') {
                    setP(f.key, document.getElementById(`sel-${f.key}`)?.value);
                } else if (f.type === 'minmax') {
                    setP(`${f.key}Min`, document.getElementById(`sel-${f.key}-min`)?.value);
                    setP(`${f.key}Max`, document.getElementById(`sel-${f.key}-max`)?.value);
                } else if (f.type === 'toggle') {
                    setP(f.key, document.querySelector(`#tog-${f.key} .is-active`)?.dataset.val);
                }
            });
            window.history.replaceState(null, '', url);
        }
        loadFiltersFromUrl() {
            if (!hasFullCatalog) return;
            const url = new URL(window.location);
            
            const sortEl = document.getElementById('sort-select');
            if (sortEl && url.searchParams.has('sort')) sortEl.value = url.searchParams.get('sort');

            APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
                if (f.type === 'multiselect') {
                    const val = url.searchParams.get(f.key);
                    if (val && filterInstances.multiselects[f.key]) {
                        val.split(',').forEach(v => filterInstances.multiselects[f.key].selectedValues.add(v));
                        filterInstances.multiselects[f.key].renderSelected();
                        filterInstances.multiselects[f.key].renderDropdown();
                    }
                } else if (f.type === 'select') {
                    const el = document.getElementById(`sel-${f.key}`);
                    if (el && url.searchParams.has(f.key)) {
                        const val = url.searchParams.get(f.key);
                        if (!el.querySelector(`option[value="${val}"]`)) {
                            el.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(val)}">${escapeHtml(val)}</option>`);
                        }
                        el.value = val;
                    }
                } else if (f.type === 'minmax') {
                    const minEl = document.getElementById(`sel-${f.key}-min`);
                    const maxEl = document.getElementById(`sel-${f.key}-max`);
                    if (minEl && url.searchParams.has(`${f.key}Min`)) minEl.value = url.searchParams.get(`${f.key}Min`);
                    if (maxEl && url.searchParams.has(`${f.key}Max`)) maxEl.value = url.searchParams.get(`${f.key}Max`);
                } else if (f.type === 'toggle') {
                    const val = url.searchParams.get(f.key);
                    if (val) {
                        const btns = document.querySelectorAll(`#tog-${f.key} .toggle-opt`);
                        btns.forEach(b => b.classList.toggle('is-active', b.dataset.val === val));
                    }
                }
            });
        }
        handleUrlChange() {
            const carId = new URLSearchParams(window.location.search).get('car');
            if (carId) this.openCarFromUrl(carId);
            else if (carDetailModal?.isOpen) carDetailModal.close({ skipUrlClear: true });
        }
        openCarFromUrl(carId) {
            const car = cars.find(c => c.id?.toString() === carId.toString());
            if (car && carDetailModal) setTimeout(() => carDetailModal.open(car), 300);
        }
    }
    const urlManager = new URLManager();

    // ========== МОДАЛЬНОЕ ОКНО ==========
    class CarDetailModal {
        constructor() {
            this.isOpen = false;
            this.overlay = document.getElementById('car-detail-modal');
            this.modal = this.overlay?.querySelector('.modal-box');
            this.track = this.overlay?.querySelector('#modalGalleryTrack');
            this.counterEl = this.overlay?.querySelector('#modalCounter');
            this.previousFocus = null;
            this.handleKeyDown = this.handleKeyDown.bind(this);
            this.init();
        }
        init() {
            if (!this.overlay) return;

            // ФИКС position: fixed ДЛЯ TILDA
            if (this.overlay.parentNode && !this.overlay.parentNode.classList.contains('make-catalog-modal-root')) {
                const rootWrapper = document.createElement('div');
                rootWrapper.className = 'make-catalog make-catalog-modal-root';
                rootWrapper.appendChild(this.overlay);
                document.body.appendChild(rootWrapper);
            }

            this.overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
            this.overlay.querySelector('.modal-nav-prev').addEventListener('click', () => this.prevImage());
            this.overlay.querySelector('.modal-nav-next').addEventListener('click', () => this.nextImage());
            
            this.track.addEventListener('scroll', debounce(() => {
                if (!this.imagesCount) return;
                const isVertical = window.innerWidth > 900;
                let idx = 0;
                
                if (isVertical) {
                    const imgs = Array.from(this.track.querySelectorAll('img'));
                    const trackCenter = this.track.scrollTop + (this.track.clientHeight / 2);
                    let minDiff = Infinity;
                    imgs.forEach((img, i) => {
                        const imgCenter = img.offsetTop + (img.offsetHeight / 2);
                        const diff = Math.abs(trackCenter - imgCenter);
                        if (diff < minDiff) { minDiff = diff; idx = i; }
                    });
                } else {
                    idx = Math.round(this.track.scrollLeft / this.track.clientWidth);
                }
                
                idx = Math.max(0, Math.min(idx, this.imagesCount - 1));
                this.counterEl.textContent = `${idx + 1} / ${this.imagesCount}`;
                
                const thumbs = this.overlay.querySelectorAll('.modal-thumb');
                thumbs.forEach((t, i) => t.classList.toggle('is-active', i === idx));
            }, 50));

            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.close();
            });
        }
        
        handleKeyDown(e) {
            if (!this.isOpen) return;
            if (e.key === 'Escape') { this.close(); return; }
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.nextImage(); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.prevImage(); }

            if (e.key === 'Tab') {
                const focusableElements = this.overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (!focusableElements.length) return;
                const firstElement = focusableElements[0];
                const lastElement = focusableElements[focusableElements.length - 1];

                if (e.shiftKey) { 
                    if (document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else { 
                    if (document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        }

        open(car) {
            this.currentCar = car;
            this.isOpen = true;
            this.previousFocus = document.activeElement; 
            
            urlManager.updateUrl(car.id);
            this.renderGallery(car);
            
            const pillsContainer = this.overlay.querySelector('#modalPills');
            pillsContainer.innerHTML = '';
            if (car.year) pillsContainer.innerHTML += `<span class="ctag">${escapeHtml(car.year)} год</span>`;
            if (car.run) pillsContainer.innerHTML += `<span class="ctag">${escapeHtml(formatNum(car.run))} км</span>`;
            if (car.gearbox) pillsContainer.innerHTML += `<span class="ctag">${escapeHtml(car.gearbox)}</span>`;
            if (car.engine_volume) pillsContainer.innerHTML += `<span class="ctag">${escapeHtml(car.engine_volume)} л</span>`;

            const specsContainer = this.overlay.querySelector('#modalSpecs');
            const specs = [
                { label: 'Кузов', value: car.body_type || 'Не указан' },
                { label: 'Привод', value: car.drive || 'Не указан' },
                { label: 'Двигатель', value: car.engine_type || 'Не указан' },
                { label: 'Цвет', value: car.color || 'Не указан' },
                { label: 'Салон', value: car.salon || 'Не указан' },
                { label: 'ПТС', value: car.pts || 'Оригинал' }
            ];
            specsContainer.innerHTML = specs.map(s => 
                `<div class="modal-spec-tile"><div class="modal-spec-label">${escapeHtml(s.label)}</div><div class="modal-spec-value">${escapeHtml(s.value)}</div></div>`
            ).join('');

            this.overlay.querySelector('#modalTitle').textContent = car.mark_id;
            this.overlay.querySelector('#modalPrice').textContent = car.price ? `${formatNum(car.price)} ₽` : 'Цена по запросу';
            
            const descBlock = this.overlay.querySelector('#modalDescBlock');
            if (car.description) {
                this.overlay.querySelector('#modalDesc').innerHTML = escapeHtml(car.description).replace(/\n/g, '<br>');
                descBlock.style.display = 'block';
            } else descBlock.style.display = 'none';

            const applyBtns = this.overlay.querySelectorAll('.modal-apply-btn, .modal-calc-btn');
            applyBtns.forEach(btn => btn.dataset.carTitle = car.mark_id);

            lockBodyScroll();
            this.overlay.style.display = 'flex';
            this.overlay.classList.remove('hidden');
            
            const rightCol = this.overlay.querySelector('.modal-right');
            if (rightCol) rightCol.scrollTop = 0;
            
            document.addEventListener('keydown', this.handleKeyDown);
            
            setTimeout(() => {
                this.overlay.classList.add('visible');
                const closeBtn = this.overlay.querySelector('.modal-close');
                if (closeBtn) closeBtn.focus();
            }, 10);
        }
        
        close(opts = {}) {
            this.isOpen = false;
            document.removeEventListener('keydown', this.handleKeyDown);
            
            if (!opts.skipUrlClear) urlManager.clearCarUrl();
            this.overlay.classList.remove('visible');
            
            setTimeout(() => {
                this.overlay.classList.add('hidden');
                this.overlay.style.display = 'none';
                unlockBodyScroll();
                if (this.previousFocus) this.previousFocus.focus();
            }, 300);
        }
        
        renderGallery(car) {
            this.track.innerHTML = '';
            const thumbsContainer = this.overlay.querySelector('#modalThumbs');
            thumbsContainer.innerHTML = '';
            
            const images = (Array.isArray(car.images) && car.images.length) ? car.images : [PLACEHOLDER_IMG];
            this.imagesCount = images.length;
            this.counterEl.textContent = `1 / ${this.imagesCount}`;

            images.forEach((src, idx) => {
                const img = document.createElement('img');
                img.src = src;
                img.onerror = function() { this.src = PLACEHOLDER_IMG; };
                this.track.appendChild(img);

                const thumb = document.createElement('button');
                thumb.className = `modal-thumb ${idx === 0 ? 'is-active' : ''}`;
                thumb.innerHTML = `<img src="${escapeHtml(src)}" alt="">`;
                thumb.addEventListener('click', () => {
                    const isVertical = window.innerWidth > 900;
                    if (isVertical) {
                        const targetImg = this.track.querySelectorAll('img')[idx];
                        if (targetImg) this.track.scrollTo({ top: targetImg.offsetTop, behavior: 'smooth' });
                    } else {
                        this.track.scrollTo({ left: this.track.clientWidth * idx, behavior: 'smooth' });
                    }
                });
                thumbsContainer.appendChild(thumb);
            });
        }
        prevImage() { 
            const isVertical = window.innerWidth > 900;
            if (isVertical) {
                this.track.scrollBy({ top: -500, behavior: 'smooth' });
            } else {
                this.track.scrollBy({ left: -this.track.clientWidth, behavior: 'smooth' });
            }
        }
        nextImage() { 
            const isVertical = window.innerWidth > 900;
            if (isVertical) {
                this.track.scrollBy({ top: 500, behavior: 'smooth' });
            } else {
                this.track.scrollBy({ left: this.track.clientWidth, behavior: 'smooth' });
            }
        }
    }
    const carDetailModal = new CarDetailModal();

    // ========== КОМПОНЕНТЫ ФИЛЬТРОВ ==========
    class MultiSelect {
        constructor(container, placeholder) {
            this.container = container;
            this.trigger = container.querySelector('.multiselect-trigger');
            this.dropdown = container.querySelector('.multiselect-dropdown');
            this.selectedContainer = container.querySelector('.multiselect-selected');
            this.selectedValues = new Set();
            this.options = [];
            this.placeholder = placeholder;
            this.init();
        }
        init() {
            this.trigger.addEventListener('click', (e) => { e.stopPropagation(); this.toggle(); });
            document.addEventListener('click', () => this.close());
            this.dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                const opt = e.target.closest('.multiselect-option');
                if (opt) { this.toggleOption(opt.dataset.value); applyFilters(); }
            });
            this.selectedContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                const removeBtn = e.target.closest('.multiselect-tag-remove');
                if (removeBtn) { this.toggleOption(removeBtn.dataset.value); applyFilters(); }
            });
        }
        setOptions(options) { this.options = options; this.renderDropdown(); }
        renderDropdown() {
            let html = '';
            this.options.forEach(opt => {
                const checked = this.selectedValues.has(opt) ? 'checked' : '';
                html += `<div class="multiselect-option" data-value="${escapeHtml(opt)}">
                            <div class="multiselect-checkbox ${checked}"></div>
                            <span>${escapeHtml(opt)}</span>
                         </div>`;
            });
            this.dropdown.innerHTML = html;
        }
        toggleOption(val) {
            this.selectedValues.has(val) ? this.selectedValues.delete(val) : this.selectedValues.add(val);
            this.renderSelected(); this.renderDropdown();
        }
        renderSelected() {
            if (!this.selectedValues.size) {
                this.selectedContainer.innerHTML = `<span class="multiselect-placeholder">${escapeHtml(this.placeholder)}</span>`;
            } else {
                let html = '';
                this.selectedValues.forEach(val => {
                    html += `<div class="multiselect-tag">
                                <span>${escapeHtml(val)}</span>
                                <span class="multiselect-tag-remove" data-value="${escapeHtml(val)}">×</span>
                             </div>`;
                });
                this.selectedContainer.innerHTML = html;
            }
        }
        toggle() { this.dropdown.classList.contains('hidden') ? this.open() : this.close(); }
        open() { this.dropdown.classList.remove('hidden'); this.trigger.classList.add('open'); }
        close() { this.dropdown.classList.add('hidden'); this.trigger.classList.remove('open'); }
        getSelectedValues() { return Array.from(this.selectedValues); }
    }

    // ========== ДИНАМИЧЕСКИЙ РЕНДЕР И ФИЛЬТРАЦИЯ ==========
    function renderFilters() {
        const container = document.getElementById('filters-container');
        if (!container) return;

        // SMART LAYOUT: Умное переключение сетки в зависимости от кол-ва включенных фильтров
        const catalogRoot = document.querySelector('.make-catalog');
        if (catalogRoot) {
            const enabledFiltersCount = APP_CONFIG.filters.filter(f => f.enabled).length;
            const threshold = APP_CONFIG.autoLayoutThreshold || 5;
            if (enabledFiltersCount > threshold) {
                catalogRoot.setAttribute('data-filter-layout', 'horizontal');
            } else {
                catalogRoot.setAttribute('data-filter-layout', 'vertical');
            }
        }
        
        let html = '';
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            html += `<div class="filter-group" data-key="${f.key}">
                <label class="filter-label">${escapeHtml(f.label)}</label>`;
            
            if (f.type === 'multiselect') {
                html += `<div class="multiselect" id="ms-${f.key}">
                  <div class="multiselect-trigger"><div class="multiselect-selected"><span class="multiselect-placeholder">Любой выбор</span></div><svg class="multiselect-arrow" viewBox="0 0 10 7" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                  <div class="multiselect-dropdown hidden"></div></div>`;
            } else if (f.type === 'select') {
                html += `<select class="f-select" id="sel-${f.key}"><option value="">Любой выбор</option></select>`;
            } else if (f.type === 'minmax') {
                html += `
                <div class="minmax-row">
                    <select class="f-select minmax-min" id="sel-${f.key}-min"><option value="">От</option></select>
                    <select class="f-select minmax-max" id="sel-${f.key}-max"><option value="">До</option></select>
                </div>`;
            } else if (f.type === 'toggle') {
                html += `<div class="toggle-row" id="tog-${f.key}" data-key="${f.key}"></div>`;
            }
            html += `</div><div class="f-sep"></div>`;
        });
        
        container.innerHTML = html;
    }

    function updateDependencies() {
        APP_CONFIG.filters.forEach(f => {
            if (!f.enabled || !f.dependsOn) return;
            
            const parentKey = f.dependsOn;
            let parentVals = [];
            const parentF = APP_CONFIG.filters.find(x => x.key === parentKey);
            
            if (parentF) {
                if (parentF.type === 'multiselect') {
                    parentVals = filterInstances.multiselects[parentKey]?.getSelectedValues() || [];
                } else if (parentF.type === 'select') {
                    const v = document.getElementById(`sel-${parentKey}`)?.value;
                    if (v) parentVals.push(v);
                }
            }

            const isParentSelected = parentVals.length > 0;

            if (f.type === 'select') {
                const el = document.getElementById(`sel-${f.key}`);
                if (el) el.disabled = !isParentSelected;
            } else if (f.type === 'multiselect') {
                const msContainer = document.getElementById(`ms-${f.key}`);
                if (msContainer) {
                    isParentSelected ? msContainer.classList.remove('is-disabled') : msContainer.classList.add('is-disabled');
                }
            }

            if (!isParentSelected) {
                if (f.type === 'select') {
                    const el = document.getElementById(`sel-${f.key}`);
                    if (el) {
                        el.innerHTML = `<option value="">Любой выбор</option>`;
                        el.value = '';
                    }
                } else if (f.type === 'multiselect') {
                    const ms = filterInstances.multiselects[f.key];
                    if (ms) {
                        ms.setOptions([]);
                        ms.selectedValues.clear();
                        ms.renderDropdown();
                        ms.renderSelected();
                    }
                }
                return;
            }
            
            let validCars = cars;
            let currentFilter = f;
            
            while (currentFilter && currentFilter.dependsOn) {
                const pKey = currentFilter.dependsOn;
                const pF = APP_CONFIG.filters.find(x => x.key === pKey);
                if (!pF) break;
                
                let pVals = [];
                if (pF.type === 'multiselect') {
                    pVals = filterInstances.multiselects[pKey]?.getSelectedValues() || [];
                } else if (pF.type === 'select') {
                    const v = document.getElementById(`sel-${pKey}`)?.value;
                    if (v) pVals.push(v);
                }
                
                if (pVals.length > 0) {
                    validCars = validCars.filter(c => pVals.includes(String(c[pKey])));
                }
                currentFilter = pF; 
            }

            const uniqueVals = [...new Set(validCars.map(c => c[f.key]).filter(Boolean))].sort();

            if (f.type === 'select') {
                const el = document.getElementById(`sel-${f.key}`);
                if (el) {
                    const currentVal = el.value;
                    el.innerHTML = `<option value="">Любой выбор</option>` + uniqueVals.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
                    if (uniqueVals.includes(currentVal)) el.value = currentVal;
                    else el.value = '';
                }
            } else if (f.type === 'multiselect') {
                const ms = filterInstances.multiselects[f.key];
                if (ms) {
                    ms.setOptions(uniqueVals);
                    ms.selectedValues = new Set([...ms.selectedValues].filter(v => uniqueVals.includes(v)));
                    ms.renderDropdown();
                    ms.renderSelected();
                }
            }
        });
    }

    function initFilters() {
        if (!hasFullCatalog) return;
        renderFilters();
        
        const getUnique = key => [...new Set(cars.map(c => c[key]).filter(Boolean))].sort();
        
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            if (f.type === 'select') {
                const el = document.getElementById(`sel-${f.key}`);
                if (el) {
                    if (!f.dependsOn) {
                        const uniqueVals = getUnique(f.key);
                        el.innerHTML = `<option value="">Любой выбор</option>` + uniqueVals.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
                    }
                    el.addEventListener('change', debounce(applyFilters, 400));
                }
            } else if (f.type === 'multiselect') {
                const el = document.getElementById(`ms-${f.key}`);
                if (el) {
                    const ms = new MultiSelect(el, 'Любой выбор');
                    if (!f.dependsOn) ms.setOptions(getUnique(f.key));
                    filterInstances.multiselects[f.key] = ms;
                }
            } else if (f.type === 'minmax') {
                const values = cars.map(c => parseInt(c[f.key])).filter(v => !isNaN(v));
                if (values.length) {
                    let min = Math.floor(Math.min(...values) / f.step) * f.step;
                    let max = Math.ceil(Math.max(...values) / f.step) * f.step;
                    const minEl = document.getElementById(`sel-${f.key}-min`);
                    const maxEl = document.getElementById(`sel-${f.key}-max`);
                    let optsHtml = '';
                    for (let v = min; v <= max; v += f.step) {
                        optsHtml += `<option value="${v}">${formatNum(v)}</option>`;
                    }
                    if (minEl) { minEl.innerHTML += optsHtml; minEl.addEventListener('change', applyFilters); }
                    if (maxEl) { maxEl.innerHTML += optsHtml; maxEl.addEventListener('change', applyFilters); }
                }
            } else if (f.type === 'toggle') {
                const tog = document.getElementById(`tog-${f.key}`);
                if (tog) {
                    const uniqueVals = getUnique(f.key);
                    let btnsHtml = `<button type="button" class="toggle-opt is-active" data-val="all">Все</button>`;
                    uniqueVals.forEach(val => {
                        btnsHtml += `<button type="button" class="toggle-opt" data-val="${escapeHtml(val)}">${escapeHtml(val)}</button>`;
                    });
                    tog.innerHTML = btnsHtml;
                    tog.addEventListener('click', (e) => {
                        const btn = e.target.closest('.toggle-opt');
                        if (btn) {
                            tog.querySelectorAll('.toggle-opt').forEach(b => b.classList.remove('is-active'));
                            btn.classList.add('is-active');
                            applyFilters();
                        }
                    });
                }
            }
        });

        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) sortSelect.addEventListener('change', applyFilters);

        document.getElementById('page-size')?.addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value) || 16;
            currentPage = 1;
            renderPagination();
            renderCardsPage();
        });

        document.getElementById('pagination')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.pagination-btn');
            if (!btn || btn.disabled || btn.classList.contains('active')) return;
            currentPage = parseInt(btn.dataset.page);
            renderPagination();
            renderCardsPage();
            
            const topBar = document.querySelector('.catalog-top-bar');
            if (topBar) topBar.scrollIntoView({ behavior: 'smooth' });
        });

        urlManager.loadFiltersFromUrl();
        handleMobileDrawer(); 
        applyFilters();
    }

    function applyFilters() {
        if (!hasFullCatalog) return;
        
        updateDependencies();
        const sortBy = document.getElementById('sort-select')?.value || 'default';

        const activeFiltersData = [];
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            let val = null;
            if (f.type === 'multiselect') {
                val = filterInstances.multiselects[f.key]?.getSelectedValues() || [];
            } else if (f.type === 'select') {
                val = document.getElementById(`sel-${f.key}`)?.value;
            } else if (f.type === 'minmax') {
                val = {
                    min: parseInt(document.getElementById(`sel-${f.key}-min`)?.value),
                    max: parseInt(document.getElementById(`sel-${f.key}-max`)?.value)
                };
            } else if (f.type === 'toggle') {
                val = document.querySelector(`#tog-${f.key} .is-active`)?.dataset.val || 'all';
            }
            activeFiltersData.push({ config: f, value: val });
        });

        filteredCars = cars.filter(car => {
            for (const { config: f, value: val } of activeFiltersData) {
                const carVal = car[f.key];

                if (f.type === 'multiselect') {
                    if (val.length && !val.includes(String(carVal))) return false;
                } else if (f.type === 'select') {
                    if (val && String(carVal) !== val) return false;
                } else if (f.type === 'minmax') {
                    const numVal = parseInt(carVal);
                    if (!isNaN(val.min) && numVal < val.min) return false;
                    if (!isNaN(val.max) && numVal > val.max) return false;
                } else if (f.type === 'toggle') {
                    if (val !== 'all') {
                        if (String(carVal).toLowerCase() !== String(val).toLowerCase()) return false;
                    }
                }
            }
            return true;
        });

        if (sortBy === 'price-asc') filteredCars.sort((a, b) => a.price - b.price);
        if (sortBy === 'price-desc') filteredCars.sort((a, b) => b.price - a.price);
        if (sortBy === 'year-desc') filteredCars.sort((a, b) => b.year - a.year);
        if (sortBy === 'year-asc') filteredCars.sort((a, b) => a.year - b.year);
        if (sortBy === 'run-asc') filteredCars.sort((a, b) => a.run - b.run);
        if (sortBy === 'run-desc') filteredCars.sort((a, b) => b.run - a.run);

        urlManager.syncFiltersToUrl();
        
        const topCountEl = document.getElementById('catalog-results-count');
        if (topCountEl) {
            const word = getDeclension(filteredCars.length, ['автомобиль', 'автомобиля', 'автомобилей']);
            topCountEl.textContent = `Найдено ${formatNum(filteredCars.length)} ${word}`;
        }
        
        currentPage = 1;
        renderPagination();
        renderCardsPage();
    }

    // ========== ЛОГИКА ПАГИНАЦИИ ==========
    function renderCardsPage() {
        const start = (currentPage - 1) * pageSize;
        const paginatedCars = filteredCars.slice(start, start + pageSize);
        renderCards(paginatedCars, FDOM.cardsContainer);
    }

    function renderPagination() {
        if (!FDOM.pagination) return;
        const pagWrapper = document.getElementById('pagination');
        const totalPages = Math.ceil(filteredCars.length / pageSize);
        
        if (totalPages <= 1) {
            FDOM.pagination.style.display = 'none';
            return;
        }
        
        FDOM.pagination.style.display = 'flex';
        let html = '';
        
        html += `<button class="pagination-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Назад</button>`;
        
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
                html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }
        
        html += `<button class="pagination-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Вперед</button>`;
        pagWrapper.innerHTML = html;
    }

    // ========== МОБИЛЬНАЯ АДАПТАЦИЯ ==========
    function handleMobileDrawer() {
        const drawerBody = document.getElementById('mob-drawer-body');
        const filtersContainer = document.getElementById('filters-container');
        const sidebar = document.querySelector('.sidebar');
        
        if (!drawerBody || !sidebar || !filtersContainer) return;
        
        const isMobile = window.innerWidth <= 900;
        if (isMobile && !drawerBody.contains(filtersContainer)) {
            drawerBody.appendChild(filtersContainer);
        } else if (!isMobile && !sidebar.contains(filtersContainer)) {
            const sidebarFoot = sidebar.querySelector('.sidebar-foot');
            if (sidebarFoot) sidebar.insertBefore(filtersContainer, sidebarFoot);
        }
    }
    window.addEventListener('resize', handleMobileDrawer);

    document.getElementById('mobile-filter-toggle')?.addEventListener('click', () => {
        document.getElementById('mob-overlay').classList.add('is-open');
        document.getElementById('mob-drawer').classList.add('is-open');
        document.body.style.overflow = 'hidden';
    });

    const closeDrawer = () => {
        document.getElementById('mob-overlay').classList.remove('is-open');
        document.getElementById('mob-drawer').classList.remove('is-open');
        document.body.style.overflow = '';
    };
    document.getElementById('mob-close')?.addEventListener('click', closeDrawer);
    document.getElementById('mob-overlay')?.addEventListener('click', closeDrawer);

    document.getElementById('clear-filters')?.addEventListener('click', () => {
        const sortEl = document.getElementById('sort-select');
        if (sortEl) sortEl.value = 'default';
        
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            if (f.type === 'multiselect') {
                filterInstances.multiselects[f.key]?.selectedValues.clear();
                filterInstances.multiselects[f.key]?.renderSelected();
                filterInstances.multiselects[f.key]?.renderDropdown();
            } else if (f.type === 'select') {
                const el = document.getElementById(`sel-${f.key}`);
                if (el) el.value = '';
            } else if (f.type === 'minmax') {
                const minEl = document.getElementById(`sel-${f.key}-min`);
                const maxEl = document.getElementById(`sel-${f.key}-max`);
                if (minEl) minEl.value = '';
                if (maxEl) maxEl.value = '';
            } else if (f.type === 'toggle') {
                document.querySelectorAll(`#tog-${f.key} .toggle-opt`).forEach(b => {
                    b.classList.toggle('is-active', b.dataset.val === 'all');
                });
            }
        });
        applyFilters();
        closeDrawer();
    });

    // ========== ЛОГИКА СОКРАЩЕННОГО КАТАЛОГА ==========
    function initRandomCatalog() {
        if (!hasRandomCatalog) return;
        const shuffled = cars.sort(() => 0.5 - Math.random());
        const randomCars = shuffled.slice(0, randomCatalogLimit);
        renderCards(randomCars, FDOM.randomGrid);
    }

    // ========== РЕНДЕР КАРТОЧЕК ==========
    function createCardHTML(car) {
        const imgSrc = (Array.isArray(car.images) && car.images.length) ? car.images[0] : PLACEHOLDER_IMG;
        const hasCarousel = car.images && car.images.length > 1;
        
        return `
            <div class="car-card product-card" data-id="${escapeHtml(car.id)}">
                <div class="card-img-wrap image-container">
                    <img data-src="${escapeHtml(imgSrc)}" alt="${escapeHtml(car.mark_id)}" loading="lazy" class="lazy-image" data-idx="0">
                    <div class="img-badges"><span class="badge-stock">В наличии</span></div>
                    ${hasCarousel ? `<button class="carousel-button prev" aria-label="Назад"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg></button><button class="carousel-button next" aria-label="Вперед"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></button>` : ''}
                </div>
                <div class="card-body card-content">
                    <h3 class="card-name card-title">${escapeHtml(car.mark_id)}</h3>
                    <div class="card-tags card-specs">
                        ${car.year ? `<span class="ctag spec-value">${escapeHtml(car.year)} год</span>` : ''}
                        ${car.run ? `<span class="ctag spec-value">${escapeHtml(formatNum(car.run))} км</span>` : ''}
                        ${car.gearbox ? `<span class="ctag spec-value">${escapeHtml(car.gearbox)}</span>` : ''}
                    </div>
                    <div class="card-pricing card-price">
                        <span class="price-main price-new">${car.price ? escapeHtml(formatNum(car.price)) + ' ₽' : 'Цена по запросу'}</span>
                    </div>
                    <div class="card-btns card-buttons">
                        <a href="#popup:model" class="card-btn btn-outline" data-car-title="${escapeHtml(car.mark_id)}">Оставить заявку</a>
                    </div>
                </div>
            </div>`;
    }

    function renderCards(list, container) {
        if (!container) return;
        if (!list.length) { container.innerHTML = `<div class="no-results">Ничего не найдено</div>`; return; }
        container.innerHTML = list.map(car => createCardHTML(car)).join('');
        
        if (lazyObserver) lazyObserver.disconnect();
        
        lazyObserver = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if(entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy-image');
                    obs.unobserve(img);
                }
            });
        });
        
        container.querySelectorAll('img.lazy-image').forEach(img => lazyObserver.observe(img));
    }

    function bindGridEvents(container) {
        if (!container) return;
        container.addEventListener('click', (e) => {
            const btnPrev = e.target.closest('.carousel-button.prev');
            const btnNext = e.target.closest('.carousel-button.next');
            const leadBtn = e.target.closest('.card-btn');
            const card = e.target.closest('.car-card');

            if (leadBtn) {
                lastLeadCar = { title: leadBtn.dataset.carTitle };
                scheduleFillTildaFields(getPopupHook(leadBtn));
                return;
            }

            if (card) {
                const car = cars.find(c => String(c.id) === card.dataset.id);
                if (!car) return;
                
                if (btnPrev || btnNext) {
                    e.stopPropagation(); e.preventDefault();
                    const img = card.querySelector('img');
                    let idx = parseInt(img.dataset.idx || 0, 10);
                    idx = btnPrev ? (idx - 1 + car.images.length) % car.images.length : (idx + 1) % car.images.length;
                    img.dataset.idx = idx;
                    img.src = car.images[idx];
                } else {
                    carDetailModal.open(car);
                }
            }
        });
    }

    bindGridEvents(FDOM.cardsContainer);
    bindGridEvents(FDOM.randomGrid);

    // ========== ЗАГРУЗКА И ПАРСИНГ ==========
    async function loadCarsData() {
        renderSkeletons(12);
        
        let jsonData = await getCachedFeed();
        
        if (!jsonData) {
            for (const url of APP_CONFIG.feedUrls) {
                try {
                    const resp = await fetch(url, { cache: 'no-store' });
                    if (resp.ok) { 
                        jsonData = await resp.json(); 
                        await setCachedFeed(jsonData); 
                        break; 
                    }
                } catch(e) { console.warn(`[Фолбэк] Ошибка сети при обращении к ${url}:`, e); }
            }
        }

        if (jsonData && jsonData.data) {
            cars = Object.entries(jsonData.data).map(([id, data]) => ({
                id: id,
                mark_id: `${data.mark || ''} ${data.model || ''}`.trim(),
                original_mark_id: data.mark || '',
                model: data.model || '',
                year: data.year,
                price: parseInt(data.price) || 0,
                run: parseInt(data.run) || 0,
                gearbox: data.gearbox,
                drive: data.drive,
                color: data.color,
                body_type: data.body_type,
                engine_type: data.engine_type,
                engine_volume: data.engine_volume || '',
                engine_power: parseInt(data.engine_power) || 0,
                owners_number: data.owners_number || data.owners || '',
                pts: data.pts || '',
                wheel: data.wheel || '',
                generation: data.generation || '',
                images: data.images || [],
                description: data.description,
                salon: data.salon
            }));
            
            generateSEOLinks();
            
            if (hasFullCatalog) {
                initFilters();
            } else if (hasRandomCatalog) {
                initRandomCatalog();
            }

        } else {
            const target = FDOM.cardsContainer || FDOM.randomGrid;
            if(target) target.innerHTML = '<div class="no-results">Ошибка загрузки данных</div>';
        }
    }

    // ========== ИНТЕГРАЦИЯ С TILDA ==========
    function getPopupHook(trigger) { return trigger.getAttribute('href') || trigger.dataset.popupTarget || ''; }
    
    let tildaObserver = null;
    
    function scheduleFillTildaFields(hook) {
        if (!lastLeadCar?.title) return;

        const selectors = TILDA_CONFIG.getSelectors(TILDA_CONFIG.modelFieldName).join(',');
        const tryFill = () => {
            const fields = document.querySelectorAll(selectors);
            let filled = false;
            fields.forEach(f => {
                if (f.value !== lastLeadCar.title) {
                    f.value = lastLeadCar.title;
                    f.dispatchEvent(new Event('input', { bubbles: true }));
                    f.dispatchEvent(new Event('change', { bubbles: true }));
                    filled = true;
                }
            });
            return filled;
        };

        if (tryFill()) return;

        if (tildaObserver) tildaObserver.disconnect();
        
        tildaObserver = new MutationObserver((mutations, obs) => {
            if (tryFill()) {
                obs.disconnect();
                tildaObserver = null;
            }
        });

        tildaObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'] 
        });

        setTimeout(() => {
            if (tildaObserver) {
                tildaObserver.disconnect();
                tildaObserver = null;
            }
        }, 5000);
    }

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('a[href^="#popup:"]');
        if (trigger && TILDA_CONFIG.popupHooks.includes(getPopupHook(trigger))) {
            carDetailModal.close();
            scheduleFillTildaFields(getPopupHook(trigger));
        }
    });

    if (window.__MAKE_DEBUG_UTILS__) {
        const D = window.__MAKE_DEBUG_UTILS__;
        loadCarsData = D.debugWrap(loadCarsData, 'loadCarsData');
        applyFilters = D.debugWrap(applyFilters, 'applyFilters');
        
        D.debugWrapPrototype(URLManager.prototype, 'URLManager');
        D.debugWrapPrototype(CarDetailModal.prototype, 'CarDetailModal', ['prevImage', 'nextImage']);

        window.makeCatalogDebug = {
            dump: function(label = 'manual-dump') {
                D.debugLog('SNAPSHOT ' + label, { carsCount: cars.length, filteredCount: filteredCars.length, urlState: window.location.search });
                if (cars.length) D.debugTable('dump.cars', cars);
                return { cars, filteredCars, lastLeadCar, currentPage, pageSize };
            },
            clearCache: async () => {
                const db = await openCacheDB();
                db.transaction('feed', 'readwrite').objectStore('feed').delete('current');
                D.debugLog('CACHE', 'Кэш IndexedDB принудительно очищен');
            }
        };
        D.debugInfo('INIT', 'Дебаггер подключен. Введите makeCatalogDebug.dump() в консоль.');
    }
    
    loadCarsData();
});
</script>