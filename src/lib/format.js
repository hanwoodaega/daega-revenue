export const formatCurrency = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  return new Intl.NumberFormat('ko-KR').format(Number(value));
};

export const formatDelta = (value) => {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
};
