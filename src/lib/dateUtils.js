import {
  format,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
  subYears,
  isSameDay,
} from 'date-fns';

const KST_OFFSET_MINUTES = 9 * 60;

export const toKstDate = (date) => {
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  return new Date(utc + KST_OFFSET_MINUTES * 60000);
};

export const toISODate = (date) => format(toKstDate(date), 'yyyy-MM-dd');

export const getWeekOfMonth = (date) => {
  const firstDay = startOfMonth(date);
  const offset = firstDay.getDay(); // 0 (Sun) - 6 (Sat)
  return Math.ceil((date.getDate() + offset) / 7);
};

export const findSameWeekdayInLastYear = (date) => {
  const lastYearDate = subYears(date, 1);
  const targetMonth = lastYearDate.getMonth();
  const targetYear = lastYearDate.getFullYear();
  const targetWeek = getWeekOfMonth(date);
  const targetWeekday = date.getDay();

  const cursor = new Date(targetYear, targetMonth, 1);
  while (cursor.getMonth() === targetMonth) {
    if (
      cursor.getDay() === targetWeekday &&
      getWeekOfMonth(cursor) === targetWeek
    ) {
      return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
};

export const findSameWeekdayInLastMonth = (date) => {
  const lastMonthDate = subMonths(date, 1);
  const targetMonth = lastMonthDate.getMonth();
  const targetYear = lastMonthDate.getFullYear();
  const targetWeek = getWeekOfMonth(date);
  const targetWeekday = date.getDay();

  const cursor = new Date(targetYear, targetMonth, 1);
  while (cursor.getMonth() === targetMonth) {
    if (
      cursor.getDay() === targetWeekday &&
      getWeekOfMonth(cursor) === targetWeek
    ) {
      return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
};

export const getYesterday = (date) => subDays(date, 1);
export const getLastWeekSameDay = (date) => subWeeks(date, 1);

export const parseKstDate = (isoDate) =>
  new Date(`${isoDate}T00:00:00+09:00`);

export const isSameISODate = (date, isoDate) =>
  isSameDay(date, parseKstDate(isoDate));
