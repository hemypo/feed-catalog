document.addEventListener('DOMContentLoaded', () => {
    // ========== КОНФИГУРАЦИЯ И TILDA ==========
    const TILDA_CONFIG = {
        modelFieldName: 'Модель',
        popupHooks: ['#popup:model', '#popup:report'],
        getSelectors: (name) => [
            `input[name="${name}"]`, `textarea[name="${name}"]`, `select[name="${name}"]`,
            `input[data-tilda-name="${name}"]`, `textarea[data-tilda-name="${name}"]`,
            `select[data-tilda-name="${name}"]`, `[data-tilda-name="${name}"]`, `[data-original-name="${name}"]`
        ]
    };

    // ========== DOM КЭШ ==========
    const FDOM = {
        cardsContainer: document.getElementById('cards-grid'),
        randomGrid: document.querySelector('[data-udm-random-grid]'),
        search: document.getElementById('search'),
        drive: document.getElementById('filter-drive'),
        gearbox: document.getElementById('filter-gearbox'),
        color: document.getElementById('filter-color'),
        body: document.getElementById('filter-body'),
        engine: document.getElementById('filter-engine'),
        sort: document.getElementById('sort-select'),
        yearMin: document.getElementById('year-min-input'),
        yearMax: document.getElementById('year-max-input')
    };

    const hasFullCatalog = !!FDOM.cardsContainer;
    const hasRandomCatalog = !!FDOM.randomGrid;
    const randomCatalogLimit = hasRandomCatalog ? Math.max(1, parseInt(FDOM.randomGrid.getAttribute('data-limit') || '9', 10)) : 9;

    let cars = [];
    let filteredCars = [];
    let catalogMeta = {};
    let catalogUpdatedAt = '';
    let catalogUpdatedText = '';
    let lastLeadCar = null;

    const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-family="Arial" font-size="16" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">Нет фото</text></svg>'
    );

    // ========== УТИЛИТЫ И БЕЗОПАСНОСТЬ ==========
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function formatNum(n) { return Number(n).toLocaleString('ru-RU'); }
    function getFirstValue(...values) { for (const v of values) { if (v !== null && v !== undefined && String(v).trim() !== '') return v; } return ''; }
    function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }

    // Компенсация скролла (Layout Shift Fix)
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
    const DB_NAME = 'udm_catalog_cache', DB_STORE = 'feed', CACHE_TTL = 25 * 60 * 1000;
    function openCacheDB() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
    }
    async function getCachedFeed() {
        try {
            const db = await openCacheDB();
            return new Promise(res => {
                const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get('current');
                req.onsuccess = () => res((req.result && Date.now() - req.result.ts <= CACHE_TTL) ? req.result.data : null);
                req.onerror = () => res(null);
            });
        } catch(e) { return null; }
    }
    async function setCachedFeed(data) {
        try {
            const db = await openCacheDB();
            db.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put({ ts: Date.now(), data }, 'current');
        } catch(e) {}
    }

    // ========== URL МЕНЕДЖЕР (Маршрутизация фильтров) ==========
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
            setP('drive', FDOM.drive?.value);
            setP('gearbox', FDOM.gearbox?.value);
            setP('color', FDOM.color?.value);
            setP('body', FDOM.body?.value);
            setP('engine', FDOM.engine?.value);
            setP('sort', FDOM.sort?.value);
            setP('yearMin', FDOM.yearMin?.value);
            setP('yearMax', FDOM.yearMax?.value);

            if (window.modelMultiSelect) setP('brands', window.modelMultiSelect.getSelectedValues().join(','));
            if (window.salonMultiSelect) setP('salons', window.salonMultiSelect.getSelectedValues().join(','));

            window.history.replaceState(null, '', url);
        }
        loadFiltersFromUrl() {
            if (!hasFullCatalog) return;
            const url = new URL(window.location);
            if (url.searchParams.has('search') && FDOM.search) FDOM.search.value = url.searchParams.get('search');
            if (url.searchParams.has('drive') && FDOM.drive) FDOM.drive.value = url.searchParams.get('drive');
            if (url.searchParams.has('gearbox') && FDOM.gearbox) FDOM.gearbox.value = url.searchParams.get('gearbox');
            if (url.searchParams.has('color') && FDOM.color) FDOM.color.value = url.searchParams.get('color');
            if (url.searchParams.has('body') && FDOM.body) FDOM.body.value = url.searchParams.get('body');
            if (url.searchParams.has('engine') && FDOM.engine) FDOM.engine.value = url.searchParams.get('engine');
            if (url.searchParams.has('sort') && FDOM.sort) FDOM.sort.value = url.searchParams.get('sort');
            if (url.searchParams.has('yearMin') && FDOM.yearMin) FDOM.yearMin.value = url.searchParams.get('yearMin');
            if (url.searchParams.has('yearMax') && FDOM.yearMax) FDOM.yearMax.value = url.searchParams.get('yearMax');

            if (url.searchParams.has('brands') && window.modelMultiSelect) {
                const b = url.searchParams.get('brands').split(',');
                b.forEach(v => window.modelMultiSelect.selectedValues.add(v));
                window.modelMultiSelect.renderSelected();
                window.modelMultiSelect.renderDropdown();
            }
            if (url.searchParams.has('salons') && window.salonMultiSelect) {
                const s = url.searchParams.get('salons').split(',');
                s.forEach(v => window.salonMultiSelect.selectedValues.add(v));
                window.salonMultiSelect.renderSelected();
                window.salonMultiSelect.renderDropdown();
            }
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

    // ========== МОДАЛЬНОЕ ОКНО ==========
    class CarDetailModal {
        constructor() {
            this.isOpen = false;
            this.overlay = document.getElementById('car-detail-modal');
            this.modal = this.overlay?.querySelector('.pm-box');
            this.track = this.overlay?.querySelector('#pmGalleryTrack');
            this.counterEl = this.overlay?.querySelector('#pmCounter');
            this.init();
        }
        init() {
            if (!this.overlay) return;
            this.overlay.querySelector('.pm-close').addEventListener('click', () => this.close());
            this.overlay.querySelector('.pm-nav-prev').addEventListener('click', () => this.prevImage());
            this.overlay.querySelector('.pm-nav-next').addEventListener('click', () => this.nextImage());
            
            // Синхронизация счетчика при нативном CSS скролле
            this.track.addEventListener('scroll', debounce(() => {
                if (!this.imagesCount) return;
                const idx = Math.round(this.track.scrollLeft / this.track.clientWidth);
                this.counterEl.textContent = `${idx + 1} / ${this.imagesCount}`;
                const thumbs = this.overlay.querySelectorAll('.pm-thumb');
                thumbs.forEach((t, i) => t.classList.toggle('is-active', i === idx));
            }, 50));

            document.addEventListener('keydown', e => {
                if (!this.isOpen) return;
                if (e.key === 'Escape') this.close();
                if (e.key === 'ArrowRight') this.nextImage();
                if (e.key === 'ArrowLeft') this.prevImage();
            });
        }
        open(car) {
            this.currentCar = car;
            this.isOpen = true;
            window.urlManager.updateUrl(car.id);
            this.renderGallery(car);
            
            // Безопасный рендеринг спецификаций
            const specsContainer = this.overlay.querySelector('#pmSpecs');
            const specs = [
                { label: 'Год выпуска', value: car.year ? `${car.year} год` : 'Не указан' },
                { label: 'Пробег', value: car.run ? `${formatNum(car.run)} км` : 'Не указан' },
                { label: 'Кузов', value: car.body_type || 'Не указан' },
                { label: 'Коробка', value: car.gearbox || 'Не указана' },
                { label: 'Салон', value: car.salon || 'Не указан' }
            ];
            specsContainer.innerHTML = specs.map(s => 
                `<div class="pm-spec-tile"><div class="pm-spec-label">${escapeHtml(s.label)}</div><div class="pm-spec-value">${escapeHtml(s.value)}</div></div>`
            ).join('');

            // Отрисовка текстовых полей
            this.overlay.querySelector('#pmTitle').textContent = car.mark_id;
            this.overlay.querySelector('#pmPrice').textContent = car.price ? `${formatNum(car.price)} ₽` : 'Цена по запросу';
            const descBlock = this.overlay.querySelector('#pmDescBlock');
            if (car.description) {
                this.overlay.querySelector('#pmDesc').innerHTML = escapeHtml(car.description).replace(/\n/g, '<br>');
                descBlock.style.display = 'block';
            } else descBlock.style.display = 'none';

            // Настройка лид-форм
            const applyBtns = this.overlay.querySelectorAll('.pm-apply-btn, .pm-calc-btn');
            applyBtns.forEach(btn => {
                btn.dataset.carTitle = car.mark_id;
                btn.dataset.carPrice = car.price || '';
                btn.dataset.carSalon = car.salon || '';
            });

            lockBodyScroll(); // Защита от Layout Shift
            this.overlay.style.display = 'flex';
            this.overlay.classList.remove('hidden');
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
            const thumbsContainer = this.overlay.querySelector('#pmThumbs');
            thumbsContainer.innerHTML = '';
            
            const images = (Array.isArray(car.images) && car.images.length) ? car.images : [PLACEHOLDER_IMG];
            this.imagesCount = images.length;
            this.counterEl.textContent = `1 / ${this.imagesCount}`;

            images.forEach((src, idx) => {
                // Основное фото (CSS Snap)
                const img = document.createElement('img');
                img.src = src;
                img.onerror = function() { this.src = PLACEHOLDER_IMG; };
                this.track.appendChild(img);

                // Миниатюра
                const thumb = document.createElement('button');
                thumb.className = `pm-thumb ${idx === 0 ? 'is-active' : ''}`;
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

    // ========== МУЛЬТИСЕЛЕКТЫ (Vanilla JS с делегированием) ==========
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
            
            // Делегирование на выпадающий список
            this.dropdown.addEventListener('click', (e) => {
                e.stopPropagation();
                const opt = e.target.closest('.multiselect-option');
                if (opt) { this.toggleOption(opt.dataset.value); applyFilters(); }
            });

            // Делегирование на удаление тегов
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

    // ========== РЕНДЕР КАРТОЧЕК ==========
    function createCardHTML(car) {
        const imgSrc = (Array.isArray(car.images) && car.images.length) ? car.images[0] : PLACEHOLDER_IMG;
        const hasCarousel = car.images && car.images.length > 1;
        
        // Все динамические переменные оборачиваются в escapeHtml для защиты от XSS
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
        // Observer для ленивой загрузки изображений
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

    // Делегирование событий карточки (клик и карусель)
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

    // ========== ФИЛЬТРАЦИЯ ==========
    function applyFilters() {
        if (!hasFullCatalog) return;
        const searchTerm = (FDOM.search?.value || '').toLowerCase();
        const drive = FDOM.drive?.value, gear = FDOM.gearbox?.value, col = FDOM.color?.value, bod = FDOM.body?.value, eng = FDOM.engine?.value;
        const yMin = parseInt(FDOM.yearMin?.value) || 0, yMax = parseInt(FDOM.yearMax?.value) || 9999;
        
        const selBrands = window.modelMultiSelect ? window.modelMultiSelect.getSelectedValues() : [];
        const selSalons = window.salonMultiSelect ? window.salonMultiSelect.getSelectedValues() : [];

        filteredCars = cars.filter(car => {
            if (searchTerm && !(car.mark_id || '').toLowerCase().includes(searchTerm)) return false;
            if (drive && car.drive !== drive) return false;
            if (gear && car.gearbox !== gear) return false;
            if (col && car.color !== col) return false;
            if (bod && car.body_type !== bod) return false;
            if (eng && car.engine_type !== eng) return false;
            const y = parseInt(car.year) || 0;
            if (y && (y < yMin || y > yMax)) return false;
            if (selBrands.length && !selBrands.includes(car.original_mark_id)) return false;
            if (selSalons.length && !selSalons.includes(car.salon)) return false;
            return true;
        });

        window.urlManager.syncFiltersToUrl();
        renderCards(filteredCars.slice(0, 32), FDOM.cardsContainer); // Простая пагинация/лимит
    }

    function initFilters() {
        if (!hasFullCatalog) return;
        const getUnique = key => [...new Set(cars.map(c => c[key]).filter(Boolean))].sort();
        
        const populate = (el, key) => {
            if (!el) return;
            const options = getUnique(key).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`);
            el.innerHTML = `<option value="">Любой выбор</option>` + options.join('');
        };

        populate(FDOM.drive, 'drive'); populate(FDOM.gearbox, 'gearbox');
        populate(FDOM.color, 'color'); populate(FDOM.body, 'body_type'); populate(FDOM.engine, 'engine_type');

        const brandContainer = document.getElementById('model-multiselect');
        if(brandContainer) { window.modelMultiSelect = new MultiSelect(brandContainer, 'Любая марка'); window.modelMultiSelect.setOptions(getUnique('original_mark_id')); }
        const salonContainer = document.getElementById('salon-multiselect');
        if(salonContainer) { window.salonMultiSelect = new MultiSelect(salonContainer, 'Все салоны'); window.salonMultiSelect.setOptions(getUnique('salon')); }

        window.urlManager.loadFiltersFromUrl();

        const filterInputs = [FDOM.search, FDOM.drive, FDOM.gearbox, FDOM.color, FDOM.body, FDOM.engine, FDOM.sort, FDOM.yearMin, FDOM.yearMax];
        filterInputs.forEach(input => { if (input) input.addEventListener('input', debounce(applyFilters, 400)); });
        filterInputs.forEach(input => { if (input) input.addEventListener('change', debounce(applyFilters, 400)); });
        
        applyFilters();
    }

    // ========== ЗАГРУЗКА И ПАРСИНГ ==========
    async function loadCarsData() {
        if (FDOM.cardsContainer) FDOM.cardsContainer.innerHTML = '<div class="loader">Загрузка...</div>';
        
        let jsonData = await getCachedFeed();
        if (!jsonData) {
            try {
                const resp = await fetch('https://dhost.makeagency.ru/playback/udm-feed.json', { cache: 'no-store' });
                if (resp.ok) { jsonData = await resp.json(); await setCachedFeed(jsonData); }
            } catch(e) { console.error('Ошибка сети', e); }
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
                images: data.images || [],
                description: data.description,
                salon: data.salon
            }));
            
            if (hasFullCatalog) initFilters();
            else if (hasRandomCatalog) {
                const randomCars = cars.sort(() => 0.5 - Math.random()).slice(0, randomCatalogLimit);
                renderCards(randomCars, FDOM.randomGrid);
            }
        } else {
            if(FDOM.cardsContainer) FDOM.cardsContainer.innerHTML = '<div class="no-results">Ошибка загрузки данных</div>';
        }
    }

    // ========== ИНТЕГРАЦИЯ С TILDA (Без jQuery) ==========
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
            window.carDetailModal.close(); // Закрываем модалку авто перед открытием формы Tilda
            scheduleFillTildaFields(getPopupHook(trigger));
        }
    });

    // Запуск приложения
    loadCarsData();

    // ========== ИНИЦИАЛИЗАЦИЯ ДЕБАГГЕРА ==========
    if (window.__UDM_DEBUG_UTILS__) {
        const D = window.__UDM_DEBUG_UTILS__;
        
        // 1. Оборачиваем критически важные функции для профилирования
        loadCarsData = D.debugWrap(loadCarsData, 'loadCarsData');
        applyFilters = D.debugWrap(applyFilters, 'applyFilters');
        renderCards = D.debugWrap(renderCards, 'renderCards');
        
        // 2. Оборачиваем методы классов
        D.debugWrapPrototype(URLManager.prototype, 'URLManager');
        D.debugWrapPrototype(CarDetailModal.prototype, 'CarDetailModal', ['prevImage', 'nextImage']);
        D.debugWrapPrototype(MultiSelect.prototype, 'MultiSelect', ['renderDropdown']);

        // 3. Выносим глобальный API в консоль браузера
        window.udmCatalogDebug = {
            dump: function(label = 'manual-dump') {
                D.debugLog('SNAPSHOT ' + label, {
                    carsCount: cars.length,
                    filteredCount: filteredCars.length,
                    urlState: window.location.search,
                    modalOpen: window.carDetailModal?.isOpen
                });
                if (cars.length) D.debugTable('dump.cars', cars);
                return { cars, filteredCars, lastLeadCar };
            },
            getCars: () => cars,
            getFiltered: () => filteredCars,
            forceApplyFilters: () => applyFilters(),
            clearCache: async () => {
                const db = await openCacheDB();
                db.transaction('feed', 'readwrite').objectStore('feed').delete('current');
                D.debugLog('CACHE', 'Кэш IndexedDB принудительно очищен');
            }
        };
        D.debugInfo('INIT', 'Дебаггер успешно подключен. Введите udmCatalogDebug в консоль.');
    }
    // ======================================================================
});