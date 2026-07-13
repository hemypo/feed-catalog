/**
 * UDM CATALOG DEBUGGER (Standalone)
 * Инструмент для профилирования, логирования и отладки каталога.
 */
(function() {
    const DEBUG = true; 
    const DEBUG_VERBOSE_EVENTS = false; // Вывод каждого клика/свайпа
    const DEBUG_TABLE_LIMIT = 130;
    let debugCallCounter = 0;

    if (!DEBUG) return;

    function debugNow() {
        try { return new Date().toISOString(); }
        catch(e) { return String(Date.now()); }
    }

    function debugPrefix(scope) {
        return `[UDM-DEBUG][${debugNow()}]` + (scope ? `[${scope}]` : '');
    }

    function debugLog(scope, ...args) { console.log(debugPrefix(scope), ...args); }
    function debugInfo(scope, ...args) { console.info(debugPrefix(scope), ...args); }
    function debugWarn(scope, ...args) { console.warn(debugPrefix(scope), ...args); }
    function debugError(scope, ...args) { console.error(debugPrefix(scope), ...args); }

    function debugGroup(scope, ...args) {
        if (console.groupCollapsed) console.groupCollapsed(debugPrefix(scope), ...args);
        else debugLog(scope, ...args);
    }
    function debugGroupEnd() { if (console.groupEnd) console.groupEnd(); }

    function debugTable(scope, data) {
        try {
            if (Array.isArray(data)) console.table(data.slice(0, DEBUG_TABLE_LIMIT));
            else console.table(data);
            if (Array.isArray(data) && data.length > DEBUG_TABLE_LIMIT) {
                debugInfo(scope, `Показаны первые ${DEBUG_TABLE_LIMIT} строк из ${data.length}`);
            }
        } catch(e) { debugWarn(scope, 'console.table не сработал', e, data); }
    }

    function debugCheck(condition, scope, okMessage, failMessage, data) {
        if (condition) debugLog(scope, '✅ ' + okMessage, data || '');
        else debugWarn(scope, '⚠️ ' + failMessage, data || '');
        return condition;
    }

    function debugDuration(startTime) {
        try { return Math.round((performance.now() - startTime) * 100) / 100 + ' ms'; }
        catch(e) { return 'n/a'; }
    }

    // Обертка для профилирования функций (замер времени, аргументы, результат)
    function debugWrap(fn, name, options = {}) {
        if (typeof fn !== 'function' || fn.__debugWrapped) return fn;
        const wrapped = function(...args) {
            const callId = ++debugCallCounter;
            const start = performance.now ? performance.now() : Date.now();
            const skipGroup = options.verboseOnly && !DEBUG_VERBOSE_EVENTS;
            
            if (!skipGroup) debugGroup(`CALL #${callId} ${name}`, { args, thisValue: this });
            
            try {
                const result = fn.apply(this, args);
                if (result && typeof result.then === 'function') {
                    if (!skipGroup) { debugLog(name, 'Promise started', result); debugGroupEnd(); }
                    return result.then((resolved) => {
                        debugLog(`RESOLVE #${callId} ${name}`, { duration: debugDuration(start), result: resolved });
                        return resolved;
                    }).catch((err) => {
                        debugError(`REJECT #${callId} ${name}`, { duration: debugDuration(start), error: err });
                        throw err;
                    });
                }
                if (!skipGroup) { debugLog(name, 'RETURN', { duration: debugDuration(start), result }); debugGroupEnd(); }
                return result;
            } catch(err) {
                if (!skipGroup) debugGroupEnd();
                debugError(`THROW #${callId} ${name}`, { duration: debugDuration(start), error: err });
                throw err;
            }
        };
        wrapped.__debugWrapped = true;
        wrapped.__originalFn = fn;
        return wrapped;
    }

    // Обертка для всех методов класса
    function debugWrapPrototype(proto, className, verboseMethods = []) {
        Object.getOwnPropertyNames(proto).forEach((methodName) => {
            if (methodName === 'constructor') return;
            const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
            if (!descriptor || typeof descriptor.value !== 'function') return;
            proto[methodName] = debugWrap(descriptor.value, `${className}.${methodName}`, { 
                verboseOnly: verboseMethods.includes(methodName) 
            });
        });
        debugLog('debugWrapPrototype', `Методы класса ${className} обернуты в логирование`);
    }

    // Экспортируем глобальный API для утилит
    window.__UDM_DEBUG_UTILS__ = {
        DEBUG, debugLog, debugInfo, debugWarn, debugError, 
        debugCheck, debugTable, debugWrap, debugWrapPrototype
    };
})();