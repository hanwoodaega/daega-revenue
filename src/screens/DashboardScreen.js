import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  format,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
  subYears,
  addDays,
  addMonths,
  eachDayOfInterval,
  differenceInCalendarDays,
} from 'date-fns';
import { supabase } from '../lib/supabase';
import {
  findSameWeekdayInLastMonth,
  findSameWeekdayInLastYear,
  parseKstDate,
  toISODate,
} from '../lib/dateUtils';
import { formatCurrency } from '../lib/format';
import BranchPicker from '../components/BranchPicker';
import AdminPanel from '../components/AdminPanel';
import { BarChartSimple, LineChartSimple } from '../components/Charts';
import DateTimePicker from '@react-native-community/datetimepicker';

const adminMenus = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'branches', label: '지점별 분석' },
  { key: 'branch-sales', label: '지점별 매출' },
  { key: 'accounts', label: '계정 관리' },
];

const getTrendSymbol = (delta) => {
  if (delta == null) return '→';
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '→';
};

export default function DashboardScreen({ session, profile, branches }) {
  const [selectedBranchId, setSelectedBranchId] = useState(
    profile?.branch_id || branches?.[0]?.id || null,
  );
  const [activeTab, setActiveTab] = useState('home');
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [entryLoading, setEntryLoading] = useState(false);
  const [todayTotal, setTodayTotal] = useState(null);
  const [lastWeekTotal, setLastWeekTotal] = useState(null);
  const [branchTotals, setBranchTotals] = useState([]);
  const [entryDaily, setEntryDaily] = useState('');
  const [isEditingEntry, setIsEditingEntry] = useState(true);
  const [monthCursor, setMonthCursor] = useState(startOfMonth(new Date()));
  const [monthlyEntries, setMonthlyEntries] = useState([]);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [editingAmount, setEditingAmount] = useState('');
  const [historyEditingDate, setHistoryEditingDate] = useState(null);
  const [historyEditingAmount, setHistoryEditingAmount] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [monthTotal, setMonthTotal] = useState(null);
  const [lastYearMonthTotal, setLastYearMonthTotal] = useState(null);
  const [recent14Days, setRecent14Days] = useState([]);
  const [weekdayTotals, setWeekdayTotals] = useState([]);
  const [homeMissingBranches, setHomeMissingBranches] = useState([]);
  const [homeComparePercent, setHomeComparePercent] = useState(null);
  const [homeBranchTotal, setHomeBranchTotal] = useState(null);
  const [adminMenu, setAdminMenu] = useState('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [branchAnalysisId, setBranchAnalysisId] = useState(
    branches?.[0]?.id || null,
  );
  const [branchAnalysisLoading, setBranchAnalysisLoading] = useState(false);
  const [branchAnalysisToday, setBranchAnalysisToday] = useState(null);
  const [branchAnalysisWeek, setBranchAnalysisWeek] = useState(null);
  const [branchAnalysisMonth, setBranchAnalysisMonth] = useState(null);
  const [branchAnalysisRecent14, setBranchAnalysisRecent14] = useState([]);
  const [branchAnalysisWeekdays, setBranchAnalysisWeekdays] = useState([]);
  const [branchAnalysisWeekdaysLast, setBranchAnalysisWeekdaysLast] = useState(
    [],
  );
  const [branchAnalysisComparePrev, setBranchAnalysisComparePrev] = useState([]);
  const [branchAnalysisCompareYear, setBranchAnalysisCompareYear] = useState([]);
  const [weekdayMode, setWeekdayMode] = useState('this');
  const [periodType, setPeriodType] = useState('week');
  const [periodSummary, setPeriodSummary] = useState({
    total: null,
    prev: null,
    lastMonth: null,
    lastYear: null,
  });
  const [monthlySeries, setMonthlySeries] = useState([]);
  const [monthlySeriesPrev, setMonthlySeriesPrev] = useState([]);
  const [salesMonthCursor, setSalesMonthCursor] = useState(
    startOfMonth(new Date()),
  );
  const [salesTableRows, setSalesTableRows] = useState([]);
  const [salesMonthlySummary, setSalesMonthlySummary] = useState({
    total: 0,
    byBranch: {},
    prevTotal: null,
  });
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesBranchFilter, setSalesBranchFilter] = useState('all');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [historyMonthPickerOpen, setHistoryMonthPickerOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const homeLoadingRef = useRef(false);
  const entryLoadingRef = useRef(false);
  const branchAnalysisRequestRef = useRef(0);
  const { width } = useWindowDimensions();
  const isWebCompact = Platform.OS === 'web' && width < 1280;
  const insets = useSafeAreaInsets();
  const contentPaddingBottom = 96 + insets.bottom;
  const bottomTabPaddingBottom = Math.max(10, insets.bottom);

  const isAdmin = profile?.role === 'admin';

  const branchName = useMemo(() => {
    const branch = branches?.find((item) => item.id === selectedBranchId);
    return branch?.name ?? '-';
  }, [branches, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId && branches?.length) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  useEffect(() => {
    if (!branchAnalysisId && branches?.length) {
      setBranchAnalysisId(branches[0].id);
    }
  }, [branches, branchAnalysisId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  const formatAmount = (value) => (value == null ? '-' : `${formatCurrency(value)}원`);
  const formatMillions = (value) => {
    if (value == null) return '-';
    return `${(value / 1000000).toFixed(1)}M`;
  };
  const formatTableValue = (value) =>
    Platform.OS === 'web' ? formatAmount(value) : formatMillions(value);
  const branchOrder = {
    '대가정육마트': 1,
    '카페 일공구공': 2,
    '한우대가 순천점': 3,
    '한우대가 광양점': 4,
  };
  const branchLabelMap = {
    '대가정육마트': '마트',
    '카페 일공구공': '카페',
    '한우대가 순천점': '순천점',
    '한우대가 광양점': '광양점',
  };
  const orderedBranches = useMemo(
    () =>
      [...branches].sort(
        (a, b) => (branchOrder[a.name] || 99) - (branchOrder[b.name] || 99),
      ),
    [branches],
  );
  const webTableCellStyle = Platform.OS === 'web' ? styles.tableCellFlex : null;
  const webDateCellStyle = Platform.OS === 'web' ? styles.tableDateCellFlex : null;
  const webTotalCellStyle = Platform.OS === 'web' ? styles.tableTotalCellFlex : null;
  const monthYears = useMemo(
    () => [0, 1, 2].map((offset) => new Date().getFullYear() - offset),
    [],
  );

  const getSelectedRange = () => {
    const today = new Date();
    if (periodType === 'today') {
      return { start: today, end: today };
    }
    if (periodType === 'week') {
      return {
        start: startOfWeek(today, { weekStartsOn: 1 }),
        end: endOfWeek(today, { weekStartsOn: 1 }),
      };
    }
    if (periodType === 'month') {
      return { start: startOfMonth(today), end: today };
    }
    return { start: startOfMonth(today), end: today };
  };


  const calcPercent = (current, previous) => {
    if (current == null || previous == null || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  };


  const fetchTotalsByDate = useCallback(async (date, branchIds) => {
    if (!branchIds?.length) return { total: null, byBranch: {} };
    const { data, error } = await supabase
      .from('sales_entries')
      .select('branch_id, amount')
      .in('branch_id', branchIds)
      .eq('entry_date', toISODate(date));

    if (error) {
      console.warn(error.message);
      return { total: null, byBranch: {} };
    }

    const totals = {};
    let sum = 0;
    data?.forEach((row) => {
      const value = Number(row.amount || 0);
      totals[row.branch_id] = (totals[row.branch_id] || 0) + value;
      sum += value;
    });
    return { total: data?.length ? sum : null, byBranch: totals };
  }, []);

  const fetchTotalsByRange = useCallback(async (start, end, branchIds) => {
    if (!branchIds?.length) return null;
    const { data, error } = await supabase
      .from('sales_entries')
      .select('amount')
      .in('branch_id', branchIds)
      .gte('entry_date', toISODate(start))
      .lte('entry_date', toISODate(end));

    if (error) {
      console.warn(error.message);
      return null;
    }

    if (!data?.length) return null;
    return data.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }, []);

  const loadHomeData = useCallback(async () => {
    if (homeLoadingRef.current) return;
    const branchIds = branches.map((branch) => branch.id);
    const chartBranchIds = isAdmin
      ? branchIds
      : selectedBranchId
        ? [selectedBranchId]
        : [];
    if (!branchIds.length || (!isAdmin && !selectedBranchId)) {
      setLoading(false);
      return;
    }

    homeLoadingRef.current = true;
    setLoading(true);
    try {
      const today = new Date();
      const lastWeek = subDays(today, 7);
      if (isAdmin) {
        const [
          { total, byBranch },
          { total: lastWeekSum, byBranch: lastWeekByBranch },
        ] = await Promise.all([
          fetchTotalsByDate(today, branchIds),
          fetchTotalsByDate(lastWeek, branchIds),
        ]);

        setTodayTotal(total);
        setLastWeekTotal(lastWeekSum);

        const missing = branches.filter((branch) => byBranch[branch.id] == null);
        const missingNames = missing.map((branch) => branch.name);
        setHomeMissingBranches(missingNames);
        if (missingNames.length === branches.length) {
          setTodayTotal(null);
        }

        if (selectedBranchId) {
          setHomeBranchTotal(byBranch[selectedBranchId] ?? null);
        } else {
          setHomeBranchTotal(null);
        }

        const lastWeekMissingAny = branches.some(
          (branch) => lastWeekByBranch[branch.id] == null,
        );
        if (lastWeekMissingAny || !branches.length) {
          setHomeComparePercent(null);
        } else {
          const reportedBranchIds = branches
            .filter((branch) => byBranch[branch.id] != null)
            .map((branch) => branch.id);
          if (!reportedBranchIds.length) {
            setHomeComparePercent(null);
          } else {
            const compareTodaySum = reportedBranchIds.reduce(
              (sum, id) => sum + Number(byBranch[id] || 0),
              0,
            );
            const compareLastWeekSum = reportedBranchIds.reduce(
              (sum, id) => sum + Number(lastWeekByBranch[id] || 0),
              0,
            );
            if (compareLastWeekSum === 0) {
              setHomeComparePercent(null);
            } else {
              setHomeComparePercent(
                ((compareTodaySum - compareLastWeekSum) / compareLastWeekSum) * 100,
              );
            }
          }
        }

        const list = branches.map((branch) => {
          const current = byBranch[branch.id] ?? null;
          const prev = lastWeekByBranch[branch.id] ?? null;
          const delta = current != null && prev != null ? current - prev : null;
          return {
            id: branch.id,
            name: branch.name,
            total: current,
            prev,
            delta,
          };
        });
        setBranchTotals(list);
      } else {
        const [{ total: ownTotal, byBranch: ownByBranch }, rollup] =
          await Promise.all([
            fetchTotalsByDate(today, [selectedBranchId]),
            supabase.rpc('get_home_rollup', { target_date: toISODate(today) }),
          ]);

        if (ownByBranch) {
          setHomeBranchTotal(ownByBranch[selectedBranchId] ?? null);
        } else {
          setHomeBranchTotal(null);
        }

        if (!rollup?.error) {
          const row = rollup?.data?.[0];
          const missingNames = row?.missing_branches || [];
          setTodayTotal(
            missingNames.length === branches.length
              ? null
              : row?.today_total ?? null,
          );
          setHomeMissingBranches(missingNames);
          setHomeComparePercent(row?.compare_percent ?? null);
        } else {
          setTodayTotal(ownTotal);
          setHomeMissingBranches([]);
          setHomeComparePercent(null);
        }
        setBranchTotals([]);
      }

      const recentStart = subDays(today, 13);
      const recentEnd = today;
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

      const [recentData, weekData] = await Promise.all([
        supabase
          .from('sales_entries')
          .select('entry_date, amount')
          .in('branch_id', chartBranchIds)
          .gte('entry_date', toISODate(recentStart))
          .lte('entry_date', toISODate(recentEnd)),
        supabase
          .from('sales_entries')
          .select('entry_date, amount')
          .in('branch_id', chartBranchIds)
          .gte('entry_date', toISODate(weekStart))
          .lte('entry_date', toISODate(weekEnd)),
      ]);

      if (!recentData.error) {
        const totalByDate = {};
        (recentData.data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const series = [];
        for (let i = 13; i >= 0; i -= 1) {
          const date = subDays(today, i);
          const key = toISODate(date);
          const total = totalByDate[key];
          series.push({
            label: format(date, 'M/d'),
            value: total ? total : null,
          });
        }
        setRecent14Days(series);
      }

      if (!weekData.error) {
        const totalByDate = {};
        (weekData.data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const labels = ['월', '화', '수', '목', '금', '토', '일'];
        const weekSeries = [];
        for (let i = 0; i < 7; i += 1) {
          const date = subDays(weekEnd, 6 - i);
          const key = toISODate(date);
          const total = totalByDate[key];
          weekSeries.push({
            label: labels[i],
            value: total ? total : null,
          });
        }
        setWeekdayTotals(weekSeries);
      }

      if (isAdmin) {
        const monthStart = startOfMonth(today);
        const monthEnd = today;
        const lastYearSameDay = findSameWeekdayInLastYear(today) || subYears(today, 1);
        const [monthSum, lastYearSum] = await Promise.all([
          fetchTotalsByRange(monthStart, monthEnd, branchIds),
          fetchTotalsByRange(
            startOfMonth(lastYearSameDay),
            lastYearSameDay,
            branchIds,
          ),
        ]);
        setMonthTotal(monthSum);
        setLastYearMonthTotal(lastYearSum);
      }
    } finally {
      homeLoadingRef.current = false;
      setLoading(false);
    }
  }, [
    branches,
    isAdmin,
    selectedBranchId,
    fetchTotalsByDate,
    fetchTotalsByRange,
    supabase,
  ]);

  const loadBranchAnalysis = useCallback(async () => {
    if (!branchAnalysisId) return;
    const requestId = branchAnalysisRequestRef.current + 1;
    branchAnalysisRequestRef.current = requestId;
    setBranchAnalysisLoading(true);
    try {
      const today = new Date();
      const { start, end } = getSelectedRange();
      let effectiveEnd = end;
      if (periodType === 'week') {
        const latestEntry = await supabase
          .from('sales_entries')
          .select('entry_date')
          .eq('branch_id', branchAnalysisId)
          .gte('entry_date', toISODate(start))
          .lte('entry_date', toISODate(end))
          .order('entry_date', { ascending: false })
          .limit(1);
        if (!latestEntry.error && latestEntry.data?.length) {
          effectiveEnd = parseKstDate(latestEntry.data[0].entry_date);
        }
      }
      const rangeLength = differenceInCalendarDays(effectiveEnd, start) + 1;
      const prevStart =
        periodType === 'month'
          ? null
          : periodType === 'today'
            ? subWeeks(start, 1)
            : periodType === 'week'
            ? subWeeks(start, 1)
            : subDays(start, rangeLength);
      const prevEnd =
        periodType === 'month'
          ? null
          : periodType === 'today'
            ? subWeeks(effectiveEnd, 1)
            : periodType === 'week'
            ? subWeeks(effectiveEnd, 1)
            : subDays(start, 1);
      const lastMonthStart =
        periodType === 'today'
          ? findSameWeekdayInLastMonth(start) || subMonths(start, 1)
          : periodType === 'week'
            ? findSameWeekdayInLastMonth(start) || subMonths(start, 1)
            : subMonths(start, 1);
      const lastMonthEnd =
        periodType === 'today'
          ? findSameWeekdayInLastMonth(effectiveEnd) || subMonths(effectiveEnd, 1)
          : periodType === 'week'
            ? findSameWeekdayInLastMonth(effectiveEnd) || subMonths(effectiveEnd, 1)
            : subMonths(effectiveEnd, 1);
      const lastYearStart =
        periodType === 'today'
          ? findSameWeekdayInLastYear(start) || subYears(start, 1)
          : periodType === 'week'
            ? findSameWeekdayInLastYear(start) || subYears(start, 1)
            : subYears(start, 1);
      const lastYearEnd =
        periodType === 'today'
          ? findSameWeekdayInLastYear(effectiveEnd) || subYears(effectiveEnd, 1)
          : periodType === 'week'
            ? findSameWeekdayInLastYear(effectiveEnd) || subYears(effectiveEnd, 1)
            : subYears(effectiveEnd, 1);

      const [rangeTotal, prevTotal, lastMonthTotal, lastYearTotal] =
        await Promise.all([
          fetchTotalsByRange(start, end, [branchAnalysisId]),
          prevStart && prevEnd
            ? fetchTotalsByRange(prevStart, prevEnd, [branchAnalysisId])
            : Promise.resolve(null),
          fetchTotalsByRange(lastMonthStart, lastMonthEnd, [branchAnalysisId]),
          fetchTotalsByRange(lastYearStart, lastYearEnd, [branchAnalysisId]),
        ]);

      if (requestId !== branchAnalysisRequestRef.current) return;
      setPeriodSummary({
        total: rangeTotal,
        prev: prevTotal,
        lastMonth: lastMonthTotal,
        lastYear: lastYearTotal,
      });

      const recentStart = subDays(today, 13);
      const recentPrevStart = subDays(recentStart, 7);
      const recentPrevEnd = subDays(today, 7);
      const recentYearStart =
        findSameWeekdayInLastYear(recentStart) || subYears(recentStart, 1);
      const recentYearEnd =
        findSameWeekdayInLastYear(today) || subYears(today, 1);

      const [recentData, recentPrevData, recentYearData, weekDataThis, weekDataLast] =
        await Promise.all([
          supabase
            .from('sales_entries')
            .select('entry_date, amount')
            .eq('branch_id', branchAnalysisId)
            .gte('entry_date', toISODate(recentStart))
            .lte('entry_date', toISODate(today)),
          supabase
            .from('sales_entries')
            .select('entry_date, amount')
            .eq('branch_id', branchAnalysisId)
            .gte('entry_date', toISODate(recentPrevStart))
            .lte('entry_date', toISODate(recentPrevEnd)),
          supabase
            .from('sales_entries')
            .select('entry_date, amount')
            .eq('branch_id', branchAnalysisId)
            .gte('entry_date', toISODate(recentYearStart))
            .lte('entry_date', toISODate(recentYearEnd)),
          supabase
            .from('sales_entries')
            .select('entry_date, amount')
            .eq('branch_id', branchAnalysisId)
            .gte('entry_date', toISODate(startOfWeek(today, { weekStartsOn: 1 })))
            .lte('entry_date', toISODate(endOfWeek(today, { weekStartsOn: 1 }))),
          supabase
            .from('sales_entries')
            .select('entry_date, amount')
            .eq('branch_id', branchAnalysisId)
            .gte('entry_date', toISODate(subDays(startOfWeek(today, { weekStartsOn: 1 }), 7)))
            .lte('entry_date', toISODate(subDays(endOfWeek(today, { weekStartsOn: 1 }), 7))),
        ]);

      if (requestId !== branchAnalysisRequestRef.current) return;
      if (!recentData.error) {
        const totalByDate = {};
        (recentData.data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const series = [];
        for (let i = 13; i >= 0; i -= 1) {
          const date = subDays(today, i);
          const key = toISODate(date);
          const total = totalByDate[key];
          series.push({
            label: format(date, 'M/d'),
            value: total ? total : null,
          });
        }
        setBranchAnalysisRecent14(series);
      }

      if (!recentPrevData.error) {
        const totalByDate = {};
        (recentPrevData.data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const series = [];
        for (let i = 13; i >= 0; i -= 1) {
          const date = subDays(today, i + 7);
          const key = toISODate(date);
          const total = totalByDate[key];
          series.push({
            label: format(date, 'M/d'),
            value: total ? total : null,
          });
        }
        setBranchAnalysisComparePrev(series);
      }

      if (!recentYearData.error) {
        const totalByDate = {};
        (recentYearData.data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const series = [];
        for (let i = 13; i >= 0; i -= 1) {
          const date = subYears(subDays(today, i), 1);
          const key = toISODate(date);
          const total = totalByDate[key];
          series.push({
            label: format(date, 'M/d'),
            value: total ? total : null,
          });
        }
        setBranchAnalysisCompareYear(series);
      }

      const buildWeekSeries = (data, weekEndDate) => {
        const totalByDate = {};
        (data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const labels = ['월', '화', '수', '목', '금', '토', '일'];
        const weekSeries = [];
        for (let i = 0; i < 7; i += 1) {
          const date = subDays(weekEndDate, 6 - i);
          const key = toISODate(date);
          const total = totalByDate[key];
          weekSeries.push({
            label: labels[i],
            value: total ? total : null,
          });
        }
        return weekSeries;
      };

      if (!weekDataThis.error) {
        setBranchAnalysisWeekdays(
          buildWeekSeries(
            weekDataThis.data,
            endOfWeek(today, { weekStartsOn: 1 }),
          ),
        );
      }

      if (!weekDataLast.error) {
        setBranchAnalysisWeekdaysLast(
          buildWeekSeries(
            weekDataLast.data,
            subDays(endOfWeek(today, { weekStartsOn: 1 }), 7),
          ),
        );
      }

      if (requestId !== branchAnalysisRequestRef.current) return;
      const historyStart = startOfMonth(subMonths(today, 11));
      const historyPrevStart = startOfMonth(subMonths(today, 23));
      const historyData = await supabase
        .from('sales_entries')
        .select('entry_date, amount')
        .eq('branch_id', branchAnalysisId)
        .gte('entry_date', toISODate(historyPrevStart))
        .lte('entry_date', toISODate(today));

      if (requestId !== branchAnalysisRequestRef.current) return;
      if (!historyData.error) {
        const monthlyTotals = {};
        (historyData.data || []).forEach((row) => {
          const key = format(parseKstDate(row.entry_date), 'yyyy-MM');
          monthlyTotals[key] =
            (monthlyTotals[key] || 0) + Number(row.amount || 0);
        });
        const currentSeries = [];
        const prevSeries = [];
        for (let i = 0; i < 12; i += 1) {
          const monthDate = addMonths(historyStart, i);
          const monthKey = format(monthDate, 'yyyy-MM');
          const prevKey = format(subYears(monthDate, 1), 'yyyy-MM');
          currentSeries.push({
            label: format(monthDate, 'M월'),
            value: monthlyTotals[monthKey] || 0,
          });
          prevSeries.push({
            label: format(monthDate, 'M월'),
            value: monthlyTotals[prevKey] || 0,
          });
        }
        setMonthlySeries(currentSeries);
        setMonthlySeriesPrev(prevSeries);
      }
    } finally {
      if (requestId === branchAnalysisRequestRef.current) {
        setBranchAnalysisLoading(false);
      }
    }
  }, [
    branchAnalysisId,
    fetchTotalsByDate,
    fetchTotalsByRange,
    periodType,
  ]);

  const loadEntryForToday = useCallback(async () => {
    if (entryLoadingRef.current) return;
    if (!selectedBranchId) return;
    const today = new Date();
    const { data, error } = await supabase
      .from('sales_entries')
      .select('amount')
      .eq('branch_id', selectedBranchId)
      .eq('entry_date', toISODate(today));
    if (error) {
      console.warn(error.message);
      return;
    }
    const daily = data?.[0]?.amount;
    const nextValue = daily != null ? String(daily) : '';
    setEntryDaily(nextValue);
    setIsEditingEntry(!data?.length);
  }, [selectedBranchId]);

  const loadMonthlyEntries = useCallback(async () => {
    if (entryLoadingRef.current) return;
    if (!selectedBranchId) return;
    entryLoadingRef.current = true;
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    const { data, error } = await supabase
      .from('sales_entries')
      .select('entry_date, amount')
      .eq('branch_id', selectedBranchId)
      .gte('entry_date', toISODate(monthStart))
      .lte('entry_date', toISODate(monthEnd))
      .order('entry_date', { ascending: false });

    if (error) {
      console.warn(error.message);
      entryLoadingRef.current = false;
      return;
    }
    setMonthlyEntries(data || []);
    entryLoadingRef.current = false;
  }, [monthCursor, selectedBranchId]);

  useEffect(() => {
    if (activeTab !== 'home') return;
    loadHomeData();
  }, [activeTab, refreshKey, selectedBranchId, isAdmin, branches.length]);

  useEffect(() => {
    if (!isAdmin) return;
    if (adminMenu !== 'branches') return;
    loadBranchAnalysis();
  }, [adminMenu, branchAnalysisId, isAdmin, periodType, loadBranchAnalysis]);

  const loadBranchSalesMonth = useCallback(async () => {
    if (!branches.length) return;
    setSalesLoading(true);
    try {
      const monthStart = startOfMonth(salesMonthCursor);
      const monthEnd = endOfMonth(salesMonthCursor);
      const { data, error } = await supabase
        .from('sales_entries')
        .select('entry_date, amount, branch_id')
        .in(
          'branch_id',
          branches.map((b) => b.id),
        )
        .gte('entry_date', toISODate(monthStart))
        .lte('entry_date', toISODate(monthEnd));

      if (error) {
        console.warn(error.message);
        return;
      }

      const totalsByDate = {};
      const branchTotals = {};
      (data || []).forEach((row) => {
        const key = row.entry_date;
        totalsByDate[key] = totalsByDate[key] || {};
        totalsByDate[key][row.branch_id] =
          (totalsByDate[key][row.branch_id] || 0) + Number(row.amount || 0);
        branchTotals[row.branch_id] =
          (branchTotals[row.branch_id] || 0) + Number(row.amount || 0);
      });

      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const rows = days.map((date) => {
        const key = toISODate(date);
        const branchValues = branches.map((branch) => ({
          id: branch.id,
          value: totalsByDate[key]?.[branch.id] ?? null,
        }));
        const total = branchValues.reduce(
          (sum, item) => sum + (item.value || 0),
          0,
        );
        return { date, key, branchValues, total };
      });

      const prevMonthStart = startOfMonth(subMonths(monthStart, 1));
      const prevMonthEnd = endOfMonth(subMonths(monthStart, 1));
      const prevData = await supabase
        .from('sales_entries')
        .select('amount')
        .in(
          'branch_id',
          branches.map((b) => b.id),
        )
        .gte('entry_date', toISODate(prevMonthStart))
        .lte('entry_date', toISODate(prevMonthEnd));

      const prevTotal = prevData.error
        ? null
        : (prevData.data || []).reduce(
            (sum, row) => sum + Number(row.amount || 0),
            0,
          );

      setSalesTableRows(rows);
      setSalesMonthlySummary({
        total: Object.values(branchTotals).reduce((sum, v) => sum + v, 0),
        byBranch: branchTotals,
        prevTotal,
      });
    } finally {
      setSalesLoading(false);
    }
  }, [branches, salesMonthCursor]);

  useEffect(() => {
    if (!isAdmin) return;
    if (adminMenu !== 'branch-sales') return;
    loadBranchSalesMonth();
  }, [adminMenu, loadBranchSalesMonth, salesMonthCursor]);

  useEffect(() => {
    if (activeTab !== 'entry' && activeTab !== 'history') return;
    if (activeTab === 'entry') {
      loadEntryForToday();
    }
    loadMonthlyEntries();
  }, [activeTab, loadEntryForToday, loadMonthlyEntries, refreshKey]);

  const handleEntrySave = async (value) => {
    if (!selectedBranchId) return;
    if (!value) {
      Alert.alert('금액을 입력해주세요.');
      return;
    }
    setEntryLoading(true);
    try {
      const payload = {
        branch_id: selectedBranchId,
        entry_date: toISODate(new Date()),
        amount: Number(value),
      };
      const { error } = await supabase
        .from('sales_entries')
        .upsert(payload, {
          onConflict: 'branch_id,entry_date',
        });
      if (error) throw error;
      setRefreshKey((prev) => prev + 1);
      setIsEditingEntry(false);
      Alert.alert('저장 완료', '매출이 저장되었습니다.');
    } catch (err) {
      Alert.alert('저장 실패', err.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setEntryLoading(false);
    }
  };

  const handleEditSave = async (entryId) => {
    if (!editingAmount) {
      Alert.alert('금액을 입력해주세요.');
      return;
    }
    try {
      const { error } = await supabase
        .from('sales_entries')
        .update({ amount: Number(editingAmount) })
        .eq('id', entryId);
      if (error) throw error;
      setEditingEntryId(null);
      setEditingAmount('');
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      Alert.alert('수정 실패', err.message ?? '잠시 후 다시 시도해주세요.');
    }
  };

  const handleHistorySave = async (date) => {
    if (!selectedBranchId) {
      Alert.alert('지점을 먼저 선택해주세요.');
      return;
    }
    if (!historyEditingAmount) {
      Alert.alert('금액을 입력해주세요.');
      return;
    }
    try {
      const { error } = await supabase
        .from('sales_entries')
        .upsert(
          {
            branch_id: selectedBranchId,
            entry_date: date,
            amount: Number(historyEditingAmount),
          },
          { onConflict: 'branch_id,entry_date' },
        );
      if (error) throw error;
      setHistoryEditingDate(null);
      setHistoryEditingAmount('');
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      Alert.alert('수정 실패', err.message ?? '잠시 후 다시 시도해주세요.');
    }
  };

  const handleWithdrawConfirm = async () => {
    setWithdrawLoading(true);
    setWithdrawError('');
    try {
      const { error } = await supabase.rpc('set_profile_active', { value: false });
      if (error) throw error;
      setWithdrawOpen(false);
      await supabase.auth.signOut();
    } catch (err) {
      setWithdrawError(err.message ?? '탈퇴 처리에 실패했습니다.');
    } finally {
      setWithdrawLoading(false);
    }
  };

  const historyTableRows = useMemo(() => {
    const groups = {};
    monthlyEntries.forEach((entry) => {
      groups[entry.entry_date] =
        (groups[entry.entry_date] || 0) + Number(entry.amount || 0);
    });
    const today = new Date();
    const rangeEnd =
      format(today, 'yyyy-MM') === format(monthCursor, 'yyyy-MM')
        ? today
        : endOfMonth(monthCursor);
    const days = eachDayOfInterval({
      start: startOfMonth(monthCursor),
      end: rangeEnd,
    });
    return days
      .map((day) => {
        const date = toISODate(day);
        const total = groups[date];
        return { date, total: total ?? null };
      })
      .sort((a, b) => (a.date > b.date ? -1 : 1));
  }, [monthlyEntries, monthCursor]);

  const monthOptions = useMemo(
    () =>
      [0, 1, 2].map((offset) => startOfMonth(subMonths(new Date(), offset))),
    [],
  );

  const homePercent = homeComparePercent;
  const formatSignedPercent = (value) => {
    if (value == null || Number.isNaN(value)) return '-';
    const sign = value > 0 ? '+' : value < 0 ? '-' : '';
    return `${sign}${Math.abs(value).toFixed(1)}%`;
  };
  const adminMenuTitle =
    adminMenus.find((item) => item.key === adminMenu)?.label || '매출 대시보드';

  const renderAdminContent = ({ isMobileLayout } = {}) => {
    if (adminMenu === 'dashboard') {
      return (
        <>
          <View
            style={[
              styles.kpiRow,
              isMobileLayout && styles.kpiRowMobile,
            ]}
          >
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>오늘 총매출</Text>
              <Text style={styles.kpiValue}>{formatAmount(todayTotal)}</Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전주 대비</Text>
              <Text style={styles.kpiValue}>
                {homePercent == null ? '-' : formatSignedPercent(homePercent)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>이번달 누적</Text>
              <Text style={styles.kpiValue}>{formatAmount(monthTotal)}</Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전년 대비</Text>
              <Text style={styles.kpiValue}>
                {lastYearMonthTotal == null ||
                monthTotal == null ||
                lastYearMonthTotal === 0
                  ? '-'
                  : formatSignedPercent(
                      ((monthTotal - lastYearMonthTotal) / lastYearMonthTotal) * 100,
                    )}
              </Text>
            </View>
          </View>

          <View style={styles.webCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>지점별 비교</Text>
              <Text style={styles.sectionNote}>전주 같은 요일 대비</Text>
            </View>
            {branchTotals.map((branch) => (
              <View key={branch.id} style={styles.compareRow}>
                <Text style={styles.compareName}>{branch.name}</Text>
                <Text style={styles.compareValue}>
                  {formatAmount(branch.total)}
                </Text>
                <Text style={styles.compareTrend} numberOfLines={1} ellipsizeMode="clip">
                  {branch.delta == null || branch.prev == null || branch.prev === 0
                    ? '-'
                    : formatSignedPercent((branch.delta / branch.prev) * 100)}
                </Text>
              </View>
            ))}
          </View>
          <LineChartSimple
            title="최근 14일 일매출"
            data={recent14Days}
            maxWidth={1000}
            labelFormatter={(label) => label.split('/')[1] || label}
            showPointLabels={Platform.OS === 'web'}
            valueFormatter={Platform.OS === 'web' ? formatMillions : undefined}
          />
          <BarChartSimple
            title="이번주 요일별 매출"
            data={weekdayTotals}
            maxWidth={1000}
            valueFormatter={
              isMobileLayout ? (value) => formatMillions(value) : undefined
            }
          />
        </>
      );
    }

    if (adminMenu === 'branches') {
      return (
        <>
          {isMobileLayout ? (
            <View style={styles.webCard}>
              <BranchPicker
                branches={branches}
                value={branchAnalysisId}
                onChange={setBranchAnalysisId}
                disabled={false}
                label="선택"
              />
              <View style={styles.periodRow}>
                {[
                  { key: 'today', label: '오늘' },
                  { key: 'week', label: '이번주' },
                  { key: 'month', label: '이번달' },
                ].map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setPeriodType(item.key)}
                    style={[
                      styles.periodButton,
                      periodType === item.key && styles.periodButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodText,
                        periodType === item.key && styles.periodTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.webStickyBar}>
              <View style={styles.webStickyRow}>
                <View style={styles.webStickyBlock}>
                  <BranchPicker
                    branches={branches}
                    value={branchAnalysisId}
                    onChange={setBranchAnalysisId}
                    disabled={false}
                    label="선택"
                  />
                  <View style={styles.periodRow}>
                    {[
                      { key: 'today', label: '오늘' },
                      { key: 'week', label: '이번주' },
                      { key: 'month', label: '이번달' },
                    ].map((item) => (
                      <Pressable
                        key={item.key}
                        onPress={() => setPeriodType(item.key)}
                        style={[
                          styles.periodButton,
                          periodType === item.key && styles.periodButtonActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.periodText,
                            periodType === item.key && styles.periodTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          )}
          <View
            style={[
              styles.kpiRow,
              isMobileLayout && styles.kpiRowMobile,
            ]}
          >
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>선택 기간 총매출</Text>
              <Text style={styles.kpiValue}>
                {formatAmount(periodSummary.total)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전주 동일기간 대비</Text>
              <Text style={styles.kpiValue}>
                {formatAmount(periodSummary.prev)}
              </Text>
              <Text style={styles.cardSub}>
              {calcPercent(periodSummary.total, periodSummary.prev) == null
                ? '-'
                : formatSignedPercent(
                    calcPercent(periodSummary.total, periodSummary.prev),
                  )}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전월 대비</Text>
              <Text style={styles.kpiValue}>
                {formatAmount(periodSummary.lastMonth)}
              </Text>
              <Text style={styles.cardSub}>
              {calcPercent(periodSummary.total, periodSummary.lastMonth) ==
              null
                ? '-'
                : formatSignedPercent(
                    calcPercent(periodSummary.total, periodSummary.lastMonth),
                  )}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전년 동기간 대비</Text>
              <Text style={styles.kpiValue}>
                {formatAmount(periodSummary.lastYear)}
              </Text>
              <Text style={styles.cardSub}>
              {calcPercent(periodSummary.total, periodSummary.lastYear) ==
              null
                ? '-'
                : formatSignedPercent(
                    calcPercent(periodSummary.total, periodSummary.lastYear),
                  )}
              </Text>
            </View>
          </View>
          <LineChartSimple
            title="최근 14일 일매출"
            data={branchAnalysisRecent14}
            compareData={branchAnalysisComparePrev}
            compareDataAlt={branchAnalysisCompareYear}
            rangeMode="primary"
            maxWidth={1000}
            legend={[
              { label: '이번 기간', color: '#2255ff' },
              { label: '전주 동일 기간', color: '#94a3b8', dashed: true },
              { label: '전년 동일 기간', color: '#cbd5f5', dashed: true },
            ]}
            labelFormatter={(label) => label.split('/')[1] || label}
          />
          <View style={styles.webCard}>
            <View style={styles.weekToggleRow}>
              <Text style={styles.sectionTitle}>요일별 평균 매출</Text>
              <View style={styles.periodRow}>
                {[
                  { key: 'this', label: '이번주' },
                  { key: 'last', label: '전주' },
                ].map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setWeekdayMode(item.key)}
                    style={[
                      styles.periodButton,
                      weekdayMode === item.key && styles.periodButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodText,
                        weekdayMode === item.key && styles.periodTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <BarChartSimple
              title="요일별 평균 매출"
              data={
                weekdayMode === 'this'
                  ? branchAnalysisWeekdays
                  : branchAnalysisWeekdaysLast
              }
              maxWidth={1000}
              valueFormatter={
                isMobileLayout ? (value) => formatMillions(value) : undefined
              }
            />
          </View>
          <LineChartSimple
            title="월별 히스토리 (최근 12개월)"
            data={monthlySeries}
            compareData={monthlySeriesPrev}
            compareColor="#94a3b8"
            maxWidth={1000}
            legend={[
              { label: '올해', color: '#2255ff' },
              { label: '작년', color: '#94a3b8', dashed: true },
            ]}
            valueFormatter={
              isMobileLayout ? (value) => formatMillions(value) : undefined
            }
          />
          {branchAnalysisLoading ? (
            <Text style={styles.loadingText}>데이터 불러오는 중...</Text>
          ) : null}
        </>
      );
    }

    if (adminMenu === 'branch-sales') {
      const isTotalOnly = isMobileLayout && salesBranchFilter === 'all';
      const tableBranches =
        isMobileLayout && salesBranchFilter !== 'all'
          ? orderedBranches.filter((b) => b.id === salesBranchFilter)
          : isTotalOnly
            ? []
            : orderedBranches;
      const cellValueFormatter = isMobileLayout ? formatAmount : formatTableValue;
      const mobileCellStyle = isMobileLayout ? styles.tableCellMobile : null;
      const mobileDateStyle = isMobileLayout ? styles.tableDateCellMobile : null;
      const mobileTotalStyle = isMobileLayout ? styles.tableTotalCellMobile : null;
      const monthYears = [0, 1, 2].map((offset) => new Date().getFullYear() - offset);
      return (
        <>
          <View style={styles.webCard}>
            <View style={styles.monthHeader}>
              <Pressable
                style={styles.monthArrow}
                onPress={() => setSalesMonthCursor((prev) => subMonths(prev, 1))}
              >
                <Text style={styles.monthArrowText}>◀</Text>
              </Pressable>
              <Text style={styles.monthTitle}>
                {format(salesMonthCursor, 'yyyy년 M월')}
              </Text>
              <Pressable
                style={styles.monthArrow}
                onPress={() => setSalesMonthCursor((prev) => addMonths(prev, 1))}
              >
                <Text style={styles.monthArrowText}>▶</Text>
              </Pressable>
            </View>
            <Pressable
              style={styles.monthPickerButton}
              onPress={() => setMonthPickerOpen(true)}
            >
              <Text style={styles.monthPickerText}>년/월 선택</Text>
            </Pressable>
            <Modal transparent visible={monthPickerOpen} animationType="fade">
                <Pressable
                  style={styles.menuOverlay}
                  onPress={() => setMonthPickerOpen(false)}
                >
                  <View style={styles.monthPickerSheet}>
                    <Text style={styles.sectionTitle}>월 선택</Text>
                    <View style={styles.monthPickerGrid}>
                      {monthYears.map((year) => (
                        <View key={year} style={styles.monthPickerColumn}>
                          <Text style={styles.monthPickerYear}>{year}년</Text>
                          <View style={styles.monthPickerMonths}>
                            {Array.from({ length: 12 }, (_, idx) => idx + 1).map(
                              (month) => {
                                const date = new Date(year, month - 1, 1);
                                const isActive =
                                  format(date, 'yyyy-MM') ===
                                  format(salesMonthCursor, 'yyyy-MM');
                                return (
                                  <Pressable
                                    key={`${year}-${month}`}
                                    style={[
                                      styles.monthButton,
                                      isActive && styles.monthButtonActive,
                                    ]}
                                    onPress={() => {
                                      setSalesMonthCursor(startOfMonth(date));
                                      setMonthPickerOpen(false);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.monthText,
                                        isActive && styles.monthTextActive,
                                      ]}
                                    >
                                      {month}월
                                    </Text>
                                  </Pressable>
                                );
                              },
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </Pressable>
              </Modal>
            
              {isMobileLayout ? (
                <View style={styles.branchFilterRow}>
                  <Pressable
                    style={[
                      styles.branchFilterButton,
                      salesBranchFilter === 'all' &&
                        styles.branchFilterButtonActive,
                    ]}
                    onPress={() => setSalesBranchFilter('all')}
                  >
                    <Text
                      style={[
                        styles.branchFilterText,
                        salesBranchFilter === 'all' &&
                          styles.branchFilterTextActive,
                      ]}
                    >
                      합계
                    </Text>
                  </Pressable>
                  {orderedBranches.map((branch) => (
                    <Pressable
                      key={branch.id}
                      style={[
                        styles.branchFilterButton,
                        salesBranchFilter === branch.id &&
                          styles.branchFilterButtonActive,
                      ]}
                      onPress={() => setSalesBranchFilter(branch.id)}
                    >
                      <Text
                        style={[
                          styles.branchFilterText,
                          salesBranchFilter === branch.id &&
                            styles.branchFilterTextActive,
                        ]}
                      >
                        {branchLabelMap[branch.name] || branch.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
          </View>

          <View style={styles.webCard}>
            <Text style={styles.sectionTitle}>지점별 매출</Text>
            <ScrollView horizontal>
              <View>
                <View style={styles.tableHeaderRow}>
                  <View
                    style={[
                      styles.tableCell,
                      styles.tableDateCell,
                      mobileDateStyle,
                    ]}
                  >
                    <Text style={styles.tableHeaderText}>날짜</Text>
                  </View>
                  {tableBranches.map((branch) => (
                    <View
                      key={branch.id}
                      style={[styles.tableCell, mobileCellStyle]}
                    >
                      <Text style={styles.tableHeaderText}>
                        {branch.name}
                      </Text>
                    </View>
                  ))}
                  {isTotalOnly ? (
                    <View
                      style={[
                        styles.tableCell,
                        styles.tableTotalCell,
                        mobileTotalStyle,
                      ]}
                    >
                        <Text style={styles.tableHeaderText}>합계</Text>
                      </View>
                    ) : null}
                </View>
                {salesTableRows.map((row) => {
                  const isToday =
                    format(row.date, 'yyyy-MM-dd') ===
                    format(new Date(), 'yyyy-MM-dd');
                  return (
                    <View
                      key={row.key}
                      style={[
                        styles.tableRow,
                        isToday && styles.tableTodayRow,
                      ]}
                    >
                      <View
                        style={[
                          styles.tableCell,
                          styles.tableDateCell,
                          mobileDateStyle,
                        ]}
                      >
                        <Text style={styles.tableCellText} numberOfLines={1}>
                          {format(row.date, 'MM/dd')}
                        </Text>
                      </View>
                      {row.branchValues
                        .filter((value) =>
                          tableBranches.some((b) => b.id === value.id),
                        )
                        .map((value) => (
                        <View
                          key={value.id}
                          style={[
                            styles.tableCell,
                            mobileCellStyle,
                            value.value == null && styles.tableEmptyCell,
                          ]}
                        >
                          <Text
                            style={[
                              styles.tableCellText,
                              value.value == null && styles.tableEmptyCellText,
                            ]}
                            numberOfLines={1}
                          >
                            {value.value == null
                              ? '—'
                              : cellValueFormatter(value.value)}
                          </Text>
                        </View>
                      ))}
                      {isTotalOnly ? (
                        <View
                          style={[
                            styles.tableCell,
                            styles.tableTotalCell,
                            mobileTotalStyle,
                          ]}
                        >
                          <Text style={styles.tableCellText} numberOfLines={1}>
                            {row.total ? cellValueFormatter(row.total) : '—'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
            {salesLoading ? (
              <Text style={styles.loadingText}>데이터 불러오는 중...</Text>
            ) : null}
          </View>

          <View style={styles.webCard}>
            <Text style={styles.sectionTitle}>월 요약</Text>
            <Text style={styles.summaryValue}>
              이번달 누적 합계: {formatAmount(salesMonthlySummary.total)}
            </Text>
            {branches.map((branch) => (
              <Text key={branch.id} style={styles.summaryItem}>
                {branch.name}{' '}
                {formatAmount(salesMonthlySummary.byBranch[branch.id] || 0)}
              </Text>
            ))}
            <Text style={styles.summaryItem}>
              전월 대비{' '}
              {calcPercent(
                salesMonthlySummary.total,
                salesMonthlySummary.prevTotal,
              ) == null
                ? '-'
                : formatSignedPercent(
                    calcPercent(
                      salesMonthlySummary.total,
                      salesMonthlySummary.prevTotal,
                    ),
                  )}
            </Text>
          </View>
        </>
      );
    }

    if (adminMenu === 'accounts') {
      return <AdminPanel branches={branches} />;
    }

    return (
      <View style={styles.webCard}>
        <Text style={styles.sectionTitle}>준비중입니다</Text>
        <Text style={styles.webPlaceholder}>
          선택한 메뉴는 다음 단계에서 구현됩니다.
        </Text>
      </View>
    );
  };

  if (isAdmin && Platform.OS === 'web' && isWebCompact) {
    return (
      <SafeAreaView style={styles.container}>
        <Modal transparent visible={menuOpen} animationType="fade">
          <Pressable
            style={styles.menuOverlay}
            onPress={() => setMenuOpen(false)}
          >
            <View style={styles.menuSheet}>
              {adminMenus.map((item) => (
                <Pressable
                  key={item.key}
                  style={styles.menuItem}
                  onPress={() => {
                    setAdminMenu(item.key);
                    setMenuOpen(false);
                  }}
                >
                  <Text style={styles.menuItemText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: contentPaddingBottom },
          ]}
        >
          <View style={styles.header}>
            <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
              <Text style={styles.menuButtonText}>☰</Text>
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>{adminMenuTitle}</Text>
            </View>
            <Pressable
              style={styles.logout}
              onPress={() => supabase.auth.signOut()}
            >
              <Text style={styles.logoutText}>로그아웃</Text>
            </Pressable>
          </View>
          {renderAdminContent({ isMobileLayout: true })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (isAdmin && Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.webContainer}>
        <View style={styles.webLayout}>
          <View style={styles.sidebar}>
            <Text style={styles.sidebarTitle}>관리자</Text>
            {adminMenus.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setAdminMenu(item.key)}
                style={[
                  styles.sidebarItem,
                  adminMenu === item.key && styles.sidebarItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.sidebarItemText,
                    adminMenu === item.key && styles.sidebarItemTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView contentContainerStyle={styles.webContent}>
            <View style={styles.webHeader}>
              <View>
                <Text style={styles.title}>{adminMenuTitle}</Text>
                <Text style={styles.subtitle}>{format(now, 'yyyy.MM.dd')}</Text>
              </View>
              <Pressable
                style={styles.logout}
                onPress={() => supabase.auth.signOut()}
              >
                <Text style={styles.logoutText}>로그아웃</Text>
              </Pressable>
            </View>

            {adminMenu === 'dashboard' ? (
              <>
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>오늘 총매출</Text>
                    <Text style={styles.kpiValue}>{formatAmount(todayTotal)}</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전주 대비</Text>
                    <Text style={styles.kpiValue}>
                      {homePercent == null ? '-' : formatSignedPercent(homePercent)}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>이번달 누적</Text>
                    <Text style={styles.kpiValue}>{formatAmount(monthTotal)}</Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전년 대비</Text>
                    <Text style={styles.kpiValue}>
                      {lastYearMonthTotal == null ||
                      monthTotal == null ||
                      lastYearMonthTotal === 0
                        ? '-'
                        : formatSignedPercent(
                            ((monthTotal - lastYearMonthTotal) /
                              lastYearMonthTotal) *
                              100,
                          )}
                    </Text>
                  </View>
                </View>

                <View style={styles.webCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>지점별 비교</Text>
                    <Text style={styles.sectionNote}>전주 같은 요일 대비</Text>
                  </View>
                  {branchTotals.map((branch) => (
                    <View key={branch.id} style={styles.compareRow}>
                      <Text style={styles.compareName}>{branch.name}</Text>
                      <Text style={styles.compareValue}>
                        {formatAmount(branch.total)}
                      </Text>
                      <Text
                        style={styles.compareTrend}
                        numberOfLines={1}
                        ellipsizeMode="clip"
                      >
                        {branch.delta == null ||
                        branch.prev == null ||
                        branch.prev === 0
                          ? '-'
                          : formatSignedPercent((branch.delta / branch.prev) * 100)}
                      </Text>
                    </View>
                  ))}
                </View>
                <LineChartSimple
                  title="최근 14일 일매출"
                  data={recent14Days}
                  maxWidth={1000}
                  showPointLabels={Platform.OS === 'web'}
                  valueFormatter={Platform.OS === 'web' ? formatMillions : formatAmount}
                />
                <BarChartSimple
                  title="이번주 요일별 매출"
                  data={weekdayTotals}
                  maxWidth={1000}
                />
              </>
            ) : adminMenu === 'branches' ? (
              <>
                <View style={styles.webStickyBar}>
                  <View style={styles.webStickyRow}>
                    <View style={styles.webStickyBlock}>
                      <BranchPicker
                        branches={branches}
                        value={branchAnalysisId}
                        onChange={setBranchAnalysisId}
                        disabled={false}
                        label="선택"
                      />
                      <View style={styles.periodRow}>
                        {[
                          { key: 'today', label: '오늘' },
                          { key: 'week', label: '이번주' },
                          { key: 'month', label: '이번달' },
                        ].map((item) => (
                          <Pressable
                            key={item.key}
                            onPress={() => setPeriodType(item.key)}
                            style={[
                              styles.periodButton,
                              periodType === item.key &&
                                styles.periodButtonActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.periodText,
                                periodType === item.key &&
                                  styles.periodTextActive,
                              ]}
                            >
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
                <View style={styles.kpiRow}>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>총매출</Text>
                    <Text style={styles.kpiValue}>
                      {formatAmount(periodSummary.total)}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전주 대비</Text>
                    <Text style={styles.kpiValue}>
                      {formatAmount(periodSummary.prev)}
                    </Text>
                    <Text style={styles.cardSub}>
                      {calcPercent(periodSummary.total, periodSummary.prev) ==
                      null
                        ? '-'
                        : formatSignedPercent(
                            calcPercent(periodSummary.total, periodSummary.prev),
                          )}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전월 대비</Text>
                    <Text style={styles.kpiValue}>
                      {formatAmount(periodSummary.lastMonth)}
                    </Text>
                    <Text style={styles.cardSub}>
                      {calcPercent(periodSummary.total, periodSummary.lastMonth) ==
                      null
                        ? '-'
                        : formatSignedPercent(
                            calcPercent(
                              periodSummary.total,
                              periodSummary.lastMonth,
                            ),
                          )}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전년 대비</Text>
                    <Text style={styles.kpiValue}>
                      {formatAmount(periodSummary.lastYear)}
                    </Text>
                    <Text style={styles.cardSub}>
                      {calcPercent(periodSummary.total, periodSummary.lastYear) ==
                      null
                        ? '-'
                        : formatSignedPercent(
                            calcPercent(
                              periodSummary.total,
                              periodSummary.lastYear,
                            ),
                          )}
                    </Text>
                  </View>
                </View>
                <LineChartSimple
                  title="최근 14일 일매출"
                  data={branchAnalysisRecent14}
                  compareData={branchAnalysisComparePrev}
                  compareDataAlt={branchAnalysisCompareYear}
                  rangeMode="primary"
                  maxWidth={1000}
                  legend={[
                    { label: '이번 기간', color: '#2255ff' },
                    { label: '전주 동일 기간', color: '#94a3b8', dashed: true },
                    { label: '전년 동일 기간', color: '#cbd5f5', dashed: true },
                  ]}
                  valueFormatter={formatAmount}
                />
                <View style={styles.webCard}>
                  <View style={styles.weekToggleRow}>
                    <Text style={styles.sectionTitle}>요일별 평균 매출</Text>
                    <View style={styles.periodRow}>
                      {[
                        { key: 'this', label: '이번주' },
                        { key: 'last', label: '전주' },
                      ].map((item) => (
                        <Pressable
                          key={item.key}
                          onPress={() => setWeekdayMode(item.key)}
                          style={[
                            styles.periodButton,
                            weekdayMode === item.key &&
                              styles.periodButtonActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.periodText,
                              weekdayMode === item.key &&
                                styles.periodTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <BarChartSimple
                    title="요일별 평균 매출"
                    data={
                      weekdayMode === 'this'
                        ? branchAnalysisWeekdays
                        : branchAnalysisWeekdaysLast
                    }
                    maxWidth={1000}
                  />
                </View>


                <LineChartSimple
                  title="월별 히스토리 (최근 12개월)"
                  data={monthlySeries}
                  compareData={monthlySeriesPrev}
                  compareColor="#94a3b8"
                  maxWidth={1000}
                  legend={[
                    { label: '올해', color: '#2255ff' },
                    { label: '작년', color: '#94a3b8', dashed: true },
                  ]}
                />
                {branchAnalysisLoading ? (
                  <Text style={styles.loadingText}>데이터 불러오는 중...</Text>
                ) : null}
              </>
            ) : adminMenu === 'branch-sales' ? (
              <>
                <View style={styles.webCard}>
                  <View style={styles.monthHeader}>
                    <Pressable
                      style={styles.monthArrow}
                      onPress={() =>
                        setSalesMonthCursor((prev) => subMonths(prev, 1))
                      }
                    >
                      <Text style={styles.monthArrowText}>◀</Text>
                    </Pressable>
                    <Text style={styles.monthTitle}>
                      {format(salesMonthCursor, 'yyyy년 M월')}
                    </Text>
                    <Pressable
                      style={styles.monthArrow}
                      onPress={() =>
                        setSalesMonthCursor((prev) => addMonths(prev, 1))
                      }
                    >
                      <Text style={styles.monthArrowText}>▶</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={styles.monthPickerButton}
                    onPress={() => setMonthPickerOpen(true)}
                  >
                    <Text style={styles.monthPickerText}>년/월 선택</Text>
                  </Pressable>
                  <Modal transparent visible={monthPickerOpen} animationType="fade">
                    <Pressable
                      style={styles.menuOverlay}
                      onPress={() => setMonthPickerOpen(false)}
                    >
                      <View style={styles.monthPickerSheet}>
                        <Text style={styles.sectionTitle}>월 선택</Text>
                        <View style={styles.monthPickerGrid}>
                          {monthYears.map((year) => (
                            <View key={year} style={styles.monthPickerColumn}>
                              <Text style={styles.monthPickerYear}>{year}년</Text>
                              <View style={styles.monthPickerMonths}>
                                {Array.from({ length: 12 }, (_, idx) => idx + 1).map(
                                  (month) => {
                                    const date = new Date(year, month - 1, 1);
                                    const isActive =
                                      format(date, 'yyyy-MM') ===
                                      format(salesMonthCursor, 'yyyy-MM');
                                    return (
                                      <Pressable
                                        key={`${year}-${month}`}
                                        style={[
                                          styles.monthButton,
                                          isActive && styles.monthButtonActive,
                                        ]}
                                        onPress={() => {
                                          setSalesMonthCursor(startOfMonth(date));
                                          setMonthPickerOpen(false);
                                        }}
                                      >
                                        <Text
                                          style={[
                                            styles.monthText,
                                            isActive && styles.monthTextActive,
                                          ]}
                                        >
                                          {month}월
                                        </Text>
                                      </Pressable>
                                    );
                                  },
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    </Pressable>
                  </Modal>
                </View>

                <View style={styles.webCard}>
                  <Text style={styles.sectionTitle}>지점별 매출</Text>
                  <ScrollView horizontal>
                    <View>
                        <View style={styles.tableHeaderRow}>
                          <View
                            style={[
                              styles.tableCell,
                              styles.tableDateCell,
                              webDateCellStyle,
                            ]}
                          >
                            <Text style={styles.tableHeaderText}>날짜</Text>
                          </View>
                          {branches.map((branch) => (
                            <View
                              key={branch.id}
                              style={[styles.tableCell, webTableCellStyle]}
                            >
                              <Text style={styles.tableHeaderText}>
                                {branch.name}
                              </Text>
                            </View>
                          ))}
                          <View
                            style={[
                              styles.tableCell,
                              styles.tableTotalCell,
                              webTotalCellStyle,
                            ]}
                          >
                            <Text style={styles.tableHeaderText}>합계</Text>
                          </View>
                        </View>
                      {salesTableRows.map((row) => {
                        const isToday =
                          format(row.date, 'yyyy-MM-dd') ===
                          format(new Date(), 'yyyy-MM-dd');
                        return (
                          <View
                            key={row.key}
                            style={[styles.tableRow, isToday && styles.tableTodayRow]}
                          >
                            <View
                              style={[
                                styles.tableCell,
                                styles.tableDateCell,
                                webDateCellStyle,
                              ]}
                            >
                              <Text style={styles.tableCellText}>
                                {format(row.date, 'MM/dd')}
                              </Text>
                            </View>
                            {row.branchValues.map((value) => (
                              <View
                                key={value.id}
                                style={[
                                  styles.tableCell,
                                  webTableCellStyle,
                                  value.value == null && styles.tableEmptyCell,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.tableCellText,
                                    value.value == null &&
                                      styles.tableEmptyCellText,
                                  ]}
                                >
                                  {value.value == null
                                    ? '—'
                                    : formatTableValue(value.value)}
                                </Text>
                              </View>
                            ))}
                            <View
                              style={[
                                styles.tableCell,
                                styles.tableTotalCell,
                                webTotalCellStyle,
                              ]}
                            >
                              <Text style={styles.tableCellText}>
                                {row.total ? formatTableValue(row.total) : '—'}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  {salesLoading ? (
                    <Text style={styles.loadingText}>데이터 불러오는 중...</Text>
                  ) : null}
                </View>

                <View style={styles.webCard}>
                  <Text style={styles.sectionTitle}>월 요약</Text>
                  <Text style={styles.summaryValue}>
                    이번달 누적 합계: {formatAmount(salesMonthlySummary.total)}
                  </Text>
                  {branches.map((branch) => (
                    <Text key={branch.id} style={styles.summaryItem}>
                      {branch.name} {formatAmount(salesMonthlySummary.byBranch[branch.id] || 0)}
                    </Text>
                  ))}
                  <Text style={styles.summaryItem}>
                    전월 대비{' '}
                    {calcPercent(
                      salesMonthlySummary.total,
                      salesMonthlySummary.prevTotal,
                    ) == null
                      ? '-'
                      : formatSignedPercent(
                          calcPercent(
                            salesMonthlySummary.total,
                            salesMonthlySummary.prevTotal,
                          ),
                        )}
                  </Text>
                </View>
              </>
            ) : adminMenu === 'accounts' ? (
              <AdminPanel branches={branches} />
            ) : (
              <View style={styles.webCard}>
                <Text style={styles.sectionTitle}>준비중입니다</Text>
                <Text style={styles.webPlaceholder}>
                  선택한 메뉴는 다음 단계에서 구현됩니다.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  if (isAdmin && Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <Modal transparent visible={menuOpen} animationType="fade">
          <Pressable
            style={styles.menuOverlay}
            onPress={() => setMenuOpen(false)}
          >
            <View style={styles.menuSheet}>
              {adminMenus.map((item) => (
                <Pressable
                  key={item.key}
                  style={styles.menuItem}
                  onPress={() => {
                    setAdminMenu(item.key);
                    setMenuOpen(false);
                  }}
                >
                  <Text style={styles.menuItemText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Pressable style={styles.menuButton} onPress={() => setMenuOpen(true)}>
              <Text style={styles.menuButtonText}>☰</Text>
            </Pressable>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>{adminMenuTitle}</Text>
            </View>
            <Pressable
              style={styles.logout}
              onPress={() => supabase.auth.signOut()}
            >
              <Text style={styles.logoutText}>로그아웃</Text>
            </Pressable>
          </View>
          {renderAdminContent({ isMobileLayout: true })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: contentPaddingBottom },
        ]}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>지점 매출 현황</Text>
            <Text style={styles.subtitle}>
              {profile?.role === 'admin' ? '관리자' : '점장'} · {branchName}
            </Text>
          </View>
          <Pressable
            style={styles.logout}
            onPress={() => supabase.auth.signOut()}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>

        {activeTab === 'home' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>오늘 총매출</Text>
              <Text style={styles.cardValue}>{formatAmount(todayTotal)}</Text>
              {homeMissingBranches.length ? (
                <Text style={styles.cardNote}>
                  {homeMissingBranches.join(', ')} 제외
                </Text>
              ) : null}
              {homePercent != null ? (
                <Text style={styles.cardSub}>
                  전주 동일 요일 대비 {homePercent >= 0 ? '▲' : '▼'}{' '}
                  {formatSignedPercent(homePercent)}
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{branchName} 오늘 매출</Text>
              <Text style={styles.cardValue}>
                {formatAmount(homeBranchTotal)}
              </Text>
            </View>

            <LineChartSimple
              title="최근 14일 일매출"
              data={recent14Days}
              valueFormatter={formatMillions}
              showMinMax
              labelFormatter={(label) => label.split('/')[1] || label}
            />
            <BarChartSimple
              title="이번주 요일별 매출"
              data={weekdayTotals}
              valueFormatter={formatMillions}
              showMinMax
            />
          </>
        ) : activeTab === 'entry' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {format(new Date(), 'yyyy-MM-dd')} | {branchName}
              </Text>
              {isAdmin ? (
                <BranchPicker
                  branches={branches}
                  value={selectedBranchId}
                  onChange={setSelectedBranchId}
                  disabled={!isAdmin}
                />
              ) : null}

              <View style={styles.entryBlock}>
                <Text style={styles.entryLabel}>하루 매출</Text>
                {isEditingEntry ? (
                  <TextInput
                    style={styles.entryInput}
                    keyboardType="numeric"
                    placeholder="금액을 입력하세요"
                    value={entryDaily}
                    onChangeText={(value) =>
                      setEntryDaily(value.replace(/[^0-9]/g, ''))
                    }
                  />
                ) : (
                  <View style={styles.entryValueBox}>
                    <Text style={styles.entryValueText}>
                      {entryDaily ? formatAmount(Number(entryDaily)) : '-'}
                    </Text>
                  </View>
                )}
                <Pressable
                  style={styles.saveButton}
                  onPress={() =>
                    isEditingEntry
                      ? handleEntrySave(entryDaily)
                      : setIsEditingEntry(true)
                  }
                  disabled={entryLoading}
                >
                  <Text style={styles.saveButtonText}>
                    {isEditingEntry ? '저장' : '수정'}
                  </Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.withdrawRow}>
              <Pressable
                onPress={() => {
                  setWithdrawError('');
                  setWithdrawOpen(true);
                }}
              >
                <Text style={styles.withdrawText}>탈퇴하기</Text>
              </Pressable>
            </View>
            <Modal
              transparent
              visible={withdrawOpen}
              animationType="fade"
              onRequestClose={() => setWithdrawOpen(false)}
            >
              <Pressable
                style={styles.modalBackdrop}
                onPress={() => setWithdrawOpen(false)}
              >
                <View style={styles.modalSheet}>
                  <Text style={styles.modalTitle}>탈퇴하기</Text>
                  <Text style={styles.modalSubtitle}>
                    정말 탈퇴하시겠어요? 탈퇴 후 다시 로그인할 수 없습니다.
                  </Text>
                  {withdrawError ? (
                    <Text style={styles.modalError}>{withdrawError}</Text>
                  ) : null}
                  <View style={styles.modalButtonRow}>
                    <Pressable
                      style={[styles.modalButton, styles.modalCancelButton]}
                      onPress={() => setWithdrawOpen(false)}
                      disabled={withdrawLoading}
                    >
                      <Text style={styles.modalCancelText}>취소</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modalButton, styles.modalConfirmButton]}
                      onPress={handleWithdrawConfirm}
                      disabled={withdrawLoading}
                    >
                      <Text style={styles.modalConfirmText}>
                        {withdrawLoading ? '처리 중...' : '탈퇴'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            </Modal>
          </>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>내 매출 내역</Text>
              <Pressable
                style={styles.monthPickerButton}
                onPress={() => setHistoryMonthPickerOpen(true)}
              >
                <Text style={styles.monthPickerText}>년/월 선택</Text>
              </Pressable>
              <Modal
                transparent
                visible={historyMonthPickerOpen}
                animationType="fade"
              >
                <Pressable
                  style={styles.menuOverlay}
                  onPress={() => setHistoryMonthPickerOpen(false)}
                >
                  <View style={styles.monthPickerSheet}>
                    <Text style={styles.sectionTitle}>월 선택</Text>
                    <View style={styles.monthPickerGrid}>
                      {monthYears.map((year) => (
                        <View key={year} style={styles.monthPickerColumn}>
                          <Text style={styles.monthPickerYear}>{year}년</Text>
                          <View style={styles.monthPickerMonths}>
                            {Array.from({ length: 12 }, (_, idx) => idx + 1).map(
                              (month) => {
                                const date = new Date(year, month - 1, 1);
                                const isActive =
                                  format(date, 'yyyy-MM') ===
                                  format(monthCursor, 'yyyy-MM');
                                return (
                                  <Pressable
                                    key={`${year}-${month}`}
                                    style={[
                                      styles.monthButton,
                                      isActive && styles.monthButtonActive,
                                    ]}
                                    onPress={() => {
                                      setMonthCursor(startOfMonth(date));
                                      setHistoryMonthPickerOpen(false);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.monthText,
                                        isActive && styles.monthTextActive,
                                      ]}
                                    >
                                      {month}월
                                    </Text>
                                  </Pressable>
                                );
                              },
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </Pressable>
              </Modal>

              {historyTableRows.length ? (
                <View style={styles.webCard}>
                  <View style={styles.tableHeaderRow}>
                    <View style={[styles.tableCell, styles.tableDateCell]}>
                      <Text style={styles.tableHeaderText}>날짜</Text>
                    </View>
                    <View style={styles.tableCell}>
                      <Text style={styles.tableHeaderText}>{branchName}</Text>
                    </View>
                  </View>
                  {historyTableRows.map((row) => (
                    <View key={row.date} style={styles.tableRow}>
                      <View style={[styles.tableCell, styles.tableDateCell]}>
                        <Text style={styles.tableCellText}>
                          {format(parseKstDate(row.date), 'MM/dd')}
                        </Text>
                      </View>
                      <View style={styles.tableCell}>
                        {historyEditingDate === row.date ? (
                          <View style={styles.historyEditRow}>
                            <TextInput
                              style={styles.historyEditInput}
                              keyboardType="numeric"
                              value={historyEditingAmount}
                              onChangeText={(value) =>
                                setHistoryEditingAmount(value.replace(/[^0-9]/g, ''))
                              }
                            />
                            <Pressable
                              style={styles.historyEditButton}
                              onPress={() => handleHistorySave(row.date)}
                            >
                              <Text style={styles.historyEditButtonText}>저장</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            style={styles.historyValuePress}
                            onPress={() => {
                              setHistoryEditingDate(row.date);
                              setHistoryEditingAmount(
                                row.total == null ? '' : String(row.total),
                              );
                            }}
                          >
                            <Text style={styles.tableCellText}>
                              {row.total == null ? '-' : formatAmount(row.total)}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>등록된 내역이 없습니다.</Text>
              )}
            </View>
          </>
        )}

        {loading && activeTab === 'home' ? (
          <Text style={styles.loadingText}>데이터 불러오는 중...</Text>
        ) : null}
      </ScrollView>
      <View
        style={[
          styles.bottomTab,
          { paddingBottom: bottomTabPaddingBottom },
        ]}
      >
        {[
          { key: 'home', label: '홈' },
          { key: 'entry', label: '매출입력' },
          { key: 'history', label: '매출내역' },
        ].map((tab) => (
          <Pressable
            key={tab.key}
            style={[
              styles.bottomTabButton,
              activeTab === tab.key && styles.bottomTabButtonActive,
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.bottomTabText,
                activeTab === tab.key && styles.bottomTabTextActive,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f5f9',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 42,
    paddingBottom: 96,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingRight: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 14,
    color: '#667085',
    marginTop: 4,
  },
  logout: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  logoutText: {
    fontSize: 12,
    color: '#344054',
  },
  bottomTab: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
  },
  bottomTabButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  bottomTabButtonActive: {
    backgroundColor: '#eef2ff',
  },
  bottomTabText: {
    fontSize: 12,
    color: '#667085',
  },
  bottomTabTextActive: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    color: '#667085',
  },
  cardValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '700',
    color: '#101828',
  },
  cardSub: {
    marginTop: 6,
    color: '#667085',
    fontSize: 14,
  },
  cardNote: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  sectionNote: {
    fontSize: 12,
    color: '#94a3b8',
  },
  entryBlock: {
    marginTop: 12,
  },
  entryLabel: {
    fontSize: 13,
    color: '#667085',
    marginBottom: 6,
  },
  entryInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  entryValueBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
  },
  entryValueText: {
    color: '#101828',
    fontSize: 16,
    fontWeight: '600',
  },
  historyValuePress: {
    width: '100%',
    alignItems: 'center',
  },
  historyEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  historyEditInput: {
    flex: 1,
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  historyEditButton: {
    backgroundColor: '#101828',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  historyEditButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: '#101828',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  withdrawRow: {
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  withdrawText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#667085',
    marginTop: 6,
    marginBottom: 12,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalCancelButton: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    marginRight: 8,
  },
  modalConfirmButton: {
    backgroundColor: '#101828',
    marginLeft: 8,
  },
  modalCancelText: {
    color: '#344054',
    fontWeight: '600',
  },
  modalConfirmText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  modalError: {
    color: '#e63946',
    marginBottom: 8,
  },
  section: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 10,
  },
  monthRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  monthButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    marginRight: 8,
  },
  monthButtonActive: {
    backgroundColor: '#101828',
    borderColor: '#101828',
  },
  monthText: {
    color: '#667085',
  },
  monthTextActive: {
    color: '#ffffff',
  },
  dayBlock: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  dayTitle: {
    fontWeight: '700',
    color: '#101828',
    marginBottom: 8,
  },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  entryMeta: {
    color: '#667085',
  },
  entryAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryAmount: {
    color: '#101828',
    marginRight: 8,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    minWidth: 100,
  },
  editButton: {
    backgroundColor: '#101828',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 6,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 12,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  cancelButtonText: {
    fontSize: 12,
    color: '#344054',
  },
  emptyText: {
    color: '#667085',
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 16,
    color: '#667085',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#f3f5f9',
  },
  webLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 200,
    backgroundColor: '#101828',
    padding: 20,
  },
  sidebarTitle: {
    color: '#ffffff',
    fontWeight: '700',
    marginBottom: 16,
  },
  sidebarItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 6,
  },
  sidebarItemActive: {
    backgroundColor: '#1f2937',
  },
  sidebarItemText: {
    color: '#d0d5dd',
  },
  sidebarItemTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  webContent: {
    padding: 24,
    paddingLeft: 48,
  },
  webHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap',
    maxWidth: 1000,
  },
  kpiRowMobile: {
    width: '100%',
    justifyContent: 'space-between',
  },
  kpiCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    minWidth: 230,
  },
  kpiCardMobile: {
    width: '48%',
    maxWidth: '48%',
    minWidth: '48%',
    marginBottom: 12,
    minHeight: 86,
  },
  kpiTitle: {
    fontSize: 12,
    color: '#667085',
  },
  kpiValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  webCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    maxWidth: 1000,
  },
  webStickyBar: {
    backgroundColor: '#f3f5f9',
    paddingBottom: 12,
    marginBottom: 12,
  },
  webStickyRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  webStickyBlock: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    maxWidth: 850,
    flex: 1,
  },
  webStickyLabel: {
    fontSize: 12,
    color: '#667085',
    marginBottom: 8,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  periodButtonActive: {
    backgroundColor: '#101828',
    borderColor: '#101828',
  },
  periodText: {
    color: '#667085',
    fontSize: 13,
  },
  periodTextActive: {
    color: '#ffffff',
  },
  periodInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  periodInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    minWidth: 120,
  },
  periodDash: {
    marginHorizontal: 6,
    color: '#667085',
  },
  weekToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ratioRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ratioBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    flex: 1,
  },
  ratioLabel: {
    color: '#667085',
    fontSize: 12,
  },
  ratioValue: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthArrow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthArrowText: {
    color: '#344054',
    fontWeight: '700',
  },
  monthTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  compareName: {
    flex: 1,
    color: '#101828',
  },
  compareValue: {
    flex: 1,
    textAlign: 'center',
    color: '#101828',
  },
  compareTrend: {
    width: 64,
    textAlign: 'right',
    color: '#101828',
    fontSize: 12,
  },
  tableHeaderCell: {
    width: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableHeaderText: {
    color: '#667085',
    fontWeight: '700',
    textAlign: 'center',
  },
  tableCell: {
    width: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCellFlex: {
    flex: 1,
    minWidth: 140,
  },
  tableDateCell: {
    width: 80,
  },
  tableDateCellFlex: {
    width: 80,
  },
  tableDateCellMobile: {
    width: 90,
  },
  tableTotalCell: {
    width: 120,
  },
  tableTotalCellFlex: {
    width: 120,
  },
  tableTotalCellMobile: {
    width: 160,
  },
  tableCellText: {
    color: '#101828',
    textAlign: 'center',
    width: '100%',
  },
  tableEmptyCell: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    paddingVertical: 4,
  },
  tableEmptyCellText: {
    color: '#94a3b8',
  },
  tableTodayRow: {
    backgroundColor: '#fef9c3',
  },
  summaryValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  summaryItem: {
    marginTop: 4,
    color: '#667085',
  },
  branchFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  branchFilterButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  branchFilterButtonActive: {
    backgroundColor: '#101828',
    borderColor: '#101828',
  },
  branchFilterText: {
    color: '#667085',
    fontSize: 13,
  },
  branchFilterTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  tableCellMobile: {
    width: 200,
  },
  monthPickerButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  monthPickerText: {
    color: '#344054',
    fontWeight: '600',
  },
  monthPickerSheet: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    marginTop: 80,
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  monthPickerGrid: {
    marginTop: 12,
    gap: 12,
  },
  monthPickerColumn: {
    marginBottom: 12,
  },
  monthPickerYear: {
    fontWeight: '700',
    color: '#101828',
    marginBottom: 6,
  },
  monthPickerMonths: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  menuButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuButtonText: {
    fontSize: 28,
    color: '#101828',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
  },
  menuSheet: {
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  menuItem: {
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: '#101828',
  },
  webPlaceholder: {
    color: '#667085',
    marginTop: 8,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  tableCell: {
    color: '#101828',
    width: '33%',
  },
});
