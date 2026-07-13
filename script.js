<script>
$(function() {

    /* ========== DEBUG / LOGGING ========== */
    const DEBUG = false; // ← поставь true, чтобы включить диагностические логи
    const DEBUG_VERBOSE_EVENTS = false; // ← поставь false, если в консоли слишком много логов от drag/swipe/click/input
    const DEBUG_TABLE_LIMIT = 130;

    let debugCallCounter = 0;

    function debugNow() {
        try { return new Date().toISOString(); }
        catch(e) { return String(Date.now()); }
    }

    function debugPrefix(scope) {
        return '[UDM-CATALOG DEBUG][' + debugNow() + ']' + (scope ? '[' + scope + ']' : '');
    }

    function debugLog(scope, ...args) {
        if (!DEBUG) return;
        console.log(debugPrefix(scope), ...args);
    }

    function debugInfo(scope, ...args) {
        if (!DEBUG) return;
        console.info(debugPrefix(scope), ...args);
    }

    function debugWarn(scope, ...args) {
        if (!DEBUG) return;
        console.warn(debugPrefix(scope), ...args);
    }

    function debugError(scope, ...args) {
        if (!DEBUG) return;
        console.error(debugPrefix(scope), ...args);
    }

    function debugGroup(scope, ...args) {
        if (!DEBUG) return;
        if (console.groupCollapsed) console.groupCollapsed(debugPrefix(scope), ...args);
        else debugLog(scope, ...args);
    }

    function debugGroupEnd() {
        if (!DEBUG) return;
        if (console.groupEnd) console.groupEnd();
    }

    function debugTable(scope, data) {
        if (!DEBUG) return;
        try {
            if (Array.isArray(data)) console.table(data.slice(0, DEBUG_TABLE_LIMIT));
            else console.table(data);
            if (Array.isArray(data) && data.length > DEBUG_TABLE_LIMIT) {
                debugInfo(scope, 'Показаны первые ' + DEBUG_TABLE_LIMIT + ' строк из ' + data.length);
            }
        } catch(e) {
            debugWarn(scope, 'console.table не сработал', e, data);
        }
    }

    function debugCheck(condition, scope, okMessage, failMessage, data) {
        if (!DEBUG) return condition;
        if (condition) debugLog(scope, '✅ ' + okMessage, data || '');
        else debugWarn(scope, '⚠️ ' + failMessage, data || '');
        return condition;
    }

    function debugDuration(startTime) {
        try { return Math.round((performance.now() - startTime) * 100) / 100 + ' ms'; }
        catch(e) { return 'n/a'; }
    }

    function debugWrap(fn, name, options = {}) {
        if (!DEBUG || typeof fn !== 'function' || fn.__debugWrapped) return fn;
        const wrapped = function(...args) {
            const callId = ++debugCallCounter;
            const start = performance.now ? performance.now() : Date.now();
            const skipGroup = options.verboseOnly && !DEBUG_VERBOSE_EVENTS;
            if (!skipGroup) {
                debugGroup('CALL #' + callId + ' ' + name, {
                    args: args,
                    thisValue: this
                });
            }
            try {
                const result = fn.apply(this, args);

                if (result && typeof result.then === 'function') {
                    if (!skipGroup) {
                        debugLog(name, 'Promise started', result);
                        debugGroupEnd();
                    }
                    return result.then((resolved) => {
                        debugLog('RESOLVE #' + callId + ' ' + name, {
                            duration: debugDuration(start),
                            result: resolved
                        });
                        return resolved;
                    }).catch((err) => {
                        debugError('REJECT #' + callId + ' ' + name, {
                            duration: debugDuration(start),
                            error: err
                        });
                        throw err;
                    });
                }

                if (!skipGroup) {
                    debugLog(name, 'RETURN', {
                        duration: debugDuration(start),
                        result: result
                    });
                    debugGroupEnd();
                }
                return result;
            } catch(err) {
                if (!skipGroup) debugGroupEnd();
                debugError('THROW #' + callId + ' ' + name, {
                    duration: debugDuration(start),
                    error: err
                });
                throw err;
            }
        };
        wrapped.__debugWrapped = true;
        wrapped.__originalFn = fn;
        return wrapped;
    }

    function debugWrapPrototype(proto, className, verboseMethods = []) {
        if (!DEBUG || !proto) return;
        Object.getOwnPropertyNames(proto).forEach((methodName) => {
            if (methodName === 'constructor') return;
            const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
            if (!descriptor || typeof descriptor.value !== 'function') return;
            proto[methodName] = debugWrap(
                descriptor.value,
                className + '.' + methodName,
                { verboseOnly: verboseMethods.includes(methodName) }
            );
        });
        debugLog('debugWrapPrototype', 'Методы класса обернуты в логирование', className, Object.getOwnPropertyNames(proto));
    }

    function debugSnapshot(label, extra = {}) {
        if (!DEBUG) return;
        const state = {
            label: label,
            carsCount: Array.isArray(cars) ? cars.length : null,
            filteredCarsCount: Array.isArray(filteredCars) ? filteredCars.length : null,
            pagination: window.paginationInstance ? {
                currentPage: window.paginationInstance.currentPage,
                pageSize: window.paginationInstance.pageSize,
                totalItems: window.paginationInstance.totalItems,
                totalPages: window.paginationInstance.totalPages
            } : null,
            modal: window.carDetailModal ? {
                isOpen: window.carDetailModal.isOpen,
                currentCarId: window.carDetailModal.currentCar?.id,
                currentImageIndex: window.carDetailModal.currentImageIndex
            } : null,
            url: window.location.href,
            extra: extra
        };
        debugGroup('SNAPSHOT ' + label, state);
        if (Array.isArray(cars) && cars.length) debugTable('SNAPSHOT cars', cars.slice(0, DEBUG_TABLE_LIMIT));
        if (Array.isArray(filteredCars) && filteredCars.length) debugTable('SNAPSHOT filteredCars', filteredCars.slice(0, DEBUG_TABLE_LIMIT));
        debugGroupEnd();
    }

    window.__UDM_DEBUG_UTILS__ = {
        DEBUG: DEBUG,
        debugLog: debugLog,
        debugInfo: debugInfo,
        debugWarn: debugWarn,
        debugError: debugError,
        debugCheck: debugCheck,
        debugSnapshot: debugSnapshot,
        debugWrap: debugWrap
    };


    /* ========== URL MANAGER ========== */
    class URLManager {
        constructor() { this.currentCarId = null; this.init(); }
        init() {
            window.addEventListener('popstate', () => this.handleUrlChange());
            setTimeout(() => this.handleUrlChange(), 100);
        }
        updateUrl(carId) {
            const url = new URL(window.location);
            url.searchParams.set('car', carId);
            window.history.pushState({ carId }, '', url);
            this.currentCarId = carId;
        }
        clearUrl() {
            const url = new URL(window.location);
            url.searchParams.delete('car');
            window.history.replaceState(null, '', url);
            this.currentCarId = null;
        }
        handleUrlChange() {
            const carId = new URLSearchParams(window.location.search).get('car');
            if (carId && carId !== this.currentCarId) this.openCarFromUrl(carId);
            else if (!carId && this.currentCarId && window.carDetailModal?.isOpen) window.carDetailModal.close();
        }
        openCarFromUrl(carId) {
            if (!cars?.length) return;
            const car = cars.find(c => c.id?.toString() === carId.toString());
            if (car && window.carDetailModal) {
                setTimeout(() => { window.carDetailModal.open(car); this.currentCarId = carId; }, 300);
            }
        }
    }

    debugWrapPrototype(URLManager.prototype, 'URLManager');

    /* ========== INDEXEDDB CACHE ========== */
    const DB_NAME = 'udm_catalog_cache';
    const DB_STORE = 'feed';
    const CACHE_TTL = 25 * 60 * 1000;

    function openCacheDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getCachedFeed() {
        try {
            const db = await openCacheDB();
            return new Promise((resolve) => {
                const tx = db.transaction(DB_STORE, 'readonly');
                const req = tx.objectStore(DB_STORE).get('current');
                req.onsuccess = () => {
                    const entry = req.result;
                    if (!entry || Date.now() - entry.ts > CACHE_TTL) return resolve(null);
                    resolve(entry.data);
                };
                req.onerror = () => resolve(null);
            });
        } catch(e) { return null; }
    }

    async function setCachedFeed(data) {
        try {
            const db = await openCacheDB();
            const tx = db.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put({ ts: Date.now(), data }, 'current');
        } catch(e) {}
    }

    /* ========== CAR DETAIL MODAL ========== */
    class CarDetailModal {
        constructor() {
            this.isOpen = false;
            this.currentCar = null;
            this.currentImageIndex = 0;
            this.overlay = document.getElementById('car-detail-modal');
            this.modal = this.overlay?.querySelector('.pm-box');
            this.closeBtn = this.overlay?.querySelector('.pm-close');
            this.mainImage = this.overlay?.querySelector('#pmMainImg');
            this.thumbnailsContainer = this.overlay?.querySelector('#pmThumbs');
            this.prevBtn = this.overlay?.querySelector('.pm-nav-prev');
            this.nextBtn = this.overlay?.querySelector('.pm-nav-next');
            this.counterEl = this.overlay?.querySelector('#pmCounter');
            this.statusEl = this.overlay?.querySelector('#pmStatus');
            this.titleEl = this.overlay?.querySelector('#pmTitle');
            this.subtitleEl = this.overlay?.querySelector('#pmSubtitle');
            this.vinEl = this.overlay?.querySelector('#pmVin');
            this.captionEl = this.overlay?.querySelector('#pmCaption');
            this.priceEl = this.overlay?.querySelector('#pmPrice');
            this.priceOldEl = this.overlay?.querySelector('#pmPriceOld');
            this.saveEl = this.overlay?.querySelector('#pmSave');
            this.monthlyEl = this.overlay?.querySelector('#pmMonthly');
            this.pillsEl = this.overlay?.querySelector('#pmPills');
            this.specsEl = this.overlay?.querySelector('#pmSpecs');
            this.descEl = this.overlay?.querySelector('#pmDesc');
            this.descBlock = this.overlay?.querySelector('#pmDescBlock');
            this.phoneBtn = this.overlay?.querySelector('.pm-phone-btn');
            this.applyBtn = this.overlay?.querySelector('.pm-apply-btn');
            this.calcBtn = this.overlay?.querySelector('.pm-calc-btn');

            if (!window.urlManager) window.urlManager = new URLManager();
            this.init();
            this.originalTitle = document.title;
            const metaDescTag = document.querySelector('meta[name="description"]');
            this.originalDescription = metaDescTag ? metaDescTag.content : "";
        }

        updateSEO(car) {
            const priceVal = car.price_discount || car.price;
            const priceText = priceVal ? this.formatNum(priceVal) + ' ₽' : 'Цена по запросу';
            document.title = car.mark_id + ' ' + (car.year || '') + ' — ' + priceText;
            const descText = 'Купить ' + car.mark_id + ' ' + car.year + ' года. Пробег: ' + this.formatNum(car.run) + ' км. Двигатель: ' + car.engine_volume + ' (' + car.engine_power + ' л.с.), ' + car.gearbox + '.';
            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.name = "description";
                document.head.appendChild(metaDesc);
            }
            metaDesc.content = descText;
        }

        resetSEO() {
            document.title = this.originalTitle;
            const metaDesc = document.querySelector('meta[name="description"]');
            if (metaDesc) metaDesc.content = this.originalDescription;
        }

        init() {
            if (!this.overlay || !this.modal) return;
            if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
            if (this.prevBtn) this.prevBtn.addEventListener('click', (e) => { e.stopPropagation(); this.prevImage(); });
            if (this.nextBtn) this.nextBtn.addEventListener('click', (e) => { e.stopPropagation(); this.nextImage(); });

            document.addEventListener('keydown', (e) => {
                if (!this.isOpen) return;
                if (e.key === 'Escape') this.close();
                if (e.key === 'ArrowRight') this.nextImage();
                if (e.key === 'ArrowLeft') this.prevImage();
            });

            this._onTrapKey = (e) => {
                if (!this.isOpen || e.code !== 'Tab') return;
                const focusable = this.modal.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (!focusable.length) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            };
            this.modal.addEventListener('keydown', this._onTrapKey);
            this._initGallerySwipe();
        }

        _initGallerySwipe() {
            const el = document.getElementById('pmGalleryMain');
            if (!el) return;
            let sx = 0, dx = 0, dragging = false;
            el.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; dx = 0; dragging = true; }, { passive: true });
            el.addEventListener('touchmove', (e) => { if (dragging) dx = e.touches[0].clientX - sx; }, { passive: true });
            el.addEventListener('touchend', () => {
                if (dragging && Math.abs(dx) > 40) { dx > 0 ? this.prevImage() : this.nextImage(); }
                dragging = false; dx = 0;
            });
        }

        formatNum(n) { return Number(n).toLocaleString('ru-RU'); }

        open(car) {
            if (!this.overlay) return;
            this.currentCar = car;
            this.currentImageIndex = 0;
            this.isOpen = true;
            this.updateSEO(car);
            this.lastFocusedEl = document.activeElement;
            if (window.urlManager) window.urlManager.updateUrl(car.id);

            if (this.statusEl) {
                const statusText = getStockText(car);
                const updatedText = catalogUpdatedText || formatUpdatedText(catalogUpdatedAt);
                this.statusEl.innerHTML = '<span class="status-dot"></span>' + escapeHtml(statusText + (updatedText ? ' · ' + updatedText : ''));
            }

            if (this.titleEl) this.titleEl.textContent = car.mark_id || 'Автомобиль';
            if (this.captionEl) this.captionEl.textContent = car.salon || 'Ижевск';

            if (this.vinEl) {
                if (car.vin) {
                    this.vinEl.textContent = 'VIN ' + maskVin(car.vin);
                    this.vinEl.title = 'VIN ' + car.vin;
                    this.vinEl.style.display = 'inline';
                } else if (car.id) {
                    this.vinEl.textContent = 'ID объявления ' + car.id;
                    this.vinEl.removeAttribute('title');
                    this.vinEl.style.display = 'inline';
                } else {
                    this.vinEl.textContent = '';
                    this.vinEl.style.display = 'none';
                    this.vinEl.removeAttribute('title');
                }
            }

            if (this.phoneBtn && car.phone) {
                const phoneHref = normalizePhoneHref(car.phone);
                if (phoneHref) this.phoneBtn.setAttribute('href', phoneHref);
            }

            if (this.applyBtn) {
                setLeadButtonDataset(this.applyBtn, car);
                const applyLink = this.applyBtn.closest('a[href^="#popup:"]');
                if (applyLink) setLeadButtonDataset(applyLink, car);
            }

            if (this.calcBtn) {
                setLeadButtonDataset(this.calcBtn, car);
                const calcLink = this.calcBtn.closest('a[href^="#popup:"]');
                if (calcLink) setLeadButtonDataset(calcLink, car);
            }

            if (this.pillsEl) {
                const pills = [];
                if (car.year) pills.push(car.year + ' год');
                if (car.run) pills.push(this.formatNum(car.run) + ' км');
                if (car.gearbox) pills.push(escapeHtml(car.gearbox));
                if (car.drive) pills.push(escapeHtml(car.drive));
                if (car.engine_type) pills.push(escapeHtml(car.engine_type));
                this.pillsEl.innerHTML = pills.map(t => '<span class="ctag">' + t + '</span>').join('');
            }

            const basePrice = car.price_discount || car.price;
            if (this.priceEl) {
                if (car.max_discount > 0 && car.price) {
                    this.priceEl.textContent = this.formatNum(car.price_discount) + ' ₽';
                    if (this.priceOldEl) {
                        this.priceOldEl.textContent = this.formatNum(car.price) + ' ₽';
                        this.priceOldEl.style.display = 'inline';
                    }
                    if (this.saveEl) {
                        this.saveEl.textContent = 'Экономия ' + this.formatNum(car.price - car.price_discount) + ' ₽';
                        this.saveEl.style.display = 'inline-block';
                    }
                } else {
                    this.priceEl.textContent = basePrice ? this.formatNum(basePrice) + ' ₽' : 'Цена по запросу';
                    if (this.priceOldEl) { this.priceOldEl.textContent = ''; this.priceOldEl.style.display = 'none'; }
                    if (this.saveEl) { this.saveEl.textContent = ''; this.saveEl.style.display = 'none'; }
                }
            }

            if (this.monthlyEl) {
                const leaseMonth = getLeaseMonth(basePrice);
                this.monthlyEl.textContent = leaseMonth ? 'от ' + leaseMonth + ' ₽/мес *' : 'Рассчитать кредит';
            }

            this.renderSpecs(car);
            this.renderDescription(car);

            this.renderGallery(car);
            this.overlay.style.display = '';
            this.overlay.style.pointerEvents = '';
            this.overlay.classList.remove('hidden');
            setTimeout(() => {
                this.overlay.classList.add('visible');
                if (this.closeBtn) this.closeBtn.focus();
            }, 10);
            document.body.style.overflow = 'hidden';
        }

        close(options = {}) {
            if (!this.overlay) return;

            const immediate = !!options.immediate;
            const keepBodyOverflowLocked = !!options.keepBodyOverflowLocked;
            const skipFocusRestore = !!options.skipFocusRestore;

            this.isOpen = false;
            this.resetSEO();
            if (window.urlManager) window.urlManager.clearUrl();

            if (this._closeTimer) {
                clearTimeout(this._closeTimer);
                this._closeTimer = null;
            }

            const finishClose = () => {
                this.overlay.classList.add('hidden');
                this.overlay.style.pointerEvents = 'none';
                this.overlay.style.display = 'none';
                if (!keepBodyOverflowLocked) document.body.style.overflow = '';
                if (!skipFocusRestore && this.lastFocusedEl?.focus) this.lastFocusedEl.focus();
            };

            this.overlay.classList.remove('visible');

            if (immediate) {
                finishClose();
                return;
            }

            this._closeTimer = setTimeout(() => {
                this._closeTimer = null;
                finishClose();
            }, 300);
        }

        renderSpecs(car) {
            if (!this.specsEl) return;
            const engineVal = (car.engine_volume ? car.engine_volume + ' л' : '')
                + (car.engine_power ? ' · ' + car.engine_power + ' л.с.' : '')
                + (car.engine_type ? ', ' + car.engine_type : '');
            const specs = [
                { label: 'Год выпуска', value: car.year ? car.year + ' год' : 'Не указан' },
                { label: 'Пробег', value: car.run ? this.formatNum(car.run) + ' км' : 'Не указан' },
                { label: 'Кузов', value: car.body_type || 'Не указан' },
                { label: 'Цвет', value: car.color || 'Не указан' },
                { label: 'Двигатель', value: engineVal.trim() || 'Не указан' },
                { label: 'КПП', value: car.gearbox || 'Не указана' },
                { label: 'Привод', value: car.drive || 'Не указан' },
                { label: 'Владельцев', value: formatOwners(car.owners_number) },
                { label: 'ПТС', value: car.pts || 'Не указан' },
                { label: 'Руль', value: car.wheel || 'Не указан' },
                { label: 'Автосалон', value: car.salon || 'Не указан' },
                { label: 'VIN', value: car.vin || 'Не указан' }
            ];
            this.specsEl.innerHTML = specs.map(s =>
                '<div class="pm-spec-tile"><div class="pm-spec-label">' + escapeHtml(s.label) + '</div>' +
                '<div class="pm-spec-value">' + escapeHtml(s.value) + '</div></div>'
            ).join('');
        }

        renderDescription(car) {
            if (!this.descEl || !this.descBlock) return false;

            const rawDesc = (car.description || '').replace(/\r?\n∙/g, '\n').trim();
            if (!rawDesc) {
                this.descEl.innerHTML = '';
                this.descBlock.style.display = 'none';
                debugLog('CarDetailModal.renderDescription', 'Описание отсутствует', { carId: car?.id });
                return false;
            }

            this.descEl.innerHTML = escapeHtml(rawDesc).replace(/\n/g, '<br>');
            this.descBlock.style.display = 'block';
            debugLog('CarDetailModal.renderDescription', 'Описание отрисовано', {
                carId: car?.id,
                chars: rawDesc.length
            });
            return true;
        }

        renderGallery(car) {
            const images = Array.isArray(car.images) && car.images.length ? car.images : [PLACEHOLDER_IMG];
            if (this.thumbnailsContainer) {
                this.thumbnailsContainer.innerHTML = '';
                images.forEach((src, index) => {
                    const thumb = document.createElement('button');
                    thumb.className = 'pm-thumb' + (index === 0 ? ' is-active' : '');
                    thumb.setAttribute('aria-label', 'Фото ' + (index + 1));
                    const img = document.createElement('img');
                    img.src = src;
                    img.alt = '';
                    img.onerror = function() { this.onerror = null; this.src = PLACEHOLDER_IMG; };
                    thumb.appendChild(img);
                    thumb.addEventListener('click', (e) => { e.stopPropagation(); this.showImage(index); });
                    this.thumbnailsContainer.appendChild(thumb);
                });
            }
            if (this.prevBtn && this.nextBtn) {
                const showNav = images.length > 1;
                this.prevBtn.style.display = showNav ? 'flex' : 'none';
                this.nextBtn.style.display = showNav ? 'flex' : 'none';
            }
            this.showImage(0);
        }

        showImage(index) {
            if (!this.currentCar) return;
            const images = Array.isArray(this.currentCar.images) && this.currentCar.images.length ? this.currentCar.images : [PLACEHOLDER_IMG];
            if (index < 0 || index >= images.length) return;
            this.currentImageIndex = index;
            if (this.mainImage) {
                this.mainImage.src = images[index];
                this.mainImage.alt = this.currentCar.mark_id + ' — фото ' + (index + 1);
                this.mainImage.onerror = function() { this.onerror = null; this.src = PLACEHOLDER_IMG; };
            }
            if (this.counterEl) this.counterEl.textContent = (index + 1) + ' / ' + images.length;
            if (this.thumbnailsContainer) {
                this.thumbnailsContainer.querySelectorAll('.pm-thumb').forEach((t, i) => t.classList.toggle('is-active', i === index));
            }
        }

        prevImage() {
            if (!this.currentCar) return;
            const images = Array.isArray(this.currentCar.images) && this.currentCar.images.length ? this.currentCar.images : [PLACEHOLDER_IMG];
            if (images.length <= 1) return;
            this.showImage(this.currentImageIndex > 0 ? this.currentImageIndex - 1 : images.length - 1);
        }

        nextImage() {
            if (!this.currentCar) return;
            const images = Array.isArray(this.currentCar.images) && this.currentCar.images.length ? this.currentCar.images : [PLACEHOLDER_IMG];
            if (images.length <= 1) return;
            this.showImage(this.currentImageIndex < images.length - 1 ? this.currentImageIndex + 1 : 0);
        }
    }

    debugWrapPrototype(CarDetailModal.prototype, 'CarDetailModal', ['_initGallerySwipe', 'showImage']);

    /* ========== PAGINATION ========== */
    class Pagination {
        constructor(containerId, paginationId, resultsCountId) {
            this.container = document.getElementById(containerId);
            this.pagination = document.getElementById(paginationId);
            this.resultsCount = document.getElementById(resultsCountId);
            this.currentPage = 1; this.pageSize = 16;
            this.totalItems = 0; this.totalPages = 0; this.data = []; this.onPageChange = null;
        }
        setData(data) {
            this.data = data; this.totalItems = data.length;
            this.totalPages = Math.ceil(this.totalItems / this.pageSize);
            this.currentPage = 1; this.updateDisplay();
        }
        setPageSize(size) {
            this.pageSize = size; this.totalPages = Math.ceil(this.totalItems / this.pageSize);
            this.currentPage = 1; this.updateDisplay();
        }
        getCurrentPageData() {
            const s = (this.currentPage - 1) * this.pageSize;
            return this.data.slice(s, s + this.pageSize);
        }
        goToPage(page) {
            if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
                this.currentPage = page; this.updateDisplay();
                if (this.onPageChange) this.onPageChange(this.getCurrentPageData(), page);
                if (window.carDetailModal && window.carDetailModal.isOpen) window.carDetailModal.close();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
        updateDisplay() {
            this.updateResultsCount(); this.updatePagination();
            this.container.style.display = (this.totalItems === 0 || this.totalPages <= 1) ? 'none' : 'flex';
        }
        updateResultsCount() {
            const s = (this.currentPage - 1) * this.pageSize + 1;
            const e = Math.min(this.currentPage * this.pageSize, this.totalItems);
            this.resultsCount.textContent = this.totalItems === 0
                ? 'Ничего не найдено'
                : `Показано: ${s}-${e} из ${this.totalItems} автомобилей`;
        }
        updatePagination() {
            this.pagination.innerHTML = '';
            if (this.totalPages <= 1) return;
            const prevBtn = this.createButton('← Назад', this.currentPage - 1);
            prevBtn.classList.add('prev-next');
            if (this.currentPage === 1) prevBtn.disabled = true;
            this.pagination.appendChild(prevBtn);
            const maxV = 7; let s, e;
            if (this.totalPages <= maxV) { s = 1; e = this.totalPages; }
            else {
                const d = Math.floor(maxV / 2);
                if (this.currentPage <= d + 1) { s = 1; e = maxV - 1; }
                else if (this.currentPage >= this.totalPages - d) { s = this.totalPages - maxV + 2; e = this.totalPages; }
                else { s = this.currentPage - d + 1; e = this.currentPage + d - 1; }
            }
            if (s > 1) {
                this.pagination.appendChild(this.createButton('1', 1));
                if (s > 2) this.pagination.appendChild(this.createEllipsis());
            }
            for (let i = s; i <= e; i++) {
                const btn = this.createButton(i.toString(), i);
                if (i === this.currentPage) btn.classList.add('active');
                this.pagination.appendChild(btn);
            }
            if (e < this.totalPages) {
                if (e < this.totalPages - 1) this.pagination.appendChild(this.createEllipsis());
                this.pagination.appendChild(this.createButton(this.totalPages.toString(), this.totalPages));
            }
            const nextBtn = this.createButton('Вперед →', this.currentPage + 1);
            nextBtn.classList.add('prev-next');
            if (this.currentPage === this.totalPages) nextBtn.disabled = true;
            this.pagination.appendChild(nextBtn);
        }
        createButton(text, page) {
            const btn = document.createElement('button');
            btn.className = 'pagination-btn'; btn.textContent = text;
            btn.onclick = () => this.goToPage(page); return btn;
        }
        createEllipsis() {
            const span = document.createElement('span');
            span.className = 'pagination-ellipsis'; span.textContent = '...'; return span;
        }
    }

    debugWrapPrototype(Pagination.prototype, 'Pagination');

    /* ========== LAZY LOADER ========== */
    class ImageLazyLoader {
        constructor() { this.imageObserver = null; this.init(); }
        init() {
            if ('IntersectionObserver' in window) {
                this.imageObserver = new IntersectionObserver((entries) => this.loadImages(entries), {
                    rootMargin: '50px 0px', threshold: 0.01
                });
            }
        }
        loadImages(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    const src = img.dataset.src;
                    if (src && !img.classList.contains('loaded')) {
                        const newImg = new Image();
                        newImg.onload = () => { img.src = src; img.classList.add('loaded'); img.classList.remove('lazy-image'); };
                        newImg.onerror = () => { img.src = PLACEHOLDER_IMG; img.classList.add('loaded'); };
                        newImg.src = src;
                        this.imageObserver.unobserve(img);
                    }
                }
            });
        }
        observe(element) {
            if (this.imageObserver && element) {
                element.querySelectorAll('img.lazy-image').forEach(img => this.imageObserver.observe(img));
            }
        }
        disconnect() { if (this.imageObserver) this.imageObserver.disconnect(); }
    }

    debugWrapPrototype(ImageLazyLoader.prototype, 'ImageLazyLoader');

    /* ========== HELPERS ========== */
    let cars = [];
    let filteredCars = [];
    let catalogMeta = {}; // meta из JSON-фида: updated_at, salons, total и т.д.
    let catalogUpdatedAt = ''; // единая дата обновления всего фида, не дублируется в каждой карточке
    let catalogUpdatedText = ''; // единый текст обновления для всех карточек

    const fullCatalogGridEl = document.getElementById('cards-grid');
    const randomCatalogGridEl = document.querySelector('[data-udm-random-grid]');
    const hasFullCatalog = !!fullCatalogGridEl;
    const hasRandomCatalog = !!randomCatalogGridEl;
    const randomCatalogLimit = randomCatalogGridEl
        ? Math.max(1, parseInt(randomCatalogGridEl.getAttribute('data-limit') || '9', 10) || 9)
        : 9;

    const PLACEHOLDER_IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="100%" height="100%" fill="#e2e8f0"/><text x="50%" y="50%" font-family="Arial" font-size="16" fill="#94a3b8" text-anchor="middle" dominant-baseline="middle">Нет фото</text></svg>'
    );

    function getUnique(key) {
        return [...new Set(cars.map(c => c[key]).filter(Boolean))].sort((a,b)=>{
            if(typeof a==='number') return b-a;
            return String(a).localeCompare(String(b));
        });
    }

    function formatNum(n) { return Number(n).toLocaleString('ru-RU'); }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function filterImages(images) {
        if (!Array.isArray(images) || !images.length) return [];
        return images.length > 20 ? images.slice(0, 20) : images;
    }

    function getRandomCars(list, count) {
        const source = Array.isArray(list) ? list.slice() : [];
        for (let i = source.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = source[i];
            source[i] = source[j];
            source[j] = temp;
        }
        return source.slice(0, Math.min(count, source.length));
    }

    function getFirstValue(...values) {
        for (const value of values) {
            if (value !== null && value !== undefined && String(value).trim() !== '') return value;
        }
        return '';
    }

    function parseBool(value) {
        if (value === true || value === false) return value;
        if (value === 1 || value === '1') return true;
        if (value === 0 || value === '0') return false;
        const v = String(value || '').trim().toLowerCase();
        if (['true', 'yes', 'да', 'y'].includes(v)) return true;
        if (['false', 'no', 'нет', 'n'].includes(v)) return false;
        return null;
    }

    function formatUpdatedText(value) {
        if (!value) return '';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return String(value);

        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startInput = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const diffDays = Math.round((startToday - startInput) / 86400000);

        if (diffDays === 0) return 'обновлено сегодня';
        if (diffDays === 1) return 'обновлено вчера';

        return 'обновлено ' + d.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }


    function setCatalogMeta(meta) {
        catalogMeta = meta && typeof meta === 'object' ? meta : {};
        catalogUpdatedAt = getFirstValue(
            catalogMeta.updated_at,
            catalogMeta.feed_updated_at,
            catalogMeta.result_updated_at,
            catalogMeta.date
        );
        catalogUpdatedText = getFirstValue(
            catalogMeta.updated_text,
            catalogMeta.feed_updated_text,
            formatUpdatedText(catalogUpdatedAt)
        );
        debugLog('setCatalogMeta', {
            catalogMeta: catalogMeta,
            catalogUpdatedAt: catalogUpdatedAt,
            catalogUpdatedText: catalogUpdatedText
        });
    }

    function getStockText(car) {
        const available = parseBool(car?.in_stock);
        if (available === false) return 'Под заказ';
        if (car?.stock_status) return String(car.stock_status);
        if (car?.availability) return String(car.availability);
        return 'В наличии';
    }

    function maskVin(vin) {
        const clean = String(vin || '').trim();
        if (!clean) return '';
        if (clean.length <= 8) return clean;
        return clean.slice(0, 3) + '••••••' + clean.slice(-5);
    }

    function formatOwners(value) {
        const n = parseInt(value, 10);
        if (!Number.isFinite(n) || n <= 0) return 'Не указано';
        const last = n % 10;
        const lastTwo = n % 100;
        let word = 'владельцев';
        if (last === 1 && lastTwo !== 11) word = 'владелец';
        else if ([2,3,4].includes(last) && ![12,13,14].includes(lastTwo)) word = 'владельца';
        return n + ' ' + word;
    }

    function normalizePhoneHref(phone) {
        const raw = String(phone || '').trim();
        if (!raw) return '';
        const clean = raw.replace(/[^+\d]/g, '');
        return clean ? 'tel:' + clean : '';
    }

    function getLeaseMonth(price) {
        const value = Number(price);
        if (!Number.isFinite(value) || value <= 0) return '';

        // Формула кредита:
        // стоимость авто + 10%
        // первоначальный взнос 80%
        // срок 8 лет = 96 месяцев
        const priceWithMarkup = value * 1.1;
        const initialPayment = priceWithMarkup * 0.8;
        const creditAmount = priceWithMarkup - initialPayment;
        const monthCount = 8 * 12;

        return Math.round(creditAmount / monthCount).toLocaleString('ru-RU');
    }

    /* ========== MODEL VALUE FOR TILDA POPUPS ========== */
    const LEAD_POPUP_HOOKS = ['#popup:model', '#popup:report'];
    const LEAD_MODEL_FIELD_NAME = 'Модель';
    let lastLeadCar = null;

    function escapeCssAttr(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    function normalizeLeadCar(car) {
        if (!car) return null;

        const title = String(
            car.mark_id ||
            car.carTitle ||
            car.title ||
            car.name ||
            ''
        ).trim();

        if (!title) return null;

        return {
            id: car.id || car.carId || '',
            title: title,
            price: car.price_discount || car.price || car.carPrice || '',
            salon: car.salon || car.carSalon || ''
        };
    }

    function setLeadButtonDataset(element, car) {
        const leadCar = normalizeLeadCar(car);
        if (!element || !leadCar) return false;

        element.dataset.carId = leadCar.id || '';
        element.dataset.carTitle = leadCar.title || '';
        element.dataset.carPrice = leadCar.price || '';
        element.dataset.carSalon = leadCar.salon || '';
        return true;
    }

    function getPopupHookFromTrigger(trigger) {
        const $trigger = $(trigger);
        const href = $trigger.attr('href') || $trigger.closest('a[href^="#popup:"]').attr('href') || '';
        if (LEAD_POPUP_HOOKS.includes(href)) return href;

        const dataHook = trigger?.dataset?.popupHook || trigger?.dataset?.popupTarget || '';
        if (LEAD_POPUP_HOOKS.includes(dataHook)) return dataHook;

        const currentHash = window.location.hash || '';
        if (LEAD_POPUP_HOOKS.includes(currentHash)) return currentHash;

        return '';
    }

    function getLeadCarFromTrigger(trigger) {
        const $trigger = $(trigger);
        const cardCar = $trigger.closest('.car-card').data('car');
        const triggerDataCar = normalizeLeadCar({
            id: trigger?.dataset?.carId,
            title: trigger?.dataset?.carTitle,
            price: trigger?.dataset?.carPrice,
            salon: trigger?.dataset?.carSalon
        });

        const cardTitle = String($trigger.closest('.car-card').find('.card-title, .card-name').first().text() || '').trim();
        const cardTitleCar = cardTitle ? { title: cardTitle } : null;
        const modalCar = window.carDetailModal?.currentCar || null;

        return normalizeLeadCar(cardCar) || triggerDataCar || normalizeLeadCar(cardTitleCar) || normalizeLeadCar(modalCar) || lastLeadCar;
    }

    function setCurrentLeadCar(car, popupHook = '') {
        const leadCar = normalizeLeadCar(car);
        if (!leadCar) return false;

        lastLeadCar = leadCar;
        scheduleFillPopupModelField(popupHook);
        debugLog('setCurrentLeadCar', {
            popupHook: popupHook,
            title: leadCar.title,
            id: leadCar.id
        });
        return true;
    }

    function getPopupRoots(popupHook = '') {
        const hooks = popupHook && LEAD_POPUP_HOOKS.includes(popupHook) ? [popupHook] : LEAD_POPUP_HOOKS;
        const roots = [];

        hooks.forEach((hook) => {
            const safeHook = escapeCssAttr(hook);
            const selectors = [
                '[data-tooltip-hook="' + safeHook + '"]',
                '[data-popup-hook="' + safeHook + '"]',
                '[data-popup-target="' + safeHook + '"]'
            ];

            selectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((el) => roots.push(el));
            });
        });

        if (!roots.length) {
            document.querySelectorAll('.t-popup.t-popup_show, .t-popup_show, .t-popup_showed').forEach((el) => roots.push(el));
        }

        return Array.from(new Set(roots));
    }

    function getModelFields(root) {
        const safeName = escapeCssAttr(LEAD_MODEL_FIELD_NAME);
        const selectors = [
            'input[name="' + safeName + '"]',
            'textarea[name="' + safeName + '"]',
            'select[name="' + safeName + '"]',
            'input[data-tilda-name="' + safeName + '"]',
            'textarea[data-tilda-name="' + safeName + '"]',
            'select[data-tilda-name="' + safeName + '"]',
            '[data-tilda-name="' + safeName + '"]',
            '[data-original-name="' + safeName + '"]'
        ];

        try {
            return Array.from((root || document).querySelectorAll(selectors.join(',')));
        } catch(e) {
            debugWarn('getModelFields', 'Не удалось найти поле модели', e);
            return [];
        }
    }

    function setFieldValue(field, value) {
        if (!field || !value) return false;

        let target = field;
        if (!('value' in target)) {
            target = field.querySelector('input, textarea, select') ||
                field.closest('.t-input-group')?.querySelector('input, textarea, select') ||
                null;
        }

        if (!target || !('value' in target)) return false;

        target.value = value;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') target.setAttribute('value', value);

        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function fillPopupModelField(popupHook = '') {
        const leadCar = lastLeadCar || normalizeLeadCar(window.carDetailModal?.currentCar);
        if (!leadCar?.title) return false;

        const roots = getPopupRoots(popupHook);
        let fields = [];

        roots.forEach((root) => {
            fields = fields.concat(getModelFields(root));
        });

        if (!fields.length) fields = getModelFields(document);

        let filledCount = 0;
        Array.from(new Set(fields)).forEach((field) => {
            if (setFieldValue(field, leadCar.title)) filledCount++;
        });

        debugLog('fillPopupModelField', {
            popupHook: popupHook,
            title: leadCar.title,
            fieldsFound: fields.length,
            filledCount: filledCount
        });

        return filledCount > 0;
    }

    function scheduleFillPopupModelField(popupHook = '') {
        [0, 60, 150, 300, 700, 1200].forEach((delay) => {
            setTimeout(() => fillPopupModelField(popupHook), delay);
        });
    }

    function closeCarDetailModalBeforeLeadPopup() {
        const detailModal = window.carDetailModal;
        const overlay = document.getElementById('car-detail-modal');
        const isVisible = !!(
            overlay &&
            (
                overlay.classList.contains('visible') ||
                (detailModal && detailModal.isOpen) ||
                (!overlay.classList.contains('hidden') && overlay.style.display !== 'none')
            )
        );

        if (!detailModal && !overlay) return false;
        if (detailModal && !detailModal.isOpen && !isVisible) return false;

        if (detailModal) {
            detailModal.isOpen = false;

            if (detailModal._closeTimer) {
                clearTimeout(detailModal._closeTimer);
                detailModal._closeTimer = null;
            }

            try {
                if (typeof detailModal.resetSEO === 'function') detailModal.resetSEO();
            } catch(e) {
                debugWarn('closeCarDetailModalBeforeLeadPopup', 'Не удалось восстановить SEO', e);
            }
        }

        try {
            if (window.urlManager) window.urlManager.clearUrl();
        } catch(e) {
            debugWarn('closeCarDetailModalBeforeLeadPopup', 'Не удалось очистить URL', e);
        }

        if (overlay) {
            overlay.classList.remove('visible');
            overlay.classList.add('hidden');
            overlay.style.pointerEvents = 'none';
            overlay.style.display = 'none';
        }

        document.body.style.overflow = '';
        debugLog('closeCarDetailModalBeforeLeadPopup', 'Модальное окно подробностей закрыто перед открытием формы');
        return true;
    }

    function openTildaLeadPopup(popupHook) {
        if (!popupHook || !LEAD_POPUP_HOOKS.includes(popupHook)) return false;

        window.location.hash = '';

        setTimeout(() => {
            window.location.hash = popupHook;
            scheduleFillPopupModelField(popupHook);
        }, 30);

        return true;
    }

    function getLeadPopupTriggerFromEventTarget(target) {
        if (!target || typeof target.closest !== 'function') return null;
        return target.closest('a[href="#popup:model"], a[href="#popup:report"], .pm-apply-btn, .pm-calc-btn');
    }

    document.addEventListener('click', function(e) {
        const trigger = getLeadPopupTriggerFromEventTarget(e.target);
        if (!trigger) return;
        if (trigger.dataset?.udmPopupOpenSkip === '1' || trigger.closest?.('[data-udm-popup-open-skip="1"]')) return;

        const popupHook = getPopupHookFromTrigger(trigger);
        if (!popupHook) return;

        const leadCar = getLeadCarFromTrigger(trigger);
        setCurrentLeadCar(leadCar, popupHook);

        // ВАЖНО: не делаем preventDefault() и stopPropagation().
        // Так Tilda получает исходный клик по #popup:* и сама открывает форму.
        closeCarDetailModalBeforeLeadPopup();
        scheduleFillPopupModelField(popupHook);
    }, true);

    window.addEventListener('hashchange', function() {
        if (LEAD_POPUP_HOOKS.includes(window.location.hash)) {
            scheduleFillPopupModelField(window.location.hash);
        }
    });

    /* ========== TRANSFORM ========== */
    function transformJsonToCar(id, data) {
        debugCheck(!!data && typeof data === 'object', 'transformJsonToCar', 'Объект авто получен', 'Некорректный объект авто', { id: id, data: data });
        if (!data || typeof data !== 'object') data = {};
        const mark = (data.mark || data.original_mark_id || '').trim();
        const model = (data.model || '').trim();
        const generation = (data.generation || '').trim();
        
        // Собираем название: mark + model + generation
        let mark_id = mark;
        if (model) mark_id += ' ' + model;
        if (generation) mark_id += ' ' + generation;
        mark_id = mark_id.trim();
    
        const price = parseInt(data.price) || null;
        const maxDiscount = parseInt(data.max_discount) || 0;
        const discountPrice = price !== null ? Math.max(price - maxDiscount, 0) : null;
        const vin = String(getFirstValue(data.vin, data.VIN, data.vin_number, data.vinNumber, data.vin_code, data.vinCode)).trim();
        const inStockParsed = parseBool(getFirstValue(data.in_stock, data.store, data.available, data.availability));
    
        return {
            id: id,
            mark_id: mark_id,
            original_mark_id: mark,
            model: model,
            generation: generation,
            complectation_name: data.complectation_name || data.complectation || '\u00A0',
            drive: data.drive || 'Не указан',
            gearbox: data.gearbox || 'Не указана',
            color: data.color || 'Не указан',
            year: data.year || null,
            price: price,
            max_discount: maxDiscount,
            price_discount: discountPrice,
            run: parseInt(data.run) || null,
            engine_power: data.engine_power || 'Не указана',
            images: filterImages(data.images || []),
            vin: vin,
            body_type: data.body_type,
            engine_type: data.engine_type,
            engine_volume: data.engine_volume,
            owners_number: parseInt(getFirstValue(data.owners_number, data.owners, data.owner_count, data.owners_count), 10) || null,
            pts: data.pts || data.pts_type || '',
            description: data.description || null,
            description_raw: data.description_raw || data.raw_description || '',
            wheel: data.wheel || 'Не указан',
            salon: data.salon || 'Не указан',
            url: data.url || '',
            name: data.name || '',
            phone: data.phone || data.salon_phone || '',
            count: parseInt(data.count, 10) || null,
            in_stock: inStockParsed === null ? true : inStockParsed,
            stock_status: data.stock_status || data.status || ''
        };
    }

    function initLoadedCatalog(source = 'unknown', options = {}) {
        debugLog('initLoadedCatalog', {
            source: source,
            options: options,
            hasFullCatalog: hasFullCatalog,
            hasRandomCatalog: hasRandomCatalog,
            carsCount: cars.length
        });

        if (hasFullCatalog) {
            if (options.partialUpdate) {
                generateSeoLinks(cars);
                initFilters();
                applyFilters();
            } else {
                initAllAfterLoad(source);
            }
            return;
        }

        if (hasRandomCatalog) {
            initRandomCatalog(source);
            return;
        }

        debugWarn('initLoadedCatalog', 'На странице не найден ни полный каталог #cards-grid, ни краткий блок [data-udm-random-grid]');
    }

    function initRandomCatalog(source = 'unknown') {
        debugGroup('initRandomCatalog', 'Инициализация краткого блока', {
            source: source,
            carsCount: cars.length,
            limit: randomCatalogLimit
        });

        if (!window.urlManager) window.urlManager = new URLManager();
        if (!window.carDetailModal) window.carDetailModal = new CarDetailModal();

        const randomCars = getRandomCars(cars, randomCatalogLimit);
        renderRandomCards(randomCars);

        debugLog('initRandomCatalog', 'Отрисованы случайные авто', randomCars.map(c => ({ id: c.id, title: c.mark_id })));
        debugGroupEnd();
    }

    /* ========== LOAD DATA ========== */
    async function loadCarsData() {
        debugGroup('loadCarsData', 'Старт загрузки каталога');
        debugSnapshot('before-loadCarsData');

        showSkeletonCards();

        let initializedFromCache = false;
        let cached = null;

        try {
            cached = await getCachedFeed();
            debugLog('loadCarsData', 'Результат getCachedFeed()', cached);

            if (cached) {
                const cachedCarsList = extractCarsList(cached);
                debugCheck(
                    cachedCarsList && typeof cachedCarsList === 'object',
                    'loadCarsData.cache',
                    'Кэш распознан',
                    'Кэш есть, но формат не распознан',
                    cachedCarsList
                );

                if (cachedCarsList && Object.keys(cachedCarsList).length) {
                    cars = Object.values(cachedCarsList).map((item, index) => {
                        const id = item?.id || item?.vin || index;
                        return transformJsonToCar(id, item);
                    });

                    initializedFromCache = true;
                    debugLog('loadCarsData.cache', 'Загружено из кэша: ' + cars.length + ' авто');
                    debugTable('loadCarsData.cache.cars', cars);
                    initLoadedCatalog('cache');
                }
            } else {
                debugLog('loadCarsData.cache', 'Актуального кэша нет');
            }
        } catch(cacheErr) {
            debugError('loadCarsData.cache', 'Ошибка при чтении кэша', cacheErr);
        }

        try {
            const feedUrls = [
                'https://dhost.makeagency.ru/playback/udm-feed.json',
                'https://s3.hommenest.ru/digital/backup/udm-feed.json'
            ];
            
            async function fetchFreshFeed(index = 0) {
                if (index >= feedUrls.length) {
                    throw new Error('Не удалось загрузить свежий фид ни по одной ссылке');
                }
            
                const feedUrl = feedUrls[index];
                debugLog('loadCarsData.fetch', 'Запрашиваем свежий фид', feedUrl);
            
                try {
                    const resp = await fetch(feedUrl, { cache: 'no-store' });
            
                    debugLog('loadCarsData.fetch', 'Ответ fetch', {
                        ok: resp.ok,
                        status: resp.status,
                        statusText: resp.statusText,
                        url: resp.url,
                        type: resp.type,
                        redirected: resp.redirected
                    });
            
                    // Если ответ не 200 — пробуем следующую ссылку
                    if (resp.status !== 200) {
                        throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
                    }
            
                    return await resp.json();
                } catch (err) {
                    debugError('loadCarsData.fetch', 'Ошибка загрузки по ссылке: ' + feedUrl, err);
            
                    // Если текущая ссылка не сработала — пробуем следующую
                    return fetchFreshFeed(index + 1);
                }
            }
            
            const jsonData = await fetchFreshFeed(0);
            debugLog('loadCarsData.fetch', 'JSON получен', jsonData);

            if (!jsonData) {
                debugWarn('loadCarsData.fetch', 'Данные пустые или некорректные', jsonData);
                if (!cached) showError('Данные пустые или некорректные');
                return;
            }

            await setCachedFeed(jsonData);

            const freshCarsList = extractCarsList(jsonData);
            debugCheck(
                freshCarsList && typeof freshCarsList === 'object',
                'loadCarsData.fresh',
                'Свежий фид распознан',
                'Свежий фид не удалось распознать',
                freshCarsList
            );

            if (!freshCarsList || typeof freshCarsList !== 'object') {
                if (!cached) showError('Не удалось распознать структуру каталога');
                return;
            }

            const previousCount = cars.length;
            const newCars = Object.values(freshCarsList).map((item, index) => {
                const id = item?.id || item?.vin || index;
                return transformJsonToCar(id, item);
            });

            debugLog('loadCarsData.fresh', 'Загружено свежих: ' + newCars.length + ' авто', {
                previousCount: previousCount,
                initializedFromCache: initializedFromCache
            });
            debugTable('loadCarsData.fresh.cars', newCars);

            cars = newCars;

            if (!initializedFromCache) {
                initLoadedCatalog('fresh');
            } else {
                debugLog('loadCarsData.fresh', 'Кэш уже отрисован, обновляем данные без повторной полной инициализации');
                initLoadedCatalog('fresh', { partialUpdate: true });
            }

            debugSnapshot('after-loadCarsData-success', { source: initializedFromCache ? 'cache+fresh' : 'fresh' });
        } catch(err) {
            debugError('loadCarsData.fetch', 'Ошибка загрузки свежего фида', err);
            if (!cached) showError('Не удалось загрузить каталог');
        } finally {
            debugGroupEnd();
        }
    }

    // Извлекает словарь машин из разных форматов ответа
    function extractCarsList(jsonData) {
        debugGroup('extractCarsList', 'Разбор структуры ответа', jsonData);

        if (!jsonData) {
            debugWarn('extractCarsList', 'jsonData пустой');
            debugGroupEnd();
            return null;
        }

        // Формат 1: [{data: {...}, meta: {...}}] — массив с одним объектом
        if (Array.isArray(jsonData) && jsonData.length > 0 && jsonData[0] && jsonData[0].data) {
            setCatalogMeta(jsonData[0].meta || {});
            debugLog('extractCarsList', 'Формат распознан: массив с data', {
                length: jsonData.length,
                meta: catalogMeta,
                keys: Object.keys(jsonData[0].data || {}).slice(0, 10)
            });
            debugGroupEnd();
            return jsonData[0].data;
        }

        // Формат 2: {data: {...}, meta: {...}} — объект
        if (jsonData.data && typeof jsonData.data === 'object' && !Array.isArray(jsonData.data)) {
            setCatalogMeta(jsonData.meta || {});
            debugLog('extractCarsList', 'Формат распознан: объект с data', {
                meta: catalogMeta,
                keys: Object.keys(jsonData.data || {}).slice(0, 10)
            });
            debugGroupEnd();
            return jsonData.data;
        }

        // Формат 3: прямой словарь {"car-123": {...}} / {"CME...": {...}} / произвольные id
        if (typeof jsonData === 'object' && !Array.isArray(jsonData)) {
            const keys = Object.keys(jsonData);
            const firstValue = keys.length ? jsonData[keys[0]] : null;
            const looksLikeDict =
                keys.length &&
                firstValue &&
                typeof firstValue === 'object' &&
                (
                    keys[0].startsWith('car-') ||
                    keys[0].startsWith('CME') ||
                    'mark' in firstValue ||
                    'model' in firstValue ||
                    'price' in firstValue ||
                    'images' in firstValue
                );

            if (looksLikeDict) {
                if (jsonData.meta) setCatalogMeta(jsonData.meta);
                debugLog('extractCarsList', 'Формат распознан: прямой словарь', {
                    count: keys.length,
                    firstKeys: keys.slice(0, 10),
                    firstValue: firstValue
                });
                debugGroupEnd();
                return jsonData;
            }
        }

        debugWarn('extractCarsList', 'Неизвестный формат ответа', jsonData);
        debugGroupEnd();
        return null;
    }

    function initAllAfterLoad(source = 'unknown') {
        debugGroup('initAllAfterLoad', 'Полная инициализация после загрузки', { source: source, carsCount: cars.length });
        debugSnapshot('before-initAllAfterLoad', { source: source });
        const years = cars.map(c => c.year).filter(y => y !== null && y !== undefined);
        if (years.length > 0) {
            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            $('#year-min-input').val(minYear).attr('min', minYear).attr('max', maxYear);
            $('#year-max-input').val(maxYear).attr('min', minYear).attr('max', maxYear);
        }

        generateSeoLinks(cars);
        if (!window.urlManager) window.urlManager = new URLManager();
        if (!window.carDetailModal) window.carDetailModal = new CarDetailModal();
        initFilters();
        window.get_price_range = initRangeSlider('price','price-min-input','price-max-input');
        window.get_run_range = initRangeSlider('run','run-min-input','run-max-input');
        initMobileDrawer();
        if (!window.paginationInstance) initPagination();
        applyFilters();
        debugSnapshot('after-initAllAfterLoad', { source: source });
        debugGroupEnd();
    }

    function showError(msg) {
        debugError('showError', msg);
        const errorHtml = `
            <div class="no-results">
                <div class="no-results-icon">⚠️</div>
                <div>${msg}</div>
                <div style="font-size:14px;margin-top:8px;opacity:0.7;">
                    Не удалось загрузить список автомобилей. Попробуйте обновить страницу.
                </div>
                <button id="retry-load-btn" class="filter-btn filter-btn-apply" style="margin-top:16px;max-width:200px;">Повторить загрузку</button>
            </div>
        `;
        if (hasFullCatalog) $('#cards-container').html(errorHtml);
        else if (hasRandomCatalog) $(randomCatalogGridEl).html(errorHtml);
        cars = [];
        $('#retry-load-btn').on('click', loadCarsData);
    }

    function showSkeletonCards(count = 6) {
        const target = hasFullCatalog ? document.getElementById('cards-grid') : randomCatalogGridEl;
        const skeletonCount = hasRandomCatalog && !hasFullCatalog ? randomCatalogLimit : count;
        debugLog('showSkeletonCards', { count: skeletonCount, hasFullCatalog: hasFullCatalog, hasRandomCatalog: hasRandomCatalog });
        if (!target) return;
        const $c = $(target).empty();
        for (let i = 0; i < skeletonCount; i++) {
            $c.append(`
                <div class="skeleton-card">
                    <div class="skeleton-image"></div>
                    <div class="skeleton-content">
                        <div class="skeleton-line title"></div>
                        <div class="skeleton-line subtitle"></div>
                        <div class="skeleton-line price"></div>
                        <div class="skeleton-specs">
                            <div class="skeleton-spec"></div><div class="skeleton-spec"></div>
                            <div class="skeleton-spec"></div><div class="skeleton-spec"></div>
                            <div class="skeleton-spec"></div><div class="skeleton-spec"></div>
                        </div>
                        <div class="skeleton-button"></div>
                    </div>
                </div>
            `);
        }
    }

    /* ========== RANGE SLIDER ========== */
    class FastRangeSlider {
        constructor(prefix, minInputId, maxInputId) {
            this.prefix = prefix;
            this.minInput = document.getElementById(minInputId);
            this.maxInput = document.getElementById(maxInputId);
            this.track = document.getElementById(prefix + '-track');
            this.fill = document.getElementById(prefix + '-fill');
            this.thumbMin = document.getElementById(prefix + '-thumb-min');
            this.thumbMax = document.getElementById(prefix + '-thumb-max');

            const values = cars.map(c => c[prefix]).filter(v => v !== null);
            this.min = Math.min(...values); this.max = Math.max(...values);
            this.currentMin = this.min; this.currentMax = this.max;
            this.minInput.value = this.min; this.maxInput.value = this.max;
            this.isDragging = false; this.activeThumb = null; this.trackRect = null;
            this.throttledUpdate = this.throttle(this.updateSlider.bind(this), 16);
            this.init(); this.updateSlider();
        }
        throttle(func, limit) {
            let inT; return function() {
                if (!inT) { func.apply(this, arguments); inT = true; setTimeout(() => inT = false, limit); }
            };
        }
        init() {
            this.thumbMin.addEventListener('mousedown', (e) => this.startDrag(e, 'min'));
            this.thumbMax.addEventListener('mousedown', (e) => this.startDrag(e, 'max'));
            this.thumbMin.addEventListener('touchstart', (e) => this.startDrag(e, 'min'), {passive: true});
            this.thumbMax.addEventListener('touchstart', (e) => this.startDrag(e, 'max'), {passive: true});
            this.minInput.addEventListener('input', debounce(() => {
                this.currentMin = Math.max(this.min, Math.min(parseInt(this.minInput.value)||this.min, this.currentMax));
                this.updateSlider();
            }, 300));
            this.maxInput.addEventListener('input', debounce(() => {
                this.currentMax = Math.min(this.max, Math.max(parseInt(this.maxInput.value)||this.max, this.currentMin));
                this.updateSlider();
            }, 300));
            this._onMouseMove = (e) => this.handleMove(e);
            this._onTouchMove = (e) => this.onTouchMove(e);
            this._onMouseUp = () => this.stopDrag();
            this._onTouchEnd = () => this.stopDrag();
            this.thumbMin.addEventListener('keydown', (e) => this.onKeyDown(e, 'min'));
            this.thumbMax.addEventListener('keydown', (e) => this.onKeyDown(e, 'max'));
            this.track.addEventListener('click', (e) => this.onTrackClick(e));
        }
        getStep() { return Math.max(1, Math.round((this.max - this.min) / 10)); }
        onKeyDown(e, thumb) {
            const step = this.getStep(); let delta = 0;
            switch(e.code) {
                case 'ArrowLeft': case 'ArrowDown': delta = -step; break;
                case 'ArrowRight': case 'ArrowUp': delta = step; break;
                case 'Home': delta = this.min - (thumb==='min'?this.currentMin:this.currentMax); break;
                case 'End': delta = this.max - (thumb==='min'?this.currentMin:this.currentMax); break;
                default: return;
            }
            e.preventDefault();
            if (thumb === 'min') {
                this.currentMin = Math.max(this.min, Math.min(this.currentMin + delta, this.currentMax));
                this.minInput.value = this.currentMin;
            } else {
                this.currentMax = Math.min(this.max, Math.max(this.currentMax + delta, this.currentMin));
                this.maxInput.value = this.currentMax;
            }
            this.updateSlider(); applyFilters();
        }
        startDrag(e, thumb) {
            this.isDragging = true; this.activeThumb = thumb;
            this.trackRect = this.track.getBoundingClientRect();
            if (!e.touches) { e.preventDefault(); document.body.style.userSelect = 'none'; }
            document.addEventListener('mousemove', this._onMouseMove, {passive: true});
            document.addEventListener('mouseup', this._onMouseUp);
            document.addEventListener('touchmove', this._onTouchMove, {passive: false});
            document.addEventListener('touchend', this._onTouchEnd);
            (thumb==='min'?this.thumbMin:this.thumbMax).classList.add('dragging');
        }
        stopDrag() {
            if (!this.isDragging) return;
            this.isDragging = false; this.activeThumb = null; this.trackRect = null;
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', this._onMouseMove);
            document.removeEventListener('mouseup', this._onMouseUp);
            document.removeEventListener('touchmove', this._onTouchMove);
            document.removeEventListener('touchend', this._onTouchEnd);
            this.thumbMin.classList.remove('dragging'); this.thumbMax.classList.remove('dragging');
            applyFilters();
        }
        getClientX(e) { return e.touches ? e.touches[0].clientX : e.clientX; }
        getClientY(e) { return e.touches ? e.touches[0].clientY : e.clientY; }
        onTouchMove(e) {
            if (!this.isDragging || !this.activeThumb || !this.trackRect) return;
            e.preventDefault(); this.handleMove(e);
        }
        handleMove(e) {
            if (!this.isDragging || !this.activeThumb || !this.trackRect) return;
            const clientX = this.getClientX(e);
            const percent = Math.max(0, Math.min(1, (clientX - this.trackRect.left) / this.trackRect.width));
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
            this.thumbMin.setAttribute('aria-valuenow', this.currentMin);
            this.thumbMax.setAttribute('aria-valuenow', this.currentMax);
        }
        getRange() { return { low: this.currentMin, high: this.currentMax }; }
    }

    function initRangeSlider(prefix, minInputId, maxInputId) {
        const values = cars.map(c => c[prefix]).filter(v => v !== null);
        if (!values.length) return () => ({ low: 0, high: 0 });
        const slider = new FastRangeSlider(prefix, minInputId, maxInputId);
        const getRange = () => slider.getRange();
        getRange.slider = slider;
        return getRange;
    }

    debugWrapPrototype(FastRangeSlider.prototype, 'FastRangeSlider', ['handleMove', 'onTouchMove', 'updateSlider']);

    /* ========== MULTISELECT ========== */
    class MultiSelect {
        constructor($container, placeholder) {
            this.$container = $container;
            this.$trigger = $container.find('.multiselect-trigger');
            this.$dropdown = $container.find('.multiselect-dropdown');
            this.$selectedContainer = $container.find('.multiselect-selected');
            this.selectedValues = new Set();
            this.options = [];
            this.placeholder = placeholder || 'Выберите';
            this.init();
        }
        init() {
            const self = this;
            this.$trigger.on('click', function(e) { e.stopPropagation(); self.toggle(); });
            $(document).on('click', () => this.close());
            this.$dropdown.on('click', e => e.stopPropagation());
        }
        setOptions(options) { this.options = options; this.renderDropdown(); }
        renderDropdown() {
            const self = this; this.$dropdown.empty();
            this.options.forEach(option => {
                const checked = self.selectedValues.has(option) ? 'checked' : '';
                const $opt = $(`<div class="multiselect-option"><div class="multiselect-checkbox ${checked}"></div><span>${escapeHtml(option)}</span></div>`);
                $opt.on('click', () => self.toggleOption(option));
                self.$dropdown.append($opt);
            });
        }
        toggleOption(option) {
            if (this.selectedValues.has(option)) this.selectedValues.delete(option);
            else this.selectedValues.add(option);
            this.renderSelected(); this.renderDropdown();
        }
        renderSelected() {
            const self = this; this.$selectedContainer.empty();
            if (!this.selectedValues.size) {
                this.$selectedContainer.append(`<span class="multiselect-placeholder">${this.placeholder}</span>`);
            } else {
                this.selectedValues.forEach(value => {
                    const $tag = $(`<div class="multiselect-tag"><span>${escapeHtml(value)}</span><span class="multiselect-tag-remove">×</span></div>`);
                    $tag.find('.multiselect-tag-remove').on('click', e => { e.stopPropagation(); self.toggleOption(value); });
                    self.$selectedContainer.append($tag);
                });
            }
        }
        toggle() { this.$dropdown.hasClass('hidden') ? this.open() : this.close(); }
        open() { this.$dropdown.removeClass('hidden'); this.$trigger.addClass('open'); }
        close() { this.$dropdown.addClass('hidden'); this.$trigger.removeClass('open'); }
        getSelectedValues() { return Array.from(this.selectedValues); }
    }

    debugWrapPrototype(MultiSelect.prototype, 'MultiSelect');

    /* ========== CARD ========== */
    function createCardElement(car) {
        debugLog('createCardElement.input', car);
        const $wrapper = $('<div>', { class: 'car-card product-card' });
        const realImgSrc = Array.isArray(car.images) && car.images.length ? car.images[0] : PLACEHOLDER_IMG;
        const hasCarousel = Array.isArray(car.images) && car.images.length > 1;
        const hasDiscount = car.max_discount > 0;
        const basePrice = hasDiscount ? car.price_discount : car.price;
        const leaseMonth = getLeaseMonth(basePrice);
        const stockText = getStockText(car);

        const html = `
            <div class="card-img-wrap image-container">
                <img data-src="${escapeHtml(realImgSrc)}" alt="${escapeHtml(car.mark_id)}" loading="lazy" class="lazy-image">
                <div class="img-badges">
                    <span class="badge-stock">${escapeHtml(stockText)}</span>
                    ${hasDiscount ? '<span class="badge-promo">Скидка</span>' : ''}
                    ${car.salon && car.salon !== 'Не указан' ? `<span class="badge-salon">${escapeHtml(car.salon)}</span>` : ''}
                </div>
                ${hasCarousel ? `
                    <button class="carousel-button prev" aria-label="Предыдущее">&#10094;</button>
                    <button class="carousel-button next" aria-label="Следующее">&#10095;</button>
                ` : ''}
            </div>
            <div class="card-body card-content">
                <h3 class="card-name card-title">${escapeHtml(car.mark_id)}</h3>
                <div class="card-tags card-specs">
                    ${car.year ? `<span class="ctag spec-value">${escapeHtml(car.year)} год</span>` : ''}
                    ${car.run ? `<span class="ctag spec-value">${formatNum(car.run)} км</span>` : ''}
                    ${car.gearbox ? `<span class="ctag spec-value">${escapeHtml(car.gearbox)}</span>` : ''}
                    ${car.drive ? `<span class="ctag spec-value">${escapeHtml(car.drive)}</span>` : ''}
                    ${car.engine_type ? `<span class="ctag spec-value">${escapeHtml(car.engine_type)}</span>` : ''}
                </div>
                <div class="card-pricing card-price">
                    <span class="price-main price-new">${basePrice ? formatNum(basePrice) + ' ₽' : 'Цена по запросу'}</span>
                    ${hasDiscount ? `<span class="price-old">${formatNum(car.price)} ₽</span>` : ''}
                </div>
                <div class="card-btns card-buttons">
                    <a href="#popup:model" class="card-btn btn-outline" data-car-id="${escapeHtml(car.id || '')}" data-car-title="${escapeHtml(car.mark_id || '')}" data-car-price="${escapeHtml(basePrice || '')}" data-car-salon="${escapeHtml(car.salon || '')}">Оставить заявку</a>
                    <a href="#popup:report" class="card-btn-report btn-yellow" data-car-id="${escapeHtml(car.id || '')}" data-car-title="${escapeHtml(car.mark_id || '')}" data-car-price="${escapeHtml(basePrice || '')}" data-car-salon="${escapeHtml(car.salon || '')}">
                        ${leaseMonth ? 'от ' + leaseMonth + ' ₽/мес *' : 'Рассчитать крдит'}
                    </a>
                </div>
            </div>
        `;
        $wrapper.html(html);
        $wrapper.data('car', car);
        $wrapper.find('.card-btn, .card-btn-report').each(function() {
            setLeadButtonDataset(this, car);
        });
        $wrapper.on('click', '.card-btn, .card-btn-report', function() {
            setCurrentLeadCar(car, getPopupHookFromTrigger(this));
        });
        $wrapper.on('click', function(e) {
            if (!$(e.target).closest('.card-btn, .carousel-button, .card-btn-report, .btn-outline, .btn-yellow').length) {
                e.preventDefault(); e.stopPropagation();
                if (window.carDetailModal) window.carDetailModal.open(car);
            }
        });

        if (hasCarousel) {
            let idx = 0;
            const $img = $wrapper.find('img');
            const $prevBtn = $wrapper.find('.carousel-button.prev');
            const $nextBtn = $wrapper.find('.carousel-button.next');
            function changeImage(newIdx) {
                if (newIdx === idx) return;
                idx = newIdx;
                $img.attr('data-src', car.images[idx]);
                if ($img.hasClass('loaded')) $img.attr('src', car.images[idx]);
            }
            $prevBtn.on('click', function(e) { e.stopPropagation(); changeImage((idx - 1 + car.images.length) % car.images.length); });
            $nextBtn.on('click', function(e) { e.stopPropagation(); changeImage((idx + 1) % car.images.length); });
        }
        return $wrapper;
    }

    function renderCards(list) {
        debugLog('renderCards.input', { count: Array.isArray(list) ? list.length : null, list: list });
        const $container = $('#cards-grid').empty();
        if (!$container.length) return;
        if (!list.length) {
            $container.html(`<div class="no-results"><div class="no-results-icon">🔍</div><div>Ничего не найдено</div></div>`);
            return;
        }
        const fragment = document.createDocumentFragment();
        list.forEach(car => fragment.appendChild(createCardElement(car)[0]));
        $container[0].appendChild(fragment);
        if (!window.imageLazyLoader) window.imageLazyLoader = new ImageLazyLoader();
        window.imageLazyLoader.observe($container[0]);
    }

    function renderRandomCards(list) {
        debugLog('renderRandomCards.input', { count: Array.isArray(list) ? list.length : null, list: list });
        if (!randomCatalogGridEl) return;
        const $container = $(randomCatalogGridEl).empty();
        if (!list.length) {
            $container.html(`<div class="no-results"><div class="no-results-icon">🔍</div><div>Автомобили не найдены</div></div>`);
            return;
        }
        const fragment = document.createDocumentFragment();
        list.forEach(car => fragment.appendChild(createCardElement(car)[0]));
        randomCatalogGridEl.appendChild(fragment);
        if (!window.imageLazyLoader) window.imageLazyLoader = new ImageLazyLoader();
        window.imageLazyLoader.observe(randomCatalogGridEl);
    }

    /* ========== FILTERS ========== */
    function normalizeWheel(value) {
        if (!value) return null;
        const v = String(value).toLowerCase();
        if (v.indexOf('лев') === 0 || v.indexOf('left') === 0) return 'left';
        if (v.indexOf('прав') === 0 || v.indexOf('right') === 0) return 'right';
        return null;
    }

    function applyFilters() {
        const s = $('#search').val();
        const drive = $('#filter-drive').val();
        const gearbox = $('#filter-gearbox').val();
        const color = $('#filter-color').val();
        const bodyType = $('#filter-body').val();
        const engineType = $('#filter-engine').val();
        const sortBy = $('#sort-select').val();
        const selectedModels = window.modelMultiSelect ? window.modelMultiSelect.getSelectedValues() : [];
        const selectedSalons = window.salonMultiSelect ? window.salonMultiSelect.getSelectedValues() : [];

        const yearMinVal = $('#year-min-input').val();
        const yearMaxVal = $('#year-max-input').val();
        const yearMin = yearMinVal ? parseInt(yearMinVal, 10) : null;
        const yearMax = yearMaxVal ? parseInt(yearMaxVal, 10) : null;

        let wheelVal = 'all';
        const $wheelBtn = $('#filter-wheel .toggle-opt.is-active');
        if ($wheelBtn.length) wheelVal = $wheelBtn.data('wheel') || 'all';

        const pRange = window.get_price_range ? window.get_price_range() : { low:0, high:999999999 };
        const rRange = window.get_run_range ? window.get_run_range() : { low:0, high:999999999 };
        const searchTerm = (s || '').trim().toLowerCase();

        debugLog('applyFilters.criteria', {
            searchTerm: searchTerm,
            drive: drive,
            gearbox: gearbox,
            color: color,
            bodyType: bodyType,
            engineType: engineType,
            sortBy: sortBy,
            selectedModels: selectedModels,
            selectedSalons: selectedSalons,
            yearMin: yearMin,
            yearMax: yearMax,
            wheelVal: wheelVal,
            priceRange: pRange,
            runRange: rRange,
            carsCount: cars.length
        });

        filteredCars = cars.filter(car => {
            const bySearch = !searchTerm || (car.mark_id && car.mark_id.toLowerCase().includes(searchTerm));
            const byDrive = !drive || car.drive === drive;
            const byGear = !gearbox || car.gearbox === gearbox;
            const byColor = !color || car.color === color;
            const byBody = !bodyType || car.body_type === bodyType;
            const byEngine = !engineType || car.engine_type === engineType;
            const byYear = car.year === null ||
                (!yearMin || parseInt(car.year, 10) >= yearMin) &&
                (!yearMax || parseInt(car.year, 10) <= yearMax);
            const byPrice = car.price === null || (car.price >= pRange.low && car.price <= pRange.high);
            const byRun = car.run === null || (car.run >= rRange.low && car.run <= rRange.high);
            const byModel = selectedModels.length === 0 || selectedModels.includes(car.original_mark_id);
            const bySalon = selectedSalons.length === 0 || selectedSalons.includes(car.salon);
            const byWheel = wheelVal === 'all' || normalizeWheel(car.wheel) === wheelVal;
            return bySearch && byYear && byDrive && byGear && byColor && byBody && byEngine && byPrice && byRun && byModel && bySalon && byWheel;
        });

        debugLog('applyFilters.resultBeforeSort', { count: filteredCars.length });
        debugTable('applyFilters.filteredCarsBeforeSort', filteredCars);

        switch(sortBy) {
            case 'price-asc': filteredCars.sort((a,b) => (a.price||0) - (b.price||0)); break;
            case 'price-desc': filteredCars.sort((a,b) => (b.price||0) - (a.price||0)); break;
            default: filteredCars.sort((a,b) => String(a.id).localeCompare(String(b.id)));
        }

        debugLog('applyFilters.resultAfterSort', { count: filteredCars.length, sortBy: sortBy });
        debugTable('applyFilters.filteredCarsAfterSort', filteredCars);

        if (window.paginationInstance) {
            window.paginationInstance.setData(filteredCars);
            renderCards(window.paginationInstance.getCurrentPageData());
        } else {
            renderCards(filteredCars);
        }
    }

    function initPagination() {
        window.paginationInstance = new Pagination('pagination-container', 'pagination', 'results-count');
        window.paginationInstance.onPageChange = function(pageData, page) {
            renderCards(pageData);
        };
        $('#page-size').on('change', function() {
            const newSize = parseInt($(this).val());
            window.paginationInstance.setPageSize(newSize);
            renderCards(window.paginationInstance.getCurrentPageData());
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    function populateSelect(id, key) {
        const $sel = $('#' + id);
        if (!$sel.length) return;
        const firstOpt = $sel.find('option').first().clone();
        $sel.empty().append(firstOpt);
        getUnique(key).forEach(v => $sel.append(`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`));
    }

    function initFilters() {
        if (!cars.length) return;
        populateSelect('filter-drive', 'drive');
        populateSelect('filter-gearbox', 'gearbox');
        populateSelect('filter-color', 'color');
        populateSelect('filter-body', 'body_type');
        populateSelect('filter-engine', 'engine_type');

        if (!window.modelMultiSelect) window.modelMultiSelect = new MultiSelect($('#model-multiselect'), 'Любая марка');
        window.modelMultiSelect.setOptions(getUnique('original_mark_id'));

        if (!window.salonMultiSelect) window.salonMultiSelect = new MultiSelect($('#salon-multiselect'), 'Все салоны');
        window.salonMultiSelect.setOptions(getUnique('salon'));

        $('#search').off('input change').on('input change', debounce(applyFilters, 400));
        $('#filter-drive, #filter-gearbox, #filter-color, #filter-body, #filter-engine, #sort-select')
            .off('change').on('change', debounce(applyFilters, 400));
        $('#year-min-input, #year-max-input')
            .off('input change').on('input change', debounce(applyFilters, 400));
        $('#filter-wheel').off('click', '.toggle-opt').on('click', '.toggle-opt', function() {
            $(this).siblings('.toggle-opt').removeClass('is-active');
            $(this).addClass('is-active');
            applyFilters();
        });
    }

    /* ========== MOBILE DRAWER ========== */
    function initMobileDrawer() {
        const $body = $('#mob-drawer-body').empty();
        if (!$body.length) return;

        const fields = [
            'price-min-input', 'price-max-input', 'run-min-input', 'run-max-input',
            'year-min-input', 'year-max-input', 'filter-drive', 'filter-gearbox',
            'filter-color', 'filter-body', 'filter-engine', 'sort-select'
        ];

        $body.html(`
            <div class="filter-group">
                <label class="filter-label">Автосалон</label>
                <div class="multiselect" id="salon-multiselect-m">
                    <div class="multiselect-trigger" id="salon-trigger-m">
                        <div class="multiselect-selected" id="salon-selected-m">
                            <span class="multiselect-placeholder">Все салоны</span>
                        </div>
                        <svg class="multiselect-arrow" viewBox="0 0 10 7" fill="none">
                            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="multiselect-dropdown hidden" id="salon-dropdown-m"></div>
                </div>
            </div>
            <div class="filter-group">
                <label class="filter-label">Марка</label>
                <div class="multiselect" id="model-multiselect-m">
                    <div class="multiselect-trigger" id="model-trigger-m">
                        <div class="multiselect-selected" id="model-selected-m">
                            <span class="multiselect-placeholder">Любая марка</span>
                        </div>
                        <svg class="multiselect-arrow" viewBox="0 0 10 7" fill="none">
                            <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <div class="multiselect-dropdown hidden" id="model-dropdown-m"></div>
                </div>
            </div>
            ${fields.map(id => mobileFieldMarkup(id)).join('')}
            <div class="filter-group">
                <label class="filter-label">Руль</label>
                <div class="toggle-row" id="filter-wheel-m">
                    <button type="button" class="toggle-opt is-active" data-wheel="all">Все</button>
                    <button type="button" class="toggle-opt" data-wheel="left">Левый</button>
                    <button type="button" class="toggle-opt" data-wheel="right">Правый</button>
                </div>
            </div>
            <button class="btn-apply" id="apply-filters-m" type="button">Показать результаты</button>
        `);

        fields.forEach(id => {
            const $src = $('#' + id);
            const $dst = $('#' + id + '-m');
            if (!$src.length || !$dst.length) return;

            // ВАЖНО: мобильный <select> создается пустым,
            // а опции копируются сюда ровно один раз.
            // Раньше options уже были в mobileFieldMarkup() и затем клонировались повторно,
            // из-за этого значения фильтров на мобильной версии дублировались.
            if ($src.is('select')) {
                $dst.empty();
                $src.find('option').each(function() {
                    $dst.append($(this).clone());
                });
            }

            $dst.val($src.val());
        });

        if (!window.salonMultiSelectM) {
            window.salonMultiSelectM = new MultiSelect($('#salon-multiselect-m'), 'Все салоны');
            if (window.salonMultiSelect) {
                window.salonMultiSelect.selectedValues.forEach(v => window.salonMultiSelectM.selectedValues.add(v));
            }
            window.salonMultiSelectM.setOptions(getUnique('salon'));
            window.salonMultiSelectM.renderSelected();
        }

        if (!window.modelMultiSelectM) {
            window.modelMultiSelectM = new MultiSelect($('#model-multiselect-m'), 'Любая марка');
            if (window.modelMultiSelect) {
                window.modelMultiSelect.selectedValues.forEach(v => window.modelMultiSelectM.selectedValues.add(v));
            }
            window.modelMultiSelectM.setOptions(getUnique('original_mark_id'));
            window.modelMultiSelectM.renderSelected();
        }

        const debouncedApply = debounce(applyFilters, 400);
        fields.forEach(id => {
            $('#' + id + '-m').on('input change', function() {
                $('#' + id).val($(this).val());
                debouncedApply();
            });
        });

        $('#filter-wheel-m').on('click', '.toggle-opt', function() {
            $(this).siblings('.toggle-opt').removeClass('is-active');
            $(this).addClass('is-active');
            const w = $(this).data('wheel') || 'all';
            $('#filter-wheel .toggle-opt').removeClass('is-active');
            $('#filter-wheel .toggle-opt[data-wheel="' + w + '"]').addClass('is-active');
            applyFilters();
        });

        $('#apply-filters-m').on('click', function() { applyFilters(); closeMobileFilters(); });

        $('#salon-multiselect-m').on('click', '.multiselect-option, .multiselect-tag-remove', function() {
            setTimeout(() => {
                window.salonMultiSelect.selectedValues = new Set(window.salonMultiSelectM.selectedValues);
                window.salonMultiSelect.renderSelected();
                window.salonMultiSelect.renderDropdown();
                applyFilters();
            }, 0);
        });

        $('#model-multiselect-m').on('click', '.multiselect-option, .multiselect-tag-remove', function() {
            setTimeout(() => {
                window.modelMultiSelect.selectedValues = new Set(window.modelMultiSelectM.selectedValues);
                window.modelMultiSelect.renderSelected();
                window.modelMultiSelect.renderDropdown();
                applyFilters();
            }, 0);
        });
    }

    function mobileFieldMarkup(id) {
        const labels = {
            'price-min-input': ['Стоимость, ₽', 'От', true], 'price-max-input': ['', 'До', true],
            'run-min-input': ['Пробег, км', 'От', true], 'run-max-input': ['', 'До', true],
            'year-min-input': ['Год выпуска', 'От', true], 'year-max-input': ['', 'До', true],
            'filter-drive': ['Тип привода', null, false], 'filter-gearbox': ['Коробка передач', null, false],
            'filter-color': ['Цвет кузова', null, false], 'filter-body': ['Тип кузова', null, false],
            'filter-engine': ['Тип двигателя', null, false], 'sort-select': ['Сортировка', null, false]
        };
        const [label, ph, isInput] = labels[id] || ['', '', false];
        if (id === 'price-max-input' || id === 'run-max-input' || id === 'year-max-input') return '';
        if (isInput) {
            const secondId = id.replace('min', 'max');
            return `<div class="filter-group"><label class="filter-label">${label}</label>
                <div class="range-row">
                    <input type="number" class="f-input" id="${id}-m" placeholder="От">
                    <input type="number" class="f-input" id="${secondId}-m" placeholder="До">
                </div></div>`;
        }
        return `<div class="filter-group"><label class="filter-label">${label}</label>
            <select class="f-select" id="${id}-m"></select></div>`;
    }

    /* ========== DEBUG WRAPPERS / PUBLIC DEBUG API ========== */
    function installDebugWrappers() {
        if (!DEBUG) return;

        const wrappers = {
            openCacheDB: 'openCacheDB',
            getCachedFeed: 'getCachedFeed',
            setCachedFeed: 'setCachedFeed',
            getUnique: 'getUnique',
            formatNum: 'formatNum',
            escapeHtml: 'escapeHtml',
            filterImages: 'filterImages',
            transformJsonToCar: 'transformJsonToCar',
            loadCarsData: 'loadCarsData',
            extractCarsList: 'extractCarsList',
            initAllAfterLoad: 'initAllAfterLoad',
            showError: 'showError',
            showSkeletonCards: 'showSkeletonCards',
            initRangeSlider: 'initRangeSlider',
            createCardElement: 'createCardElement',
            renderCards: 'renderCards',
            normalizeWheel: 'normalizeWheel',
            applyFilters: 'applyFilters',
            initPagination: 'initPagination',
            debounce: 'debounce',
            populateSelect: 'populateSelect',
            initFilters: 'initFilters',
            initMobileDrawer: 'initMobileDrawer',
            mobileFieldMarkup: 'mobileFieldMarkup',
            closeMobileFilters: 'closeMobileFilters',
            openMobileFilters: 'openMobileFilters',
            resetSlider: 'resetSlider'
        };

        try {
            openCacheDB = debugWrap(openCacheDB, wrappers.openCacheDB);
            getCachedFeed = debugWrap(getCachedFeed, wrappers.getCachedFeed);
            setCachedFeed = debugWrap(setCachedFeed, wrappers.setCachedFeed);
            getUnique = debugWrap(getUnique, wrappers.getUnique);
            formatNum = debugWrap(formatNum, wrappers.formatNum);
            escapeHtml = debugWrap(escapeHtml, wrappers.escapeHtml, { verboseOnly: true });
            filterImages = debugWrap(filterImages, wrappers.filterImages);
            transformJsonToCar = debugWrap(transformJsonToCar, wrappers.transformJsonToCar);
            loadCarsData = debugWrap(loadCarsData, wrappers.loadCarsData);
            extractCarsList = debugWrap(extractCarsList, wrappers.extractCarsList);
            initAllAfterLoad = debugWrap(initAllAfterLoad, wrappers.initAllAfterLoad);
            showError = debugWrap(showError, wrappers.showError);
            showSkeletonCards = debugWrap(showSkeletonCards, wrappers.showSkeletonCards);
            initRangeSlider = debugWrap(initRangeSlider, wrappers.initRangeSlider);
            createCardElement = debugWrap(createCardElement, wrappers.createCardElement);
            renderCards = debugWrap(renderCards, wrappers.renderCards);
            normalizeWheel = debugWrap(normalizeWheel, wrappers.normalizeWheel, { verboseOnly: true });
            applyFilters = debugWrap(applyFilters, wrappers.applyFilters);
            initPagination = debugWrap(initPagination, wrappers.initPagination);
            debounce = debugWrap(debounce, wrappers.debounce);
            populateSelect = debugWrap(populateSelect, wrappers.populateSelect);
            initFilters = debugWrap(initFilters, wrappers.initFilters);
            initMobileDrawer = debugWrap(initMobileDrawer, wrappers.initMobileDrawer);
            mobileFieldMarkup = debugWrap(mobileFieldMarkup, wrappers.mobileFieldMarkup);
            debugLog('installDebugWrappers', 'Функции обернуты', Object.keys(wrappers));
        } catch(e) {
            debugError('installDebugWrappers', 'Не удалось обернуть часть функций', e);
        }
    }

    function exposeDebugApi() {
        window.udmCatalogDebug = {
            dump: function(label = 'manual-dump') {
                debugSnapshot(label, {
                    forms: Array.from(document.forms || []).map(f => ({
                        id: f.id,
                        name: f.name,
                        action: f.action,
                        method: f.method,
                        classes: f.className
                    })),
                    dom: {
                        cardsGrid: !!document.getElementById('cards-grid'),
                        cardsContainer: !!document.getElementById('cards-container'),
                        modal: !!document.getElementById('car-detail-modal'),
                        pagination: !!document.getElementById('pagination'),
                        resultsCount: !!document.getElementById('results-count')
                    }
                });
                return {
                    cars: cars,
                    filteredCars: filteredCars,
                    pagination: window.paginationInstance || null,
                    modal: window.carDetailModal || null,
                    urlManager: window.urlManager || null,
                    DEBUG: DEBUG,
                    DEBUG_VERBOSE_EVENTS: DEBUG_VERBOSE_EVENTS,
                    catalogMeta: catalogMeta,
                    catalogUpdatedAt: catalogUpdatedAt,
                    catalogUpdatedText: catalogUpdatedText
                };
            },
            getCars: function() { return cars; },
            getFilteredCars: function() { return filteredCars; },
            getCatalogMeta: function() { return { meta: catalogMeta, updated_at: catalogUpdatedAt, updated_text: catalogUpdatedText }; },
            rerenderRandom: function(count = randomCatalogLimit) { if (!hasRandomCatalog) return []; const randomCars = getRandomCars(cars, count); renderRandomCards(randomCars); return randomCars; },
            reload: function() { return loadCarsData(); },
            applyFilters: function() { return applyFilters(); },
            clearCache: async function() {
                debugLog('udmCatalogDebug.clearCache', 'Очистка IndexedDB кэша');
                const db = await openCacheDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(DB_STORE, 'readwrite');
                    const req = tx.objectStore(DB_STORE).delete('current');
                    req.onsuccess = () => { debugLog('udmCatalogDebug.clearCache', 'Кэш очищен'); resolve(true); };
                    req.onerror = () => { debugError('udmCatalogDebug.clearCache', 'Ошибка очистки кэша', req.error); reject(req.error); };
                });
            }
        };

        debugLog('exposeDebugApi', 'Готово. Для ручного снимка состояния выполни в консоли: window.udmCatalogDebug.dump()');
    }

    /* ========== INIT ========== */
    installDebugWrappers();
    exposeDebugApi();
    loadCarsData();

    function closeMobileFilters() {
        debugLog('closeMobileFilters', 'Закрываем мобильный фильтр');
        $('#mob-overlay').removeClass('is-open');
        $('#mob-drawer').removeClass('is-open');
        document.body.style.overflow = '';
    }
    function openMobileFilters() {
        debugLog('openMobileFilters', 'Открываем мобильный фильтр');
        $('#mob-overlay').addClass('is-open');
        $('#mob-drawer').addClass('is-open');
        document.body.style.overflow = 'hidden';
    }

    function resetSlider(getRange) {
        if (getRange?.slider) {
            const s = getRange.slider;
            s.currentMin = s.min; s.currentMax = s.max;
            s.minInput.value = s.min; s.maxInput.value = s.max;
            s.updateSlider();
        }
    }

    $('#apply-filters').on('click', function() {
        const $b = $(this); const t = $b.text();
        applyFilters();
        $b.text('Применено!').addClass('applied');
        setTimeout(() => { $b.text(t).removeClass('applied'); closeMobileFilters(); }, 500);
    });

    $('#clear-filters').on('click', function() {
        debugLog('event.clear-filters.click', 'Клик по кнопке очистить фильтры', this);
        const $b = $(this); const t = $b.text();
        $('#search').val('');
        $('#filter-drive, #filter-gearbox, #filter-color, #filter-body, #filter-engine').val('');
        $('#year-min-input, #year-max-input').val('');
        $('#sort-select').val('default');
        $('#filter-wheel .toggle-opt').removeClass('is-active');
        $('#filter-wheel .toggle-opt[data-wheel="all"]').addClass('is-active');

        if (window.modelMultiSelect) {
            window.modelMultiSelect.selectedValues.clear();
            window.modelMultiSelect.renderSelected();
            window.modelMultiSelect.renderDropdown();
        }
        if (window.salonMultiSelect) {
            window.salonMultiSelect.selectedValues.clear();
            window.salonMultiSelect.renderSelected();
            window.salonMultiSelect.renderDropdown();
        }

        resetSlider(window.get_price_range);
        resetSlider(window.get_run_range);
        applyFilters();
        $b.text('Очищено!').addClass('cleared');
        setTimeout(() => { $b.text(t).removeClass('cleared'); closeMobileFilters(); }, 1500);
    });

    $('#mobile-filter-toggle').on('click', function() { debugLog('event.mobile-filter-toggle.click', 'Открытие мобильных фильтров'); openMobileFilters(); });
    $('#mob-close').on('click', function() { debugLog('event.mob-close.click', 'Закрытие мобильных фильтров'); closeMobileFilters(); });
    $('#mob-overlay').on('click', function() { debugLog('event.mob-overlay.click', 'Закрытие мобильных фильтров по overlay'); closeMobileFilters(); });
});

function generateSeoLinks(carsList) {
    if (window.__UDM_DEBUG_UTILS__?.DEBUG) window.__UDM_DEBUG_UTILS__.debugLog('generateSeoLinks', { count: Array.isArray(carsList) ? carsList.length : null, carsList: carsList });
    const container = document.getElementById('seo-links-container');
    if (!container) {
        if (window.__UDM_DEBUG_UTILS__?.DEBUG) window.__UDM_DEBUG_UTILS__.debugWarn('generateSeoLinks', 'Контейнер #seo-links-container не найден');
        return;
    }
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    container.innerHTML = carsList.map(car =>
        `<a href="?car=${esc(car.id)}">${esc(car.mark_id)} ${esc(car.year || '')} — ${car.price ? esc(car.price) + ' руб.' : ''}</a><br>`
    ).join('');
}
</script>