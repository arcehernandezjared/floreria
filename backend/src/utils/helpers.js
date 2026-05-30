function formatMoney(amount, symbol = '₡') {
  if (!amount && amount !== 0) return `${symbol}0`;
  return `${symbol}${Number(amount).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function paginationParams(queryObj) {
  const page = Math.max(1, parseInt(queryObj.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryObj.limit) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1
  };
}

function calcularMargen(precio, costo) {
  if (!precio || precio === 0) return 0;
  return parseFloat((((precio - costo) / precio) * 100).toFixed(2));
}

module.exports = { formatMoney, formatDate, paginationParams, paginationMeta, calcularMargen };
