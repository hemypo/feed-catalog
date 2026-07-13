document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // КОНФИГУРАЦИЯ КАТАЛОГА
    // ==========================================
    const APP_CONFIG = {
        feedUrls: [
            'https://dhost.makeagency.ru/playback/test-catalog-feed.json',
            'http://s3.hommenest.ru/digital/backup/test-catalog-feed.json' // Наш новый тестовый фид
        ],
        cacheName: 'make_catalog_cache',
        cacheTTL: 25 * 60 * 1000, 
        
        filters: [
            { key: 'salon',            type: 'multiselect', label: 'Автосалон',       enabled: true },
            { key: 'price',            type: 'range',       label: 'Стоимость, ₽',    enabled: true },
            { key: 'run',              type: 'range',       label: 'Пробег, км',      enabled: true },
            { key: 'year',             type: 'range',       label: 'Год выпуска',     enabled: true },
            { key: 'original_mark_id', type: 'multiselect', label: 'Марка',           enabled: true },
            { key: 'gearbox',          type: 'select',      label: 'Коробка передач', enabled: true },
            { key: 'body_type',        type: 'select',      label: 'Тип кузова',      enabled: true },
            { key: 'drive',            type: 'select',      label: 'Тип привода',     enabled: true },
            { key: 'engine_type',      type: 'select',      label: 'Двигатель',       enabled: true },
            { key: 'color',            type: 'select',      label: 'Цвет кузова',     enabled: true },
            { key: 'wheel',            type: 'toggle',      label: 'Руль',            enabled: true }
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

    // ========== DOM КЭШ ==========
    const FDOM = {
        cardsContainer: document.getElementById('cards-grid'),
        randomGrid: document.querySelector('[data-make-random-grid]'),
        search: document.getElementById('search'),
        sort: document.getElementById('sort-select')
    };

    const hasFullCatalog = !!FDOM.cardsContainer;
    const hasRandomCatalog = !!FDOM.randomGrid;

    let cars = [];
    let filteredCars = [];
    let lastLeadCar = null;
    window.filterInstances = { multiselects: {}, ranges: {} };

    const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-family="Arial" font-size="16" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">Нет фото</text></svg>'
    );

    // ========== УТИЛИТЫ ==========
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function formatNum(n) { return Number(n).toLocaleString('ru-RU'); }
    function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }

    // Компенсация скролла
    let scrollbarWidth = null;
    function getScrollbarWidth() {
        if (scrollbarWidth !== null) return scrollbarWidth;
        scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        return scrollbarWidth;
    }
    function lockBodyScroll() {
        document.body.style.paddingRight = getScrollbarWidth() + 'px';
        document.body.style.overflow = 'hidden';
    }
    function unlockBodyScroll() {
        document.body.style.paddingRight = '';
        document.body.style.overflow = '';
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
            
            setP('search', FDOM.search?.value);
            setP('sort', FDOM.sort?.value);

            APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
                if (f.type === 'multiselect') {
                    const sel = window.filterInstances.multiselects[f.key]?.getSelectedValues() || [];
                    setP(f.key, sel.join(','));
                } else if (f.type === 'select') {
                    setP(f.key, document.getElementById(`sel-${f.key}`)?.value);
                } else if (f.type === 'range') {
                    setP(`${f.key}Min`, document.getElementById(`range-${f.key}-min`)?.value);
                    setP(`${f.key}Max`, document.getElementById(`range-${f.key}-max`)?.value);
                } else if (f.type === 'toggle') {
                    setP(f.key, document.querySelector(`#tog-${f.key} .is-active`)?.dataset.val);
                }
            });
            window.history.replaceState(null, '', url);
        }
        loadFiltersFromUrl() {
            if (!hasFullCatalog) return;
            const url = new URL(window.location);
            if (url.searchParams.has('search') && FDOM.search) FDOM.search.value = url.searchParams.get('search');
            if (url.searchParams.has('sort') && FDOM.sort) FDOM.sort.value = url.searchParams.get('sort');

            APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
                if (f.type === 'multiselect') {
                    const val = url.searchParams.get(f.key);
                    if (val && window.filterInstances.multiselects[f.key]) {
                        val.split(',').forEach(v => window.filterInstances.multiselects[f.key].selectedValues.add(v));
                        window.filterInstances.multiselects[f.key].renderSelected();
                        window.filterInstances.multiselects[f.key].renderDropdown();
                    }
                } else if (f.type === 'select') {
                    const el = document.getElementById(`sel-${f.key}`);
                    if (el && url.searchParams.has(f.key)) el.value = url.searchParams.get(f.key);
                } else if (f.type === 'range') {
                    const minEl = document.getElementById(`range-${f.key}-min`);
                    const maxEl = document.getElementById(`range-${f.key}-max`);
                    if (minEl && url.searchParams.has(`${f.key}Min`)) minEl.value = url.searchParams.get(`${f.key}Min`);
                    if (maxEl && url.searchParams.has(`${f.key}Max`)) maxEl.value = url.searchParams.get(`${f.key}Max`);
                    
                    if (window.filterInstances.ranges[f.key]) {
                        const slider = window.filterInstances.ranges[f.key];
                        slider.currentMin = parseInt(minEl.value) || slider.min;
                        slider.currentMax = parseInt(maxEl.value) || slider.max;
                        slider.updateSlider();
                    }
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
            else if (window.carDetailModal?.isOpen) window.carDetailModal.close({ skipUrlClear: true });
        }
        openCarFromUrl(carId) {
            const car = cars.find(c => c.id?.toString() === carId.toString());
            if (car && window.carDetailModal) setTimeout(() => window.carDetailModal.open(car), 300);
        }
    }
    window.urlManager = new URLManager();

    // ========== МОДАЛЬНОЕ ОКНО (Обновленное для Split-Screen) ==========
    class CarDetailModal {
        constructor() {
            this.isOpen = false;
            this.overlay = document.getElementById('car-detail-modal');
            this.modal = this.overlay?.querySelector('.modal-box');
            this.track = this.overlay?.querySelector('#modalGalleryTrack');
            this.counterEl = this.overlay?.querySelector('#modalCounter');
            this.init();
        }
        init() {
            if (!this.overlay) return;
            this.overlay.querySelector('.modal-close').addEventListener('click', () => this.close());
            this.overlay.querySelector('.modal-nav-prev').addEventListener('click', () => this.prevImage());
            this.overlay.querySelector('.modal-nav-next').addEventListener('click', () => this.nextImage());
            
            this.track.addEventListener('scroll', debounce(() => {
                if (!this.imagesCount) return;
                const idx = Math.round(this.track.scrollLeft / this.track.clientWidth);
                this.counterEl.textContent = `${idx + 1} / ${this.imagesCount}`;
                const thumbs = this.overlay.querySelectorAll('.modal-thumb');
                thumbs.forEach((t, i) => t.classList.toggle('is-active', i === idx));
            }, 50));

            document.addEventListener('keydown', e => {
                if (!this.isOpen) return;
                if (e.key === 'Escape') this.close();
                if (e.key === 'ArrowRight') this.nextImage();
                if (e.key === 'ArrowLeft') this.prevImage();
            });

            // Закрытие по клику на оверлей вне модалки
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.close();
            });
        }
        open(car) {
            this.currentCar = car;
            this.isOpen = true;
            window.urlManager.updateUrl(car.id);
            this.renderGallery(car);
            
            // Рендер характеристик (Pills)
            const pillsContainer = this.overlay.querySelector('#modalPills');
            pillsContainer.innerHTML = '';
            if (car.year) pillsContainer.innerHTML += `<span class="ctag">${car.year} год</span>`;
            if (car.run) pillsContainer.innerHTML += `<span class="ctag">${formatNum(car.run)} км</span>`;
            if (car.gearbox) pillsContainer.innerHTML += `<span class="ctag">${car.gearbox}</span>`;
            if (car.engine_volume) pillsContainer.innerHTML += `<span class="ctag">${car.engine_volume} л</span>`;

            // Подробные характеристики (Grid)
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

            // Настройка кнопок захвата лида
            const applyBtns = this.overlay.querySelectorAll('.modal-apply-btn, .modal-calc-btn');
            applyBtns.forEach(btn => {
                btn.dataset.carTitle = car.mark_id;
            });

            lockBodyScroll();
            this.overlay.style.display = 'flex';
            this.overlay.classList.remove('hidden');
            // Сбрасываем скролл правой колонки наверх
            const rightCol = this.overlay.querySelector('.modal-right');
            if (rightCol) rightCol.scrollTop = 0;
            
            setTimeout(() => this.overlay.classList.add('visible'), 10);
        }
        close(opts = {}) {
            this.isOpen = false;
            if (!opts.skipUrlClear) window.urlManager.clearCarUrl();
            this.overlay.classList.remove('visible');
            setTimeout(() => {
                this.overlay.classList.add('hidden');
                this.overlay.style.display = 'none';
                unlockBodyScroll();
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
                    this.track.scrollTo({ left: this.track.clientWidth * idx, behavior: 'smooth' });
                });
                thumbsContainer.appendChild(thumb);
            });
        }
        prevImage() { this.track.scrollBy({ left: -this.track.clientWidth, behavior: 'smooth' }); }
        nextImage() { this.track.scrollBy({ left: this.track.clientWidth, behavior: 'smooth' }); }
    }
    window.carDetailModal = new CarDetailModal();

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

    class FastRangeSlider {
        constructor(key, minInputId, maxInputId) {
            this.key = key;
            this.minInput = document.getElementById(minInputId);
            this.maxInput = document.getElementById(maxInputId);
            this.track = document.getElementById(key + '-track');
            this.fill = document.getElementById(key + '-fill');
            this.thumbMin = document.getElementById(key + '-thumb-min');
            this.thumbMax = document.getElementById(key + '-thumb-max');

            const values = cars.map(c => parseInt(c[key])).filter(v => !isNaN(v));
            this.min = values.length ? Math.min(...values) : 0; 
            this.max = values.length ? Math.max(...values) : 0;
            
            this.currentMin = this.min; this.currentMax = this.max;
            if(this.minInput) this.minInput.placeholder = `От ${this.min}`; 
            if(this.maxInput) this.maxInput.placeholder = `До ${this.max}`;

            this.isDragging = false; this.activeThumb = null; this.trackRect = null;
            this.throttledUpdate = this.throttle(this.updateSlider.bind(this), 16);
            this.init(); this.updateSlider();
        }
        throttle(func, limit) {
            let inT; return function() { if (!inT) { func.apply(this, arguments); inT = true; setTimeout(() => inT = false, limit); } };
        }
        init() {
            this.thumbMin.addEventListener('mousedown', (e) => this.startDrag(e, 'min'));
            this.thumbMax.addEventListener('mousedown', (e) => this.startDrag(e, 'max'));
            this.thumbMin.addEventListener('touchstart', (e) => this.startDrag(e, 'min'), {passive: true});
            this.thumbMax.addEventListener('touchstart', (e) => this.startDrag(e, 'max'), {passive: true});
            
            this._onMouseMove = (e) => this.handleMove(e);
            this._onTouchMove = (e) => this.onTouchMove(e);
            this._onMouseUp = () => this.stopDrag();
            this._onTouchEnd = () => this.stopDrag();
            this.track.addEventListener('click', (e) => this.onTrackClick(e));
        }
        startDrag(e, thumb) {
            this.isDragging = true; this.activeThumb = thumb;
            this.trackRect = this.track.getBoundingClientRect();
            if (!e.touches) { e.preventDefault(); document.body.style.userSelect = 'none'; }
            document.addEventListener('mousemove', this._onMouseMove, {passive: true});
            document.addEventListener('mouseup', this._onMouseUp);
            document.addEventListener('touchmove', this._onTouchMove, {passive: false});
            document.addEventListener('touchend', this._onTouchEnd);
        }
        stopDrag() {
            if (!this.isDragging) return;
            this.isDragging = false; this.activeThumb = null; this.trackRect = null;
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup', this._onMouseUp);
            document.removeEventListener('touchmove', this._onTouchMove);
            document.removeEventListener('touchend', this._onTouchEnd);
            applyFilters();
        }
        getClientX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
        onTouchMove(e) { if (this.isDragging && this.activeThumb && this.trackRect) { e.preventDefault(); this.handleMove(e); } }
        handleMove(e) {
            if (!this.isDragging || !this.activeThumb || !this.trackRect) return;
            const percent = Math.max(0, Math.min(1, (this.getClientX(e) - this.trackRect.left) / this.trackRect.width));
            const value = Math.round(this.min + (this.max - this.min) * percent);
            if (this.activeThumb === 'min') {
                this.currentMin = Math.min(value, this.currentMax); this.minInput.value = this.currentMin;
            } else {
                this.currentMax = Math.max(value, this.currentMin); this.maxInput.value = this.currentMax;
            }
            this.throttledUpdate();
        }
        onTrackClick(e) {
            if (this.isDragging) return;
            const rect = this.track.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const value = Math.round(this.min + (this.max - this.min) * percent);
            const range = this.max - this.min;
            const minP = range === 0 ? 0 : (this.currentMin - this.min) / range;
            const maxP = range === 0 ? 1 : (this.currentMax - this.min) / range;
            
            if (Math.abs(percent - minP) < Math.abs(percent - maxP)) {
                this.currentMin = Math.min(value, this.currentMax); this.minInput.value = this.currentMin;
            } else {
                this.currentMax = Math.max(value, this.currentMin); this.maxInput.value = this.currentMax;
            }
            this.updateSlider(); applyFilters();
        }
        updateSlider() {
            const range = this.max - this.min;
            const minP = range === 0 ? 0 : (this.currentMin - this.min) / range * 100;
            const maxP = range === 0 ? 100 : (this.currentMax - this.min) / range * 100;
            this.thumbMin.style.left = minP + '%'; this.thumbMax.style.left = maxP + '%';
            this.fill.style.left = minP + '%'; this.fill.style.width = (maxP - minP) + '%';
        }
    }


    // ========== ДИНАМИЧЕСКИЙ РЕНДЕР И ФИЛЬТРАЦИЯ ==========

    function renderFilters() {
        const container = document.getElementById('filters-container');
        if (!container) return;
        
        let html = '';
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            html += `<div class="filter-group" data-key="${f.key}">
                <label class="filter-label">${f.label}</label>`;
            
            if (f.type === 'multiselect') {
                html += `<div class="multiselect" id="ms-${f.key}">
                  <div class="multiselect-trigger"><div class="multiselect-selected"><span class="multiselect-placeholder">Любой выбор</span></div><svg class="multiselect-arrow" viewBox="0 0 10 7" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                  <div class="multiselect-dropdown hidden"></div></div>`;
            } else if (f.type === 'select') {
                html += `<select class="f-select" id="sel-${f.key}"><option value="">Любой выбор</option></select>`;
            } else if (f.type === 'range') {
                html += `<div class="double-range" id="${f.key}-range-wrap"><div class="range-track" id="${f.key}-track"><div class="range-fill" id="${f.key}-fill"></div><div class="thumb" id="${f.key}-thumb-min" role="slider" tabindex="0"></div><div class="thumb" id="${f.key}-thumb-max" role="slider" tabindex="0"></div></div></div>
                <div class="range-row"><input type="number" class="f-input" id="range-${f.key}-min" placeholder="От"><input type="number" class="f-input" id="range-${f.key}-max" placeholder="До"></div>`;
            } else if (f.type === 'toggle') {
                html += `<div class="toggle-row" id="tog-${f.key}"><button type="button" class="toggle-opt is-active" data-val="all">Все</button><button type="button" class="toggle-opt" data-val="left">Левый</button><button type="button" class="toggle-opt" data-val="right">Правый</button></div>`;
            }
            html += `</div><div class="f-sep"></div>`;
        });
        container.innerHTML = html;
    }

    function initFilters() {
        if (!hasFullCatalog) return;
        renderFilters();
        
        const getUnique = key => [...new Set(cars.map(c => c[key]).filter(Boolean))].sort();
        
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            if (f.type === 'select') {
                const el = document.getElementById(`sel-${f.key}`);
                if (el) {
                    const options = getUnique(f.key).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`);
                    el.innerHTML = `<option value="">Любой выбор</option>` + options.join('');
                    el.addEventListener('change', debounce(applyFilters, 400));
                }
            } else if (f.type === 'multiselect') {
                const el = document.getElementById(`ms-${f.key}`);
                if (el) {
                    const ms = new MultiSelect(el, 'Любой выбор');
                    ms.setOptions(getUnique(f.key));
                    window.filterInstances.multiselects[f.key] = ms;
                }
            } else if (f.type === 'range') {
                const minInput = document.getElementById(`range-${f.key}-min`);
                const maxInput = document.getElementById(`range-${f.key}-max`);
                if (minInput && maxInput) {
                    window.filterInstances.ranges[f.key] = new FastRangeSlider(f.key, `range-${f.key}-min`, `range-${f.key}-max`);
                    minInput.addEventListener('input', debounce(() => {
                        const s = window.filterInstances.ranges[f.key];
                        s.currentMin = Math.max(s.min, Math.min(parseInt(minInput.value)||s.min, s.currentMax));
                        s.updateSlider(); applyFilters();
                    }, 400));
                    maxInput.addEventListener('input', debounce(() => {
                        const s = window.filterInstances.ranges[f.key];
                        s.currentMax = Math.min(s.max, Math.max(parseInt(maxInput.value)||s.max, s.currentMin));
                        s.updateSlider(); applyFilters();
                    }, 400));
                }
            } else if (f.type === 'toggle') {
                const tog = document.getElementById(`tog-${f.key}`);
                if (tog) {
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

        if(FDOM.search) FDOM.search.addEventListener('input', debounce(applyFilters, 400));
        if(FDOM.sort) FDOM.sort.addEventListener('change', applyFilters);

        window.urlManager.loadFiltersFromUrl();
        handleMobileDrawer(); 
        applyFilters();
    }

    function applyFilters() {
        if (!hasFullCatalog) return;
        const searchTerm = (FDOM.search?.value || '').toLowerCase();
        const sortBy = FDOM.sort?.value;

        filteredCars = cars.filter(car => {
            if (searchTerm && !(car.mark_id || '').toLowerCase().includes(searchTerm)) return false;

            for (const f of APP_CONFIG.filters) {
                if (!f.enabled) continue;
                const val = car[f.key];

                if (f.type === 'multiselect') {
                    const sel = window.filterInstances.multiselects[f.key]?.getSelectedValues() || [];
                    if (sel.length && !sel.includes(val)) return false;
                } else if (f.type === 'select') {
                    const sel = document.getElementById(`sel-${f.key}`)?.value;
                    if (sel && String(val) !== sel) return false;
                } else if (f.type === 'range') {
                    const min = parseInt(document.getElementById(`range-${f.key}-min`)?.value);
                    const max = parseInt(document.getElementById(`range-${f.key}-max`)?.value);
                    const numVal = parseInt(val);
                    if (!isNaN(min) && numVal < min) return false;
                    if (!isNaN(max) && numVal > max) return false;
                } else if (f.type === 'toggle') {
                    const active = document.querySelector(`#tog-${f.key} .is-active`)?.dataset.val || 'all';
                    if (active !== 'all') {
                        const wheel = String(val).toLowerCase();
                        const isLeft = wheel.includes('лев') || wheel.includes('left');
                        const isRight = wheel.includes('прав') || wheel.includes('right');
                        if (active === 'left' && !isLeft) return false;
                        if (active === 'right' && !isRight) return false;
                    }
                }
            }
            return true;
        });

        if (sortBy === 'price-asc') filteredCars.sort((a, b) => a.price - b.price);
        if (sortBy === 'price-desc') filteredCars.sort((a, b) => b.price - a.price);

        window.urlManager.syncFiltersToUrl();
        renderCards(filteredCars.slice(0, 32), FDOM.cardsContainer);
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
            // Возвращаем фильтры в сайдбар перед кнопками
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

    // Сброс фильтров
    document.getElementById('clear-filters')?.addEventListener('click', () => {
        if(FDOM.search) FDOM.search.value = '';
        if(FDOM.sort) FDOM.sort.value = 'default';
        
        APP_CONFIG.filters.filter(f => f.enabled).forEach(f => {
            if (f.type === 'multiselect') {
                window.filterInstances.multiselects[f.key]?.selectedValues.clear();
                window.filterInstances.multiselects[f.key]?.renderSelected();
                window.filterInstances.multiselects[f.key]?.renderDropdown();
            } else if (f.type === 'select') {
                const el = document.getElementById(`sel-${f.key}`);
                if (el) el.value = '';
            } else if (f.type === 'range') {
                const slider = window.filterInstances.ranges[f.key];
                if (slider) {
                    slider.currentMin = slider.min; slider.currentMax = slider.max;
                    slider.minInput.value = ''; slider.maxInput.value = ''; 
                    slider.updateSlider();
                }
            } else if (f.type === 'toggle') {
                document.querySelectorAll(`#tog-${f.key} .toggle-opt`).forEach(b => {
                    b.classList.toggle('is-active', b.dataset.val === 'all');
                });
            }
        });
        applyFilters();
        closeDrawer();
    });

    // ========== ЛОГИКА СОКРАЩЕННОГО (РАНДОМНОГО) КАТАЛОГА ==========
    // Эта функция вызывается только для виджета на главной странице (catalog-reduced.html)
    function initRandomCatalog() {
        if (!hasRandomCatalog) return;
        
        // 1. Берем весь массив машин и перемешиваем его (Math.random)
        const shuffled = cars.sort(() => 0.5 - Math.random());
        
        // 2. Отрезаем нужное количество машин (по умолчанию 9)
        const randomCars = shuffled.slice(0, randomCatalogLimit);
        
        // 3. Рисуем их в сетку
        renderCards(randomCars, FDOM.randomGrid);
        
        // Примечание: Фильтры для этого виджета не инициализируются намеренно,
        // так как его задача - просто показать N случайных машин для завлечения клиента.
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
                    ${hasCarousel ? `<button class="carousel-button prev">&#10094;</button><button class="carousel-button next">&#10095;</button>` : ''}
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
        
        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if(entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy-image');
                    obs.unobserve(img);
                }
            });
        });
        container.querySelectorAll('img.lazy-image').forEach(img => observer.observe(img));
    }

    // Делегирование кликов (открытие модалки и карусель на карточках)
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
                    window.carDetailModal.open(car);
                }
            }
        });
    }

    bindGridEvents(FDOM.cardsContainer);
    bindGridEvents(FDOM.randomGrid);

    // ========== ЗАГРУЗКА И ПАРСИНГ ==========
    async function loadCarsData() {
        if (FDOM.cardsContainer) FDOM.cardsContainer.innerHTML = '<div class="loader">Загрузка...</div>';
        
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
                year: data.year,
                price: parseInt(data.price) || 0,
                run: parseInt(data.run) || 0,
                gearbox: data.gearbox,
                drive: data.drive,
                color: data.color,
                body_type: data.body_type,
                engine_type: data.engine_type,
                engine_volume: data.engine_volume,
                owners_number: data.owners_number || data.owners,
                pts: data.pts,
                wheel: data.wheel,
                images: data.images || [],
                description: data.description,
                salon: data.salon
            }));
            
            // Распределение логики в зависимости от типа виджета на странице
            if (hasFullCatalog) {
                initFilters();
            } else if (hasRandomCatalog) {
                initRandomCatalog();
            }

        } else {
            if(FDOM.cardsContainer) FDOM.cardsContainer.innerHTML = '<div class="no-results">Ошибка загрузки данных</div>';
        }
    }

    // ========== ИНТЕГРАЦИЯ С TILDA ==========
    function getPopupHook(trigger) { return trigger.getAttribute('href') || trigger.dataset.popupTarget || ''; }
    
    function fillTildaFields(hook) {
        if (!lastLeadCar?.title) return;
        const selectors = TILDA_CONFIG.getSelectors(TILDA_CONFIG.modelFieldName).join(',');
        const fields = document.querySelectorAll(selectors);
        fields.forEach(f => {
            f.value = lastLeadCar.title;
            f.dispatchEvent(new Event('input', { bubbles: true }));
            f.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }
    
    function scheduleFillTildaFields(hook) {
        [0, 100, 300, 800].forEach(delay => setTimeout(() => fillTildaFields(hook), delay));
    }

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('a[href^="#popup:"]');
        if (trigger && TILDA_CONFIG.popupHooks.includes(getPopupHook(trigger))) {
            window.carDetailModal.close();
            scheduleFillTildaFields(getPopupHook(trigger));
        }
    });
    
    // Запуск приложения
    loadCarsData();
});