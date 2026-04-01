/**
 * Функция для расчета выручки
 * @param purchase запись о покупке
 * @param _product карточка товара
 * @returns {number}
 */
function calculateSimpleRevenue(purchase, _product) {
   //  Расчет выручки от операции
   const discountFactor = 1 - (purchase.discount / 100);
   return purchase.sale_price * purchase.quantity * discountFactor;
}

/**
 * Функция для расчета бонусов
 * @param index порядковый номер в отсортированном массиве
 * @param total общее число продавцов
 * @param seller карточка продавца
 * @returns {number}
 */
function calculateBonusByProfit(index, total, seller) {
    // Расчет бонуса от позиции в рейтинге
    let percent = 5; // по умолчанию
    if (index === 0) percent = 15;
    else if (index === 1 || index === 2) percent = 10;
    else if (index === total - 1) percent = 0;
    return seller.profit * percent / 100;
}

// Вспомогательная функция для формирования статистики
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

// Вспомогательная функция для индексации
function createIndexes(sellerStats, products) {
    const sellerIndex = Object.fromEntries(sellerStats.map(stat => [stat.id, stat]));
    const productIndex = Object.fromEntries(products.map(product => [product.sku, product]));
    return { sellerIndex, productIndex };
}

// Функция для расчета выручки и прибыли для каждого продавца
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
 * Функция для анализа данных продаж
 * @param data
 * @param options
 * @returns {{revenue, top_products, bonus, name, sales_count, profit, seller_id}[]}
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
    });

    // Формирование топ-10 товаров
    sellerStats.forEach(seller => {
        seller.top_products = Object.entries(seller.products_sold)
            .map(([sku, quantity]) => ({ sku, quantity }))
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 10);
    });

    // Итоговый отчёт
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
