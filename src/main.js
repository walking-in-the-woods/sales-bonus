/**
 * Процент бонуса для различных мест в рейтинге.
 * @constant
 */
const BONUS_PERCENT = {
    FIRST: 15,
    SECOND_THIRD: 10,
    OTHER: 5,
    LAST: 0
};

/**
 * Количество товаров в топе.
 * @constant
 */
const TOP_PRODUCTS_LIMIT = 10;

/**
 * Функция для расчета выручки.
 * @param {Object} purchase - Запись о покупке (item из чека).
 * @param {Object} _product - Карточка товара (не используется).
 * @returns {number} Выручка в рублях.
 */
function calculateSimpleRevenue(purchase, _product) {
   //  Расчет выручки от операции
   const discountFactor = 1 - (purchase.discount / 100);
   return purchase.sale_price * purchase.quantity * discountFactor;
}

/**
 * Функция для расчета бонусов.
 * @param {number} index - Позиция продавца в рейтинге (0-based).
 * @param {number} total - Общее количество продавцов.
 * @param {Object} seller - Объект статистики продавца.
 * @returns {number} Сумма бонуса.
 */
function calculateBonusByProfit(index, total, seller) {
    // Расчет бонуса от позиции в рейтинге
    let percent = BONUS_PERCENT.OTHER;
    if (index === 0) percent = BONUS_PERCENT.FIRST;
    else if (index === 1 || index === 2) percent = BONUS_PERCENT.SECOND_THIRD;
    else if (index === total - 1) percent = BONUS_PERCENT.LAST;
    return seller.profit * percent / 100;
}

/**
 * Создаёт начальную статистику для каждого продавца.
 * @param {Array} sellers - Массив продавцов.
 * @returns {Array} Массив объектов статистики.
 */
function createSellerStats(sellers) {
    return sellers.map(seller => ({
        id: seller.id,
        name: `${seller.first_name} ${seller.last_name}`,
        revenue: 0,
        profit: 0,
        sales_count: 0,
        products_sold: {}
    }));
}

/**
 * Создаёт индексы для быстрого доступа к продавцам и товарам.
 * @param {Array} sellerStats - Статистика продавцов.
 * @param {Array} products - Массив товаров.
 * @returns {Object} Объект с индексами { sellerIndex, productIndex }.
 */
function createIndexes(sellerStats, products) {
    const sellerIndex = Object.fromEntries(sellerStats.map(stat => [stat.id, stat]));
    const productIndex = Object.fromEntries(products.map(product => [product.sku, product]));
    return { sellerIndex, productIndex };
}

/**
 * Обрабатывает записи о покупках, накапливая статистику.
 * @param {Array} records - Массив чеков.
 * @param {Object} sellerIndex - Индекс продавцов.
 * @param {Object} productIndex - Индекс товаров.
 * @param {Function} calculateRevenue - Функция расчёта выручки.
 */
function processPurchaseRecords(records, sellerIndex, productIndex, calculateRevenue) {
    records.forEach(record => {
        const seller = sellerIndex[record.seller_id];
        if (!seller) return;

        seller.sales_count += 1;
        seller.revenue += record.total_amount;

        record.items.forEach(item => {
            const product = productIndex[item.sku];
            if (!product) return;

            const cost = product.purchase_price * item.quantity;
            const revenue = calculateRevenue(item, product);
            const profit = revenue - cost;

            seller.profit += profit;

            if (!seller.products_sold[item.sku]) {
                seller.products_sold[item.sku] = 0;
            }
            seller.products_sold[item.sku] += item.quantity;
        });
    });
}

/**
 * Формирует топ-N товаров из объекта проданных товаров.
 * @param {Object} productsSold - Объект { sku: quantity }.
 * @param {number} limit - Количество элементов в топе.
 * @returns {Array} Массив объектов { sku, quantity }.
 */
function buildTopProducts(productsSold, limit) {
    return Object.entries(productsSold)
        .map(([sku, quantity]) => ({ sku, quantity }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, limit);
}

/**
 * Форматирует статистику продавцов в итоговый отчёт.
 * @param {Array} sellerStats - Статистика продавцов.
 * @returns {Array} Массив объектов отчёта.
 */
function formatReport(sellerStats) {
    return sellerStats.map(seller => ({
        seller_id: seller.id,
        name: seller.name,
        revenue: +seller.revenue.toFixed(2),
        profit: +seller.profit.toFixed(2),
        sales_count: seller.sales_count,
        top_products: seller.top_products,
        bonus: +seller.bonus.toFixed(2)
    }));
}

/**
 * Главная функция анализа данных.
 * @param {Object} data - Исходные данные.
 * @param {Object} options - Опции с функциями calculateRevenue и calculateBonus.
 * @returns {Array} Отчёт по продавцам.
 */
function analyzeSalesData(data, options) {
    // Проверка входных данных
    if (!data ||
        !Array.isArray(data.sellers) || data.sellers.length === 0 ||
        !Array.isArray(data.products) || data.products.length === 0 ||
        !Array.isArray(data.purchase_records) || data.purchase_records.length === 0) {
        throw new Error('Некорректные входные данные');
    }

    // Проверка наличия опций
    if (!options || typeof options !== 'object') {
        throw new Error('Отсутствуют опции');
    }
    const { calculateRevenue, calculateBonus } = options;
    if (typeof calculateRevenue !== 'function' || typeof calculateBonus !== 'function') {
        throw new Error('Не переданы функции для расчётов');
    }

    // Подготовка промежуточных данных для сбора статистики
    const sellerStats = createSellerStats(data.sellers);
    // Индексация продавцов и товаров для быстрого доступа
    const { sellerIndex, productIndex } = createIndexes(sellerStats, data.products);

    // Расчет выручки и прибыли для каждого продавца
    processPurchaseRecords(data.purchase_records, sellerIndex, productIndex, calculateRevenue);

    // Сортировка продавцов по прибыли
    sellerStats.sort((a, b) => b.profit - a.profit);

    // Назначение премий на основе ранжирования
    const total = sellerStats.length;
    sellerStats.forEach((seller, index) => {
        seller.bonus = calculateBonus(index, total, seller);
        seller.top_products = buildTopProducts(seller.products_sold, TOP_PRODUCTS_LIMIT);
    });

    // Итоговый отчёт
    return formatReport(sellerStats);
}
