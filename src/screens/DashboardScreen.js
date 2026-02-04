import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  { key: 'settings', label: '설정' },
];

const getTrendSymbol = (delta) => {
  if (delta == null) return '→';
  if (delta > 0) return '▲';
  if (delta < 0) return '▼';
  return '→';
};

const HANWOO_BRANCHES = ['한우대가 순천점', '한우대가 광양점'];
const MART_CAFE_BRANCHES = ['대가정육마트', '카페 일공구공'];

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

const isWithinIsoRange = (dateKey, startKey, endKey) =>
  dateKey >= startKey && dateKey <= endKey;

const buildWeekLunchDinnerSeries = (rows, weekEndDate, { requireAllCount } = {}) => {
  const lunchByDate = {};
  const dinnerByDate = {};
  const lunchCountByDate = {};
  const dinnerCountByDate = {};
  (rows || []).forEach((row) => {
    const mid =
      row.mid_amount == null || row.mid_amount === '' ? null : Number(row.mid_amount || 0);
    if (mid == null) return;
    const key = row.entry_date;
    lunchByDate[key] = (lunchByDate[key] || 0) + mid;
    lunchCountByDate[key] = (lunchCountByDate[key] || 0) + 1;
    if (row.amount != null) {
      const total = Number(row.amount || 0);
      const dinner = Math.max(0, total - mid);
      dinnerByDate[key] = (dinnerByDate[key] || 0) + dinner;
      dinnerCountByDate[key] = (dinnerCountByDate[key] || 0) + 1;
    }
  });
  const lunchSeries = [];
  const dinnerSeries = [];
  for (let i = 0; i < 7; i += 1) {
    const date = subDays(weekEndDate, 6 - i);
    const key = toISODate(date);
    const hasAllLunch =
      requireAllCount == null ? true : (lunchCountByDate[key] || 0) === requireAllCount;
    const hasAllDinner =
      requireAllCount == null ? true : (dinnerCountByDate[key] || 0) === requireAllCount;
    lunchSeries.push({
      label: WEEKDAY_LABELS[i],
      value: hasAllLunch ? lunchByDate[key] ?? null : null,
    });
    dinnerSeries.push({
      label: WEEKDAY_LABELS[i],
      value: hasAllDinner ? dinnerByDate[key] ?? null : null,
    });
  }
  return { lunchSeries, dinnerSeries };
};

const EntryAmountField = memo(function EntryAmountField({
  label,
  value,
  onChangeText,
  onBlur,
  placeholder = '금액을 입력하세요',
}) {
  return (
    <View style={styles.entryBlock}>
      <Text style={styles.entryLabel}>{label}</Text>
      <TextInput
        style={styles.entryInput}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor="#98a2b3"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
      />
    </View>
  );
});

export default function DashboardScreen({ session, profile, branches }) {
  const [selectedBranchId, setSelectedBranchId] = useState(
    profile?.branch_id || branches?.[0]?.id || null,
  );
  const [activeTab, setActiveTab] = useState('home');
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [todayTotal, setTodayTotal] = useState(null);
  const [branchTotals, setBranchTotals] = useState([]);
  const [entryTotal, setEntryTotal] = useState('');
  const [entryMid, setEntryMid] = useState('');
  const [entryTotalByBranch, setEntryTotalByBranch] = useState({});
  const [entryMidByBranch, setEntryMidByBranch] = useState({});
  const [entryAutoSaveNotice, setEntryAutoSaveNotice] = useState('');
  const [homeBranchTotals, setHomeBranchTotals] = useState({});
  const [homeUseYesterdayTotal, setHomeUseYesterdayTotal] = useState(false);
  const [homeUseYesterdayBranches, setHomeUseYesterdayBranches] = useState(false);
  const [recentSeriesByBranch, setRecentSeriesByBranch] = useState({});
  const [weekSeriesByBranch, setWeekSeriesByBranch] = useState({});
  const [monthCursor, setMonthCursor] = useState(startOfMonth(new Date()));
  const [monthlyEntries, setMonthlyEntries] = useState([]);
  const [monthlyTotalsByBranch, setMonthlyTotalsByBranch] = useState({});
  const [historyEditingDate, setHistoryEditingDate] = useState(null);
  const [historyEditingMid, setHistoryEditingMid] = useState('');
  const [historyEditingTotal, setHistoryEditingTotal] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [monthTotal, setMonthTotal] = useState(null);
  const [lastYearDayTotal, setLastYearDayTotal] = useState(null);
  const [recent14Days, setRecent14Days] = useState([]);
  const [weekdayTotals, setWeekdayTotals] = useState([]);
  const [weekdayTotalsDinner, setWeekdayTotalsDinner] = useState([]);
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
  const [branchAnalysisWeekdaysDinner, setBranchAnalysisWeekdaysDinner] = useState(
    [],
  );
  const [branchAnalysisWeekdaysDinnerLast, setBranchAnalysisWeekdaysDinnerLast] =
    useState([]);
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
  const [chartMinByBranch, setChartMinByBranch] = useState({});
  const [chartMinTotal, setChartMinTotal] = useState({
    recentMin: null,
    weekMin: null,
  });
  const [chartMinDrafts, setChartMinDrafts] = useState({});
  const [chartMinTotalDraft, setChartMinTotalDraft] = useState({
    recentMin: '',
    weekMin: '',
  });
  const [chartMinSaving, setChartMinSaving] = useState(false);
  const [chartMinError, setChartMinError] = useState('');
  const homeLoadingRef = useRef(false);
  const entryLoadingRef = useRef(false);
  const branchAnalysisRequestRef = useRef(0);
  const historyFocusRef = useRef(0);
  const historyAutoSaveRef = useRef(false);
  const entryAutoSaveRef = useRef(false);
  const entryAutoSaveTimerRef = useRef(null);
  const { width } = useWindowDimensions();
  const isWebCompact = Platform.OS === 'web' && width < 1280;
  const insets = useSafeAreaInsets();
  const contentPaddingBottom = 96 + insets.bottom;
  const bottomTabPaddingBottom = Math.max(10, insets.bottom);

  const isAdmin = profile?.role === 'admin';

  const branchesById = useMemo(() => {
    const map = {};
    (branches || []).forEach((branch) => {
      map[branch.id] = branch;
    });
    return map;
  }, [branches]);

  const managerBranchNames = useMemo(() => {
    if (isAdmin) return [];
    const currentName = branchesById[profile?.branch_id]?.name;
    if (!currentName) return [];
    if (HANWOO_BRANCHES.includes(currentName)) return HANWOO_BRANCHES;
    if (MART_CAFE_BRANCHES.includes(currentName)) return MART_CAFE_BRANCHES;
    return [currentName];
  }, [branchesById, isAdmin, profile?.branch_id]);

  const managerBranches = useMemo(() => {
    const filtered = branches.filter((branch) =>
      managerBranchNames.includes(branch.name),
    );
    const order = new Map(
      managerBranchNames.map((name, index) => [name, index]),
    );
    return filtered.sort(
      (a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99),
    );
  }, [branches, managerBranchNames]);
  const managerBranchIds = useMemo(
    () => managerBranches.map((branch) => branch.id),
    [managerBranches],
  );
  const managerGroup = useMemo(() => {
    if (managerBranchNames.some((name) => HANWOO_BRANCHES.includes(name))) {
      return 'hanwoo';
    }
    if (managerBranchNames.some((name) => MART_CAFE_BRANCHES.includes(name))) {
      return 'mart-cafe';
    }
    return 'single';
  }, [managerBranchNames]);

  const suncheonBranch = useMemo(
    () =>
      managerBranches.find((branch) => branch.name === '한우대가 순천점') ||
      branches.find((branch) => branch.name === '한우대가 순천점'),
    [branches, managerBranches],
  );
  const gwangyangBranch = useMemo(
    () =>
      managerBranches.find((branch) => branch.name === '한우대가 광양점') ||
      branches.find((branch) => branch.name === '한우대가 광양점'),
    [branches, managerBranches],
  );

  const branchName = useMemo(() => {
    const branch = branches?.find((item) => item.id === selectedBranchId);
    return branch?.name ?? '-';
  }, [branches, selectedBranchId]);

  const displayBranchName = useMemo(() => {
    if (isAdmin) return branchName;
    if (managerGroup === 'hanwoo') return '한우대가';
    if (managerGroup === 'mart-cafe') return '대가정육마트';
    return branchName;
  }, [branchName, isAdmin, managerGroup]);

  const hanwooWeekMinOverride = useMemo(() => {
    if (managerGroup !== 'hanwoo') return null;
    if (suncheonBranch?.id && chartMinByBranch[suncheonBranch.id]?.weekMin != null) {
      return chartMinByBranch[suncheonBranch.id].weekMin;
    }
    if (gwangyangBranch?.id && chartMinByBranch[gwangyangBranch.id]?.weekMin != null) {
      return chartMinByBranch[gwangyangBranch.id].weekMin;
    }
    return null;
  }, [chartMinByBranch, gwangyangBranch?.id, managerGroup, suncheonBranch?.id]);

  useEffect(() => {
    if (!selectedBranchId && branches?.length) {
      const fallbackId = isAdmin
        ? branches[0].id
        : managerBranchIds[0] || branches[0].id;
      setSelectedBranchId(fallbackId);
    }
  }, [branches, isAdmin, managerBranchIds, selectedBranchId]);

  useEffect(() => {
    if (isAdmin) return;
    if (!managerBranchIds.length) return;
    if (!selectedBranchId || !managerBranchIds.includes(selectedBranchId)) {
      setSelectedBranchId(managerBranchIds[0]);
    }
  }, [isAdmin, managerBranchIds, selectedBranchId]);

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
  const formatAmountPlain = (value) => (value == null ? '-' : formatCurrency(value));
  const formatMillions = (value) => {
    if (value == null) return '-';
    return `${(value / 1000000).toFixed(1)}M`;
  };
  const formatMillionsTwo = (value) => {
    if (value == null) return '-';
    return `${(value / 1000000).toFixed(2)}M`;
  };
  const formatMillionsPlain = (value) => {
    if (value == null) return '-';
    return (value / 1000000).toFixed(1);
  };
  const formatMillionsTwoPlain = (value) => {
    if (value == null) return '-';
    return (value / 1000000).toFixed(2);
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
    if (!branchIds?.length) {
      return { total: null, byBranch: {}, midByBranch: {}, amountByBranch: {} };
    }
    const { data, error } = await supabase
      .from('sales_entries')
      .select('branch_id, amount, mid_amount')
      .in('branch_id', branchIds)
      .eq('entry_date', toISODate(date));

    if (error) {
      console.warn(error.message);
      return { total: null, byBranch: {}, midByBranch: {}, amountByBranch: {} };
    }

    const totals = {};
    const midTotals = {};
    const amountTotals = {};
    let sum = 0;
    data?.forEach((row) => {
      const value =
        row.amount != null
          ? Number(row.amount || 0)
          : row.mid_amount != null
            ? Number(row.mid_amount || 0)
            : 0;
      totals[row.branch_id] = (totals[row.branch_id] || 0) + value;
      sum += value;
      if (row.mid_amount != null) {
        const midValue = Number(row.mid_amount || 0);
        midTotals[row.branch_id] = (midTotals[row.branch_id] || 0) + midValue;
      }
      if (row.amount != null) {
        const amountValue = Number(row.amount || 0);
        amountTotals[row.branch_id] = (amountTotals[row.branch_id] || 0) + amountValue;
      }
    });
    return {
      total: data?.length ? sum : null,
      byBranch: totals,
      midByBranch: midTotals,
      amountByBranch: amountTotals,
    };
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
      : managerBranchIds.length
        ? managerBranchIds
        : selectedBranchId
          ? [selectedBranchId]
          : [];
    if (!branchIds.length || (!isAdmin && !chartBranchIds.length)) {
      setLoading(false);
      return;
    }

    homeLoadingRef.current = true;
    setLoading(true);
    try {
      const today = new Date();
      const yesterday = subDays(today, 1);
      const lastWeek = subDays(today, 7);
      const lastWeekYesterday = subDays(yesterday, 7);
      let todayAmountMissingAny = false;
      let weekBaseDate = today;
      if (!isAdmin && managerBranchIds.length) {
        const { data: latestWeekData } = await supabase
          .from('sales_entries')
          .select('entry_date')
          .in('branch_id', managerBranchIds)
          .gte('entry_date', toISODate(subDays(today, 7)))
          .lte('entry_date', toISODate(addDays(today, 7)))
          .order('entry_date', { ascending: false })
          .limit(1);
        if (latestWeekData?.[0]?.entry_date) {
          const latestDate = parseKstDate(latestWeekData[0].entry_date);
          if (latestDate > today) {
            weekBaseDate = latestDate;
          }
        }
      }
      if (isAdmin) {
        const [
          { total, byBranch, midByBranch, amountByBranch },
          { total: lastWeekSum, byBranch: lastWeekByBranch, amountByBranch: lastWeekAmountByBranch },
          {
            total: yesterdayTotal,
            byBranch: yesterdayByBranch,
            midByBranch: yesterdayMidByBranch,
            amountByBranch: yesterdayAmountByBranch,
          },
          {
            total: lastWeekYesterdaySum,
            byBranch: lastWeekYesterdayByBranch,
            amountByBranch: lastWeekYesterdayAmountByBranch,
          },
        ] = await Promise.all([
          fetchTotalsByDate(today, branchIds),
          fetchTotalsByDate(lastWeek, branchIds),
          fetchTotalsByDate(yesterday, branchIds),
          fetchTotalsByDate(lastWeekYesterday, branchIds),
        ]);

        const missing = branches.filter((branch) => byBranch[branch.id] == null);
        const missingNames = missing.map((branch) => branch.name);
        const useYesterday = branches.every(
          (branch) =>
            byBranch[branch.id] == null && midByBranch[branch.id] == null,
        );
        const displayByBranch = useYesterday ? yesterdayByBranch : byBranch;
        const displayMidByBranch = useYesterday ? yesterdayMidByBranch : midByBranch;
        const displayAmountByBranch = useYesterday
          ? yesterdayAmountByBranch
          : amountByBranch;
        const comparePrevByBranch = useYesterday
          ? lastWeekYesterdayByBranch
          : lastWeekByBranch;
        const comparePrevAmountByBranch = useYesterday
          ? lastWeekYesterdayAmountByBranch
          : lastWeekAmountByBranch;
        setTodayTotal(useYesterday ? yesterdayTotal : total);
        setHomeUseYesterdayTotal(useYesterday);
        setHomeUseYesterdayBranches(useYesterday);

        setHomeMissingBranches(useYesterday ? [] : missingNames);

        if (selectedBranchId) {
          setHomeBranchTotal(displayByBranch[selectedBranchId] ?? null);
        } else {
          setHomeBranchTotal(null);
        }

        todayAmountMissingAny = branches.some(
          (branch) => displayAmountByBranch[branch.id] == null,
        );
        const lastWeekMissingAny = branches.some(
          (branch) => comparePrevAmountByBranch[branch.id] == null,
        );
        if (lastWeekMissingAny || todayAmountMissingAny || !branches.length) {
          setHomeComparePercent(null);
        } else {
          const reportedBranchIds = branches
            .filter((branch) => displayByBranch[branch.id] != null)
            .map((branch) => branch.id);
          if (!reportedBranchIds.length) {
            setHomeComparePercent(null);
          } else {
            const compareTodaySum = reportedBranchIds.reduce(
              (sum, id) => sum + Number(displayByBranch[id] || 0),
              0,
            );
            const compareLastWeekSum = reportedBranchIds.reduce(
              (sum, id) => sum + Number(comparePrevByBranch[id] || 0),
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
          const current = displayByBranch[branch.id] ?? null;
          const mid = displayMidByBranch[branch.id] ?? null;
          const prev = comparePrevByBranch[branch.id] ?? null;
          const delta = current != null && prev != null ? current - prev : null;
          return {
            id: branch.id,
            name: branch.name,
            total: current,
            mid,
            prev,
            delta,
          };
        });
        setBranchTotals(list);
      } else {
        const [
          { total: ownTotal, byBranch: ownByBranch, amountByBranch: ownAmountByBranch },
          {
            total: yesterdayOwnTotal,
            byBranch: yesterdayOwnByBranch,
            amountByBranch: yesterdayAmountByBranch,
          },
          rollup,
          rollupYesterday,
        ] = await Promise.all([
          fetchTotalsByDate(today, chartBranchIds),
          fetchTotalsByDate(yesterday, chartBranchIds),
          supabase.rpc('get_home_rollup', { target_date: toISODate(today) }),
          supabase.rpc('get_home_rollup', { target_date: toISODate(yesterday) }),
        ]);

        const ownAmountMissingAll = managerBranchIds.every(
          (branchId) => ownAmountByBranch[branchId] == null,
        );
        const displayOwnByBranch = ownAmountMissingAll
          ? yesterdayAmountByBranch
          : ownAmountByBranch;
        if (displayOwnByBranch) {
          setHomeBranchTotal(displayOwnByBranch[selectedBranchId] ?? null);
          setHomeBranchTotals(displayOwnByBranch);
        } else {
          setHomeBranchTotal(null);
          setHomeBranchTotals({});
        }
        setHomeUseYesterdayBranches(ownAmountMissingAll);

        if (!rollup?.error) {
          const row = rollup?.data?.[0];
          const missingNames = row?.missing_branches || [];
          const noOneReported = missingNames.length === branches.length;
          if ((noOneReported || ownAmountMissingAll) && !rollupYesterday?.error) {
            const yesterdayRow = rollupYesterday?.data?.[0];
            setTodayTotal(yesterdayRow?.today_total ?? null);
            setHomeComparePercent(yesterdayRow?.compare_percent ?? null);
            setHomeMissingBranches([]);
            setHomeUseYesterdayTotal(true);
          } else {
            setTodayTotal(row?.today_total ?? null);
            setHomeMissingBranches(missingNames);
            setHomeComparePercent(row?.compare_percent ?? null);
            setHomeUseYesterdayTotal(false);
          }
        } else {
          setTodayTotal(ownAmountMissingAll ? yesterdayOwnTotal : ownTotal);
          setHomeMissingBranches([]);
          setHomeComparePercent(null);
          setHomeUseYesterdayTotal(ownAmountMissingAll);
        }
        setBranchTotals([]);
      }

      const recentStart = subDays(today, 9);
      const recentEnd = today;
      const weekStart = startOfWeek(weekBaseDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekBaseDate, { weekStartsOn: 1 });

      const weekRangeStart = subDays(weekStart, 7);
      const weekRangeEnd = weekEnd;
      const [recentData, weekRangeData] = await Promise.all([
        supabase
          .from('sales_entries')
          .select('entry_date, amount, branch_id')
          .in('branch_id', chartBranchIds)
          .gte('entry_date', toISODate(recentStart))
          .lte('entry_date', toISODate(recentEnd)),
        supabase
          .from('sales_entries')
          .select('entry_date, amount, mid_amount, branch_id')
          .in('branch_id', chartBranchIds)
          .gte('entry_date', toISODate(weekRangeStart))
          .lte('entry_date', toISODate(weekRangeEnd)),
      ]);

      if (!recentData.error) {
        if (isAdmin) {
          const totalByDate = {};
          const countByDate = {};
          (recentData.data || []).forEach((row) => {
            if (row.amount == null) return;
            totalByDate[row.entry_date] =
              (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
            countByDate[row.entry_date] = (countByDate[row.entry_date] || 0) + 1;
          });
          const series = [];
          for (let i = 9; i >= 0; i -= 1) {
            const date = subDays(today, i);
            const key = toISODate(date);
            const total = totalByDate[key];
            const hasAllBranches =
              (countByDate[key] || 0) === branches.length;
            series.push({
              label: format(date, 'M/d'),
              value: hasAllBranches ? total : null,
            });
          }
          setRecent14Days(series);
          setRecentSeriesByBranch({});
        } else {
          const totalsByBranch = {};
          (recentData.data || []).forEach((row) => {
            if (row.amount == null) return;
            if (!totalsByBranch[row.branch_id]) {
              totalsByBranch[row.branch_id] = {};
            }
            totalsByBranch[row.branch_id][row.entry_date] =
              (totalsByBranch[row.branch_id][row.entry_date] || 0) +
              Number(row.amount || 0);
          });
          const branchSeries = {};
          managerBranchIds.forEach((branchId) => {
            const series = [];
            for (let i = 9; i >= 0; i -= 1) {
              const date = subDays(today, i);
              const key = toISODate(date);
              const total = totalsByBranch[branchId]?.[key];
              series.push({
                label: format(date, 'M/d'),
                value: total ?? null,
              });
            }
            branchSeries[branchId] = series;
          });
          setRecentSeriesByBranch(branchSeries);
        }
      }

      if (!weekRangeData.error) {
        const weekStartKey = toISODate(weekStart);
        const weekEndKey = toISODate(weekEnd);
        let rows = weekRangeData.data || [];
        const thisWeekRows = rows.filter((row) =>
          isWithinIsoRange(row.entry_date, weekStartKey, weekEndKey),
        );
        if (isAdmin) {
          const adminReportBranchIds = branches
            .filter((branch) => branch.name !== '카페 일공구공')
            .map((branch) => branch.id);
          const reportIdSet = new Set(adminReportBranchIds);
          const thisWeekReportRows = thisWeekRows.filter((row) =>
            reportIdSet.has(row.branch_id),
          );
          const { lunchSeries, dinnerSeries } = buildWeekLunchDinnerSeries(
            thisWeekReportRows,
            weekEnd,
            { requireAllCount: adminReportBranchIds.length },
          );
          setWeekdayTotals(lunchSeries);
          setWeekdayTotalsDinner(dinnerSeries);
        } else {
          const byBranch = {};
          managerBranchIds.forEach((branchId) => {
            const branchRows = thisWeekRows.filter(
              (row) => row.branch_id === branchId,
            );
            const { lunchSeries, dinnerSeries } = buildWeekLunchDinnerSeries(
              branchRows,
              weekEnd,
            );
            byBranch[branchId] = { lunch: lunchSeries, dinner: dinnerSeries };
          });
          setWeekSeriesByBranch(byBranch);
        }
      }

      if (isAdmin) {
        const monthEndDate =
          homeUseYesterdayTotal || homeUseYesterdayBranches ? yesterday : today;
        const monthStart = startOfMonth(monthEndDate);
        const monthEnd = monthEndDate;
        const lastYearSameDay =
          findSameWeekdayInLastYear(monthEndDate) || subYears(monthEndDate, 1);
        const lastYearDayTotals = await fetchTotalsByDate(
          lastYearSameDay,
          branchIds,
        );
        const lastYearMissingAny = branches.some(
          (branch) => lastYearDayTotals.amountByBranch[branch.id] == null,
        );
        const monthSum = await fetchTotalsByRange(monthStart, monthEnd, branchIds);
        setMonthTotal(monthSum);
        setLastYearDayTotal(
          lastYearMissingAny || todayAmountMissingAny ? null : lastYearDayTotals.total,
        );
      }
    } finally {
      homeLoadingRef.current = false;
      setLoading(false);
    }
  }, [
    branches,
    isAdmin,
    managerBranchIds,
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
      if (periodType === 'week' || periodType === 'month') {
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
          fetchTotalsByRange(start, effectiveEnd, [branchAnalysisId]),
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

      const recentStart = subDays(today, 9);
      const recentPrevStart = subDays(recentStart, 7);
      const recentPrevEnd = subDays(today, 7);
      const recentYearStart =
        findSameWeekdayInLastYear(recentStart) || subYears(recentStart, 1);
      const recentYearEnd =
        findSameWeekdayInLastYear(today) || subYears(today, 1);

      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      const weekRangeStart = subDays(weekStart, 7);
      const weekRangeEnd = weekEnd;
      const [recentData, recentPrevData, recentYearData, weekRangeData] =
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
            .select('entry_date, amount, mid_amount')
            .eq('branch_id', branchAnalysisId)
            .gte('entry_date', toISODate(weekRangeStart))
            .lte('entry_date', toISODate(weekRangeEnd)),
        ]);

      if (requestId !== branchAnalysisRequestRef.current) return;
      if (!recentData.error) {
        const totalByDate = {};
        (recentData.data || []).forEach((row) => {
          totalByDate[row.entry_date] =
            (totalByDate[row.entry_date] || 0) + Number(row.amount || 0);
        });
        const series = [];
        for (let i = 9; i >= 0; i -= 1) {
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
        for (let i = 9; i >= 0; i -= 1) {
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
        for (let i = 9; i >= 0; i -= 1) {
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

      if (!weekRangeData.error) {
        const weekStartKey = toISODate(weekStart);
        const weekEndKey = toISODate(weekEnd);
        const lastWeekStart = subDays(weekStart, 7);
        const lastWeekEnd = subDays(weekEnd, 7);
        const lastWeekStartKey = toISODate(lastWeekStart);
        const lastWeekEndKey = toISODate(lastWeekEnd);
        const rows = weekRangeData.data || [];
        const thisWeekRows = rows.filter((row) =>
          isWithinIsoRange(row.entry_date, weekStartKey, weekEndKey),
        );
        const lastWeekRows = rows.filter((row) =>
          isWithinIsoRange(row.entry_date, lastWeekStartKey, lastWeekEndKey),
        );
        const { lunchSeries, dinnerSeries } = buildWeekLunchDinnerSeries(
          thisWeekRows,
          weekEnd,
        );
        setBranchAnalysisWeekdays(lunchSeries);
        setBranchAnalysisWeekdaysDinner(dinnerSeries);
        const lastWeekSeries = buildWeekLunchDinnerSeries(
          lastWeekRows,
          lastWeekEnd,
        );
        setBranchAnalysisWeekdaysLast(lastWeekSeries.lunchSeries);
        setBranchAnalysisWeekdaysDinnerLast(lastWeekSeries.dinnerSeries);
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
    const entryBranchIds = isAdmin
      ? selectedBranchId
        ? [selectedBranchId]
        : []
      : managerBranchIds;
    if (!entryBranchIds.length) return;
    const today = new Date();
    const { data, error } = await supabase
      .from('sales_entries')
      .select('branch_id, amount, mid_amount')
      .in('branch_id', entryBranchIds)
      .eq('entry_date', toISODate(today));
    if (error) {
      console.warn(error.message);
      return;
    }
    const totals = {};
    const mids = {};
    (data || []).forEach((row) => {
      const total = row.amount ?? null;
      const mid = row.mid_amount ?? null;
      const totalValue =
        total == null || (total === 0 && mid != null) ? '' : String(total);
      totals[row.branch_id] = totalValue;
      mids[row.branch_id] = mid != null ? String(mid) : '';
    });
    if (isAdmin) {
      const total = totals[selectedBranchId] ?? '';
      const mid = mids[selectedBranchId] ?? '';
      setEntryTotal(total);
      setEntryMid(mid);
    } else {
      setEntryTotalByBranch(totals);
      setEntryMidByBranch(mids);
    }
  }, [isAdmin, managerBranchIds, selectedBranchId]);

  const loadMonthlyEntries = useCallback(async () => {
    if (entryLoadingRef.current) return;
    if (!selectedBranchId) return;
    entryLoadingRef.current = true;
    const monthStart = startOfMonth(monthCursor);
    const monthEnd = endOfMonth(monthCursor);
    const { data, error } = await supabase
      .from('sales_entries')
      .select('entry_date, amount, mid_amount')
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
    if (!isAdmin && managerBranchIds.length) {
      const { data: totalsData, error: totalsError } = await supabase
        .from('sales_entries')
        .select('branch_id, amount')
        .in('branch_id', managerBranchIds)
        .gte('entry_date', toISODate(monthStart))
        .lte('entry_date', toISODate(monthEnd));
      if (totalsError) {
        console.warn(totalsError.message);
        setMonthlyTotalsByBranch({});
      } else {
        const totals = {};
        (totalsData || []).forEach((row) => {
          if (row.amount == null) return;
          totals[row.branch_id] = (totals[row.branch_id] || 0) + Number(row.amount || 0);
        });
        setMonthlyTotalsByBranch(totals);
      }
    } else {
      setMonthlyTotalsByBranch({});
    }
    entryLoadingRef.current = false;
  }, [isAdmin, managerBranchIds, monthCursor, selectedBranchId]);

  const loadChartMinSettings = useCallback(async () => {
    if (!branches.length) return;
    const { data, error } = await supabase
      .from('chart_min_settings')
      .select('scope, branch_id, recent_min, week_min');
    if (error) {
      console.warn(error.message);
      return;
    }
    const byBranch = {};
    let total = { recentMin: null, weekMin: null };
    (data || []).forEach((row) => {
      if (row.scope === 'total') {
        total = {
          recentMin: row.recent_min ?? null,
          weekMin: row.week_min ?? null,
        };
      } else if (row.branch_id) {
        byBranch[row.branch_id] = {
          recentMin: row.recent_min ?? null,
          weekMin: row.week_min ?? null,
        };
      }
    });
    setChartMinByBranch(byBranch);
    setChartMinTotal(total);
    const nextDrafts = {};
    const fallbackTotalRecent = 25000000;
    branches.forEach((branch) => {
      const branchSettings = byBranch[branch.id] || {};
      const fallbackBranch =
        branch.name === '대가정육마트'
          ? { recentMin: 8000000, weekMin: 4000000 }
          : { recentMin: null, weekMin: null };
      nextDrafts[branch.id] = {
        recentMin:
          branchSettings.recentMin == null
            ? fallbackBranch.recentMin == null
              ? ''
              : String(fallbackBranch.recentMin)
            : String(branchSettings.recentMin),
        weekMin:
          branchSettings.weekMin == null
            ? fallbackBranch.weekMin == null
              ? ''
              : String(fallbackBranch.weekMin)
            : String(branchSettings.weekMin),
      };
    });
    const suncheon = branches.find((branch) => branch.name === '한우대가 순천점');
    const gwangyang = branches.find((branch) => branch.name === '한우대가 광양점');
    if (suncheon && gwangyang) {
      const baseDraft =
        nextDrafts[suncheon.id] ||
        nextDrafts[gwangyang.id] || { recentMin: '', weekMin: '' };
      nextDrafts[suncheon.id] = { ...baseDraft };
      nextDrafts[gwangyang.id] = { ...baseDraft };
    }
    setChartMinDrafts(nextDrafts);
    setChartMinTotalDraft({
      recentMin:
        total.recentMin == null ? String(fallbackTotalRecent) : String(total.recentMin),
      weekMin: total.weekMin == null ? '' : String(total.weekMin),
    });
  }, [branches, supabase]);

  useEffect(() => {
    if (activeTab !== 'home') return;
    loadHomeData();
  }, [
    activeTab,
    refreshKey,
    selectedBranchId,
    isAdmin,
    branches.length,
    managerBranchIds.length,
  ]);

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
        .select('entry_date, amount, mid_amount, branch_id')
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
      const midsByDate = {};
      const branchTotals = {};
      (data || []).forEach((row) => {
        const key = row.entry_date;
        totalsByDate[key] = totalsByDate[key] || {};
        midsByDate[key] = midsByDate[key] || {};
        totalsByDate[key][row.branch_id] =
          (totalsByDate[key][row.branch_id] || 0) + Number(row.amount || 0);
        if (row.mid_amount != null) {
          midsByDate[key][row.branch_id] =
            (midsByDate[key][row.branch_id] || 0) + Number(row.mid_amount || 0);
        }
        branchTotals[row.branch_id] =
          (branchTotals[row.branch_id] || 0) + Number(row.amount || 0);
      });

      const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
      const rows = days.map((date) => {
        const key = toISODate(date);
        const amountByBranch = {};
        const midByBranch = {};
        branches.forEach((branch) => {
          amountByBranch[branch.id] = totalsByDate[key]?.[branch.id] ?? null;
          midByBranch[branch.id] = midsByDate[key]?.[branch.id] ?? null;
        });
        const totalAmount = Object.values(amountByBranch).reduce(
          (sum, value) => sum + (value || 0),
          0,
        );
        const totalMid = Object.values(midByBranch).reduce(
          (sum, value) => sum + (value || 0),
          0,
        );
        return { date, key, amountByBranch, midByBranch, totalAmount, totalMid };
      });

      const today = new Date();
      const compareEnd =
        format(monthStart, 'yyyy-MM') === format(today, 'yyyy-MM')
          ? today
          : monthEnd;
      const prevMonthStart = startOfMonth(subMonths(monthStart, 1));
      let prevMonthEnd = addDays(prevMonthStart, compareEnd.getDate() - 1);
      const prevMonthEndCap = endOfMonth(prevMonthStart);
      if (prevMonthEnd > prevMonthEndCap) {
        prevMonthEnd = prevMonthEndCap;
      }
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

  useEffect(() => {
    if (!branches.length) return;
    loadChartMinSettings();
  }, [branches.length, loadChartMinSettings]);

  useEffect(() => {
    return () => {
      if (entryAutoSaveTimerRef.current) {
        clearTimeout(entryAutoSaveTimerRef.current);
      }
    };
  }, []);

  const showEntryAutoSaveNotice = useCallback((message) => {
    if (entryAutoSaveTimerRef.current) {
      clearTimeout(entryAutoSaveTimerRef.current);
    }
    setEntryAutoSaveNotice(message);
    entryAutoSaveTimerRef.current = setTimeout(() => {
      setEntryAutoSaveNotice('');
    }, 1500);
  }, []);

  const handleEntryAutoSave = async (branchId) => {
    if (entryAutoSaveRef.current) return;
    if (!branchId) return;
    const nextMid = isAdmin
      ? entryMid
        ? Number(entryMid)
        : null
      : entryMidByBranch[branchId]
        ? Number(entryMidByBranch[branchId])
        : null;
    const nextTotal = isAdmin
      ? entryTotal
        ? Number(entryTotal)
        : null
      : entryTotalByBranch[branchId]
        ? Number(entryTotalByBranch[branchId])
        : null;
    if (nextMid == null && nextTotal == null) return;
    if (nextMid != null && nextTotal != null && nextMid > nextTotal) return;
    entryAutoSaveRef.current = true;
    try {
      const payload = {
        branch_id: branchId,
        entry_date: toISODate(new Date()),
        amount: nextTotal,
        mid_amount: nextMid,
      };
      const { error } = await supabase
        .from('sales_entries')
        .upsert(payload, {
          onConflict: 'branch_id,entry_date',
        });
      if (error) throw error;
      setRefreshKey((prev) => prev + 1);
      showEntryAutoSaveNotice('자동 저장됨');
    } catch (err) {
      Alert.alert('자동 저장 실패', err.message ?? '잠시 후 다시 시도해주세요.');
      showEntryAutoSaveNotice('저장 실패');
    } finally {
      entryAutoSaveRef.current = false;
    }
  };


  const handleHistorySave = async (date) => {
    if (!selectedBranchId) {
      Alert.alert('지점을 먼저 선택해주세요.');
      return;
    }
    const nextMid = historyEditingMid ? Number(historyEditingMid) : null;
    const nextTotal = historyEditingTotal ? Number(historyEditingTotal) : null;
    if (nextMid == null && nextTotal == null) {
      Alert.alert('금액을 입력해주세요.');
      return;
    }
    if (nextMid != null && nextTotal != null && nextMid > nextTotal) {
      Alert.alert('총매출은 중간매출보다 크거나 같아야 합니다.');
      return;
    }
    try {
      const { error } = await supabase
        .from('sales_entries')
        .upsert(
          {
            branch_id: selectedBranchId,
            entry_date: date,
            amount: nextTotal,
            mid_amount: nextMid,
          },
          { onConflict: 'branch_id,entry_date' },
        );
      if (error) throw error;
      setHistoryEditingDate(null);
      setHistoryEditingMid('');
      setHistoryEditingTotal('');
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      Alert.alert('수정 실패', err.message ?? '잠시 후 다시 시도해주세요.');
    }
  };

  const handleHistoryAutoSave = async (date) => {
    if (historyAutoSaveRef.current) return;
    const nextMid = historyEditingMid ? Number(historyEditingMid) : null;
    const nextTotal = historyEditingTotal ? Number(historyEditingTotal) : null;
    if (nextMid == null && nextTotal == null) return;
    if (nextMid != null && nextTotal != null && nextMid > nextTotal) return;
    historyAutoSaveRef.current = true;
    try {
      const { error } = await supabase
        .from('sales_entries')
        .upsert(
          {
            branch_id: selectedBranchId,
            entry_date: date,
            amount: nextTotal,
            mid_amount: nextMid,
          },
          { onConflict: 'branch_id,entry_date' },
        );
      if (error) throw error;
      setHistoryEditingDate(null);
      setHistoryEditingMid('');
      setHistoryEditingTotal('');
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      Alert.alert('자동 저장 실패', err.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      historyAutoSaveRef.current = false;
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

  const handleChartMinSave = async () => {
    if (!isAdmin) return;
    setChartMinSaving(true);
    setChartMinError('');
    try {
      const totalPayload = {
        scope: 'total',
        branch_id: null,
        scope_key: 'total',
        recent_min: chartMinTotalDraft.recentMin
          ? Number(chartMinTotalDraft.recentMin)
          : null,
        week_min: chartMinTotalDraft.weekMin
          ? Number(chartMinTotalDraft.weekMin)
          : null,
      };
      const { error: totalError } = await supabase
        .from('chart_min_settings')
        .upsert(totalPayload, { onConflict: 'scope_key' });
      if (totalError) throw totalError;

      const branchPayload = branches.map((branch) => {
        const draft = chartMinDrafts[branch.id] || {};
        return {
          scope: 'branch',
          branch_id: branch.id,
          scope_key: branch.id,
          recent_min: draft.recentMin ? Number(draft.recentMin) : null,
          week_min: draft.weekMin ? Number(draft.weekMin) : null,
        };
      });
      const { error: branchError } = await supabase
        .from('chart_min_settings')
        .upsert(branchPayload, { onConflict: 'scope_key' });
      if (branchError) throw branchError;

      await loadChartMinSettings();
    } catch (err) {
      setChartMinError(err.message ?? '저장에 실패했습니다.');
    } finally {
      setChartMinSaving(false);
    }
  };

  const historyTableRows = useMemo(() => {
    const entriesByDate = {};
    monthlyEntries.forEach((entry) => {
      entriesByDate[entry.entry_date] = {
        total: entry.amount == null ? null : Number(entry.amount || 0),
        mid: entry.mid_amount == null ? null : Number(entry.mid_amount || 0),
      };
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
        const entry = entriesByDate[date];
        return { date, total: entry?.total ?? null, mid: entry?.mid ?? null };
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
  const defaultTotalMinOverrides = { recentMin: 25000000, weekMin: null };
  const defaultBranchOverrides =
    branchName === '대가정육마트'
      ? { recentMin: 8000000, weekMin: 4000000 }
      : null;
  const branchMinOverrides = selectedBranchId
    ? chartMinByBranch[selectedBranchId] || null
    : null;
  const branchAnalysisMinOverrides = branchAnalysisId
    ? chartMinByBranch[branchAnalysisId] || null
    : null;
  const managerMinOverrides = {
    recent14Min: branchMinOverrides?.recentMin ?? defaultBranchOverrides?.recentMin ?? null,
    weekMin: branchMinOverrides?.weekMin ?? defaultBranchOverrides?.weekMin ?? null,
  };
  const branchAnalysisOverrides = {
    recentMin:
      branchAnalysisMinOverrides?.recentMin ?? defaultBranchOverrides?.recentMin ?? null,
    weekMin:
      branchAnalysisMinOverrides?.weekMin ?? defaultBranchOverrides?.weekMin ?? null,
  };
  const totalMinOverrides = {
    recentMin: chartMinTotal.recentMin ?? defaultTotalMinOverrides.recentMin,
    weekMin: chartMinTotal.weekMin ?? defaultTotalMinOverrides.weekMin,
  };
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
              <Text style={styles.kpiTitle}>
                {homeUseYesterdayTotal ? '어제' : '오늘'} 총매출
              </Text>
              <Text style={styles.kpiValue}>{formatAmountPlain(todayTotal)}</Text>
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
              <Text style={styles.kpiValue}>{formatAmountPlain(monthTotal)}</Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전년 대비</Text>
              <Text style={styles.kpiValue}>
                {lastYearDayTotal == null ||
                todayTotal == null ||
                lastYearDayTotal === 0
                  ? '-'
                  : formatSignedPercent(
                      ((todayTotal - lastYearDayTotal) / lastYearDayTotal) * 100,
                    )}
              </Text>
            </View>
          </View>

          <View style={styles.webCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                지점별 비교{homeUseYesterdayTotal ? ' (어제)' : ''}
              </Text>
              <Text style={styles.sectionNote}>전주 같은 요일 대비</Text>
            </View>
            {branchTotals.map((branch) => (
              <View key={branch.id} style={styles.compareRow}>
                <Text style={styles.compareName} numberOfLines={1}>
                  {branch.name}
                </Text>
                <Text style={styles.compareValue}>
                  {formatMillionsTwo(branch.mid)}
                </Text>
                <Text style={styles.compareValue}>
                  {formatMillionsTwo(branch.total)}
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
            title="최근 10일 일매출"
            data={recent14Days}
            maxWidth={1000}
            labelFormatter={(label) => label.split('/')[1] || label}
            showPointLabels={Platform.OS === 'web'}
            valueFormatter={formatMillionsPlain}
            showMinMax
              minOverride={totalMinOverrides.recentMin ?? null}
            showMinLeft
          />
          <BarChartSimple
            title="이번주 점심, 저녁 매출"
            data={weekdayTotalsDinner}
            compareData={weekdayTotals}
            maxWidth={1000}
            valueFormatter={formatMillionsPlain}
            showMinMax
            minOverride={totalMinOverrides.weekMin ?? null}
            primaryLabel="저녁"
            compareLabel="점심"
            showLegend
            showMinLeft
            compareFirst
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
              <View style={styles.weekToggleRowInline}>
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
            <View style={styles.weekToggleRowInline}>
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
              <Text style={styles.kpiTitle}>총매출</Text>
              <Text style={styles.kpiValue}>
                {formatAmountPlain(periodSummary.total)}
              </Text>
            </View>
            <View
              style={[
                styles.kpiCard,
                isMobileLayout && styles.kpiCardMobile,
              ]}
            >
              <Text style={styles.kpiTitle}>전주 대비</Text>
              <Text style={styles.kpiValue}>
                {formatAmountPlain(periodSummary.prev)}
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
                {formatAmountPlain(periodSummary.lastMonth)}
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
              <Text style={styles.kpiTitle}>전년 대비</Text>
              <Text style={styles.kpiValue}>
                {formatAmountPlain(periodSummary.lastYear)}
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
            title="최근 10일 일매출"
            data={branchAnalysisRecent14}
            maxWidth={1000}
            labelFormatter={(label) => label.split('/')[1] || label}
            showPointLabels
            valueFormatter={formatMillionsPlain}
            showMinMax
            minOverride={branchAnalysisOverrides.recentMin ?? null}
            showMinLeft
          />
          <View style={styles.webCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitleInline}>요일별 점심, 저녁 매출</Text>
              <View style={styles.periodRow}>
                {[
                  { key: 'this', label: '이번주' },
                  { key: 'last', label: '전주' },
                ].map((item) => (
                  <Pressable
                    key={item.key}
                    onPress={() => setWeekdayMode(item.key)}
                    style={[
                      styles.weekToggleButton,
                      weekdayMode === item.key && styles.weekToggleButtonActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.weekToggleText,
                        weekdayMode === item.key && styles.weekToggleTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <BarChartSimple
              title="요일별 점심, 저녁 매출"
              data={
                weekdayMode === 'this'
                  ? branchAnalysisWeekdaysDinner
                  : branchAnalysisWeekdaysDinnerLast
              }
              compareData={
                weekdayMode === 'this'
                  ? branchAnalysisWeekdays
                  : branchAnalysisWeekdaysLast
              }
              maxWidth={1000}
              valueFormatter={formatMillionsPlain}
              showMinMax
              minOverride={branchAnalysisOverrides.weekMin ?? null}
              primaryLabel="저녁"
              compareLabel="점심"
              showLegend
              showMinLeft
              compareFirst
              hideTitle
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
      const isAllBranches = salesBranchFilter === 'all';
      const selectedBranch = orderedBranches.find(
        (branch) => branch.id === salesBranchFilter,
      );
      const cellValueFormatter =
        Platform.OS === 'web' ? formatMillionsTwo : formatAmount;
      const mobileCellStyle = isMobileLayout ? styles.tableCellMobile : null;
      const mobileDateStyle = isMobileLayout ? styles.tableDateCellMobile : null;
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
              <View style={styles.branchSalesTable}>
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
                  <View style={[styles.tableCell, mobileCellStyle, styles.branchSalesValueCell]}>
                    <Text style={styles.tableHeaderText}>점심</Text>
                  </View>
                  <View style={[styles.tableCell, mobileCellStyle, styles.branchSalesValueCell]}>
                    <Text style={styles.tableHeaderText}>총매출</Text>
                  </View>
                </View>
                {salesTableRows.map((row) => {
                  const isToday =
                    format(row.date, 'yyyy-MM-dd') ===
                    format(new Date(), 'yyyy-MM-dd');
                  const targetBranchId = isAllBranches
                    ? null
                    : selectedBranch?.id;
                  const midValue = targetBranchId
                    ? row.midByBranch[targetBranchId]
                    : row.totalMid || null;
                  const totalValue = targetBranchId
                    ? row.amountByBranch[targetBranchId]
                    : row.totalAmount || null;
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
                      <View
                        style={[
                          styles.tableCell,
                          mobileCellStyle,
                          styles.branchSalesValueCell,
                          midValue == null && styles.tableEmptyCell,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tableCellText,
                            midValue == null && styles.tableEmptyCellText,
                          ]}
                          numberOfLines={1}
                        >
                          {midValue == null ? '—' : cellValueFormatter(midValue)}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.tableCell,
                          mobileCellStyle,
                          styles.branchSalesValueCell,
                          totalValue == null && styles.tableEmptyCell,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tableCellText,
                            totalValue == null && styles.tableEmptyCellText,
                          ]}
                          numberOfLines={1}
                        >
                          {totalValue == null
                            ? '—'
                            : cellValueFormatter(totalValue)}
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

    if (adminMenu === 'settings') {
      const cardStyle = isMobileLayout ? styles.card : styles.webCard;
      return (
        <>
          <View style={cardStyle}>
            <Text style={styles.sectionTitle}>그래프 최소액 설정</Text>
            <Text style={styles.settingsHint}>합산(관리자 대시보드)</Text>
            <View style={styles.settingsRow}>
              <View style={styles.settingsField}>
                <Text style={styles.settingsLabel}>하루매출 최소액</Text>
                <TextInput
                  style={styles.settingsInput}
                  keyboardType="numeric"
                  value={chartMinTotalDraft.recentMin}
                  onChangeText={(value) =>
                    setChartMinTotalDraft((prev) => ({
                      ...prev,
                      recentMin: value.replace(/[^0-9]/g, ''),
                    }))
                  }
                />
              </View>
              <View style={styles.settingsField}>
                <Text style={styles.settingsLabel}>점심 최소액</Text>
                <TextInput
                  style={styles.settingsInput}
                  keyboardType="numeric"
                  value={chartMinTotalDraft.weekMin}
                  onChangeText={(value) =>
                    setChartMinTotalDraft((prev) => ({
                      ...prev,
                      weekMin: value.replace(/[^0-9]/g, ''),
                    }))
                  }
                />
              </View>
            </View>
            <Text style={[styles.settingsHint, styles.settingsHintSpacing]}>
              지점별 최소액
            </Text>
            {(() => {
              const suncheon = branches.find(
                (branch) => branch.name === '한우대가 순천점',
              );
              const gwangyang = branches.find(
                (branch) => branch.name === '한우대가 광양점',
              );
              const otherBranches = branches.filter(
                (branch) =>
                  !['한우대가 순천점', '한우대가 광양점'].includes(branch.name),
              );
              const hanwooDraft =
                (suncheon && chartMinDrafts[suncheon.id]) ||
                (gwangyang && chartMinDrafts[gwangyang.id]) ||
                {};
              return (
                <>
                  {suncheon && gwangyang ? (
                    <View style={styles.settingsRow}>
                      <Text style={styles.settingsBranch}>한우대가</Text>
                      <View style={styles.settingsField}>
                        <Text style={styles.settingsLabel}>하루매출 최소액</Text>
                        <TextInput
                          style={styles.settingsInput}
                          keyboardType="numeric"
                          value={hanwooDraft.recentMin || ''}
                          onChangeText={(value) => {
                            const nextValue = value.replace(/[^0-9]/g, '');
                            setChartMinDrafts((prev) => ({
                              ...prev,
                              [suncheon.id]: {
                                ...prev[suncheon.id],
                                recentMin: nextValue,
                              },
                              [gwangyang.id]: {
                                ...prev[gwangyang.id],
                                recentMin: nextValue,
                              },
                            }));
                          }}
                        />
                      </View>
                      <View style={styles.settingsField}>
                        <Text style={styles.settingsLabel}>점심 최소액</Text>
                        <TextInput
                          style={styles.settingsInput}
                          keyboardType="numeric"
                          value={hanwooDraft.weekMin || ''}
                          onChangeText={(value) => {
                            const nextValue = value.replace(/[^0-9]/g, '');
                            setChartMinDrafts((prev) => ({
                              ...prev,
                              [suncheon.id]: {
                                ...prev[suncheon.id],
                                weekMin: nextValue,
                              },
                              [gwangyang.id]: {
                                ...prev[gwangyang.id],
                                weekMin: nextValue,
                              },
                            }));
                          }}
                        />
                      </View>
                    </View>
                  ) : null}
                  {otherBranches.map((branch) => {
                    const draft = chartMinDrafts[branch.id] || {};
                    return (
                      <View key={branch.id} style={styles.settingsRow}>
                        <Text style={styles.settingsBranch}>{branch.name}</Text>
                        <View style={styles.settingsField}>
                          <Text style={styles.settingsLabel}>
                            하루매출 최소액
                          </Text>
                          <TextInput
                            style={styles.settingsInput}
                            keyboardType="numeric"
                            value={draft.recentMin || ''}
                            onChangeText={(value) =>
                              setChartMinDrafts((prev) => ({
                                ...prev,
                                [branch.id]: {
                                  ...prev[branch.id],
                                  recentMin: value.replace(/[^0-9]/g, ''),
                                },
                              }))
                            }
                          />
                        </View>
                        <View style={styles.settingsField}>
                          <Text style={styles.settingsLabel}>점심 최소액</Text>
                          <TextInput
                            style={styles.settingsInput}
                            keyboardType="numeric"
                            value={draft.weekMin || ''}
                            onChangeText={(value) =>
                              setChartMinDrafts((prev) => ({
                                ...prev,
                                [branch.id]: {
                                  ...prev[branch.id],
                                  weekMin: value.replace(/[^0-9]/g, ''),
                                },
                              }))
                            }
                          />
                        </View>
                      </View>
                    );
                  })}
                </>
              );
            })()}
            {chartMinError ? (
              <Text style={styles.settingsError}>{chartMinError}</Text>
            ) : null}
            <Pressable
              style={[styles.saveButton, chartMinSaving && styles.saveButtonDisabled]}
              onPress={handleChartMinSave}
              disabled={chartMinSaving}
            >
              <Text style={styles.saveButtonText}>
                {chartMinSaving ? '저장 중...' : '저장'}
              </Text>
            </Pressable>
          </View>
          <View style={cardStyle}>
            <Text style={styles.sectionTitle}>계정 관리</Text>
            <AdminPanel branches={branches} />
          </View>
        </>
      );
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
                    <Text style={styles.kpiTitle}>
                      {homeUseYesterdayTotal ? '어제' : '오늘'} 총매출
                    </Text>
                    <Text style={styles.kpiValue}>
                      {formatAmountPlain(todayTotal)}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전주 대비</Text>
                    <Text style={styles.kpiValue}>
                      {homePercent == null ? '-' : formatSignedPercent(homePercent)}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>이번달 누적</Text>
                    <Text style={styles.kpiValue}>
                      {formatAmountPlain(monthTotal)}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전년 대비</Text>
                    <Text style={styles.kpiValue}>
                      {lastYearDayTotal == null ||
                      todayTotal == null ||
                      lastYearDayTotal === 0
                        ? '-'
                        : formatSignedPercent(
                            ((todayTotal - lastYearDayTotal) / lastYearDayTotal) *
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
                      <Text style={styles.compareName} numberOfLines={1}>
                        {branch.name}
                      </Text>
                      <Text style={styles.compareValue}>
                        {formatMillionsTwo(branch.mid)}
                      </Text>
                      <Text style={styles.compareValue}>
                        {formatMillionsTwo(branch.total)}
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
                  title="최근 10일 일매출"
                  data={recent14Days}
                  maxWidth={1000}
                  showPointLabels={Platform.OS === 'web'}
                  valueFormatter={formatMillionsPlain}
                  showMinMax
                  minOverride={totalMinOverrides.recentMin ?? null}
                  showMinLeft
                />
                <BarChartSimple
                  title="이번주 점심, 저녁 매출"
                  data={weekdayTotalsDinner}
                  compareData={weekdayTotals}
                  maxWidth={1000}
                  valueFormatter={formatMillionsPlain}
                  showMinMax
                  minOverride={totalMinOverrides.weekMin ?? null}
                  primaryLabel="저녁"
                  compareLabel="점심"
                  showLegend
                  showMinLeft
                  compareFirst
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
                      {formatAmountPlain(periodSummary.total)}
                    </Text>
                  </View>
                  <View style={styles.kpiCard}>
                    <Text style={styles.kpiTitle}>전주 대비</Text>
                    <Text style={styles.kpiValue}>
                      {formatAmountPlain(periodSummary.prev)}
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
                      {formatAmountPlain(periodSummary.lastMonth)}
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
                      {formatAmountPlain(periodSummary.lastYear)}
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
                  title="최근 10일 일매출"
                  data={branchAnalysisRecent14}
                  maxWidth={1000}
                  labelFormatter={(label) => label.split('/')[1] || label}
                  showPointLabels
                  valueFormatter={formatMillionsPlain}
                  showMinMax
                  minOverride={branchAnalysisOverrides.recentMin ?? null}
                  showMinLeft
                />
                <View style={styles.webCard}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitleInline}>요일별 점심, 저녁 매출</Text>
                    <View style={styles.weekToggleRowInline}>
                      {[
                        { key: 'this', label: '이번주' },
                        { key: 'last', label: '전주' },
                      ].map((item) => (
                        <Pressable
                          key={item.key}
                          onPress={() => setWeekdayMode(item.key)}
                          style={[
                            styles.weekToggleButton,
                            weekdayMode === item.key &&
                              styles.weekToggleButtonActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.weekToggleText,
                              weekdayMode === item.key &&
                                styles.weekToggleTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <BarChartSimple
                    title="요일별 점심, 저녁 매출"
                    data={
                      weekdayMode === 'this'
                        ? branchAnalysisWeekdaysDinner
                        : branchAnalysisWeekdaysDinnerLast
                    }
                    compareData={
                      weekdayMode === 'this'
                        ? branchAnalysisWeekdays
                        : branchAnalysisWeekdaysLast
                    }
                    maxWidth={1000}
                    valueFormatter={formatMillionsPlain}
                    showMinMax
                    minOverride={branchAnalysisOverrides.weekMin ?? null}
                    primaryLabel="저녁"
                    compareLabel="점심"
                    showLegend
                    showMinLeft
                    compareFirst
                    hideTitle
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
            ) : adminMenu === 'settings' ? (
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
              {profile?.role === 'admin' ? '관리자' : '점장'} · {displayBranchName}
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
              <Text style={styles.cardTitle}>
                {homeUseYesterdayTotal ? '어제' : '오늘'} 총매출
              </Text>
              <Text style={styles.cardValue}>{formatAmountPlain(todayTotal)}</Text>
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

            {!isAdmin && managerBranches.length > 1 ? (
              <View style={styles.cardRow}>
                {managerBranches.map((branch) => (
                  <View key={branch.id} style={[styles.card, styles.cardHalf]}>
                    <Text style={styles.cardTitle}>
                      {homeUseYesterdayBranches ? '어제' : '오늘'}{' '}
                      {branchLabelMap[branch.name] || branch.name} 매출
                    </Text>
                    <Text style={styles.cardValue}>
                      {formatAmountPlain(homeBranchTotals[branch.id])}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {homeUseYesterdayBranches ? '어제' : '오늘'} {branchName} 매출
                </Text>
                <Text style={styles.cardValue}>
                  {formatAmountPlain(homeBranchTotal)}
                </Text>
              </View>
            )}

            {!isAdmin && managerGroup === 'hanwoo' ? (
              <LineChartSimple
                title="최근 10일 일매출"
                data={
                  recentSeriesByBranch[gwangyangBranch?.id] ||
                  recentSeriesByBranch[managerBranchIds[1]] ||
                  []
                }
                compareData={
                  recentSeriesByBranch[suncheonBranch?.id] ||
                  recentSeriesByBranch[managerBranchIds[0]] ||
                  []
                }
                compareColor="#ef4444"
                lineColor="#2255ff"
                compareDashed={false}
                showComparePoints
                showComparePointLabels
                valueFormatter={formatMillionsPlain}
                showMinMax
                showCompareMinMax
                primaryLabel="광양점"
                compareLabel="순천점"
                compareFirst
                legend={[
                  { label: '순천점', color: '#ef4444' },
                  { label: '광양점', color: '#2255ff' },
                ]}
                labelFormatter={(label) => label.split('/')[1] || label}
                showPointLabels
                minOverride={
                  gwangyangBranch?.id
                    ? chartMinByBranch[gwangyangBranch.id]?.recentMin ?? null
                    : managerBranchIds[1]
                      ? chartMinByBranch[managerBranchIds[1]]?.recentMin ?? null
                      : null
                }
                showMinLeft
              />
            ) : !isAdmin && managerGroup === 'mart-cafe' ? (
              managerBranches.map((branch) => (
                <LineChartSimple
                  key={`recent-${branch.id}`}
                  title={`최근 10일 일매출 (${branchLabelMap[branch.name] || branch.name})`}
                  data={recentSeriesByBranch[branch.id] || []}
                  valueFormatter={
                    branch.name === '카페 일공구공'
                      ? formatMillionsTwoPlain
                      : formatMillionsPlain
                  }
                  showMinMax
                  labelFormatter={(label) => label.split('/')[1] || label}
                  showPointLabels
                  minOverride={chartMinByBranch[branch.id]?.recentMin ?? null}
                  showMinLeft
                />
              ))
            ) : (
              <LineChartSimple
                title="최근 10일 일매출"
                data={!isAdmin ? recentSeriesByBranch[selectedBranchId] || [] : recent14Days}
                valueFormatter={formatMillionsPlain}
                showMinMax
                labelFormatter={(label) => label.split('/')[1] || label}
                showPointLabels
                minOverride={!isAdmin ? managerMinOverrides?.recent14Min ?? null : totalMinOverrides.recentMin ?? null}
                showMinLeft
              />
            )}

            {!isAdmin ? (
              managerBranches
                .filter((branch) => branch.name !== '카페 일공구공')
                .map((branch) => (
                  <BarChartSimple
                    key={`week-${branch.id}`}
                    title={`요일별 ${branchLabelMap[branch.name] || branch.name}`}
                    data={weekSeriesByBranch[branch.id]?.dinner || []}
                    compareData={weekSeriesByBranch[branch.id]?.lunch || []}
                    valueFormatter={formatMillionsPlain}
                    showMinMax
                    minOverride={
                      managerGroup === 'hanwoo'
                        ? hanwooWeekMinOverride
                        : chartMinByBranch[branch.id]?.weekMin ?? null
                    }
                    primaryLabel="저녁"
                    compareLabel="점심"
                    showLegend
                    showMinLeft
                    compareFirst
                  />
                ))
            ) : (
              <BarChartSimple
                title="이번주 점심, 저녁 매출"
                data={weekdayTotalsDinner}
                compareData={weekdayTotals}
                valueFormatter={formatMillionsPlain}
                showMinMax
                minOverride={managerMinOverrides?.weekMin ?? null}
                primaryLabel="저녁"
                compareLabel="점심"
                showLegend
                showMinLeft
                compareFirst
              />
            )}
          </>
        ) : activeTab === 'entry' ? (
          <>
            {!isAdmin && managerBranches.length > 1 ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>중간 매출 (점심)</Text>
                  {managerBranches.map((branch) => (
                    <TextInput
                      key={`mid-${branch.id}`}
                      style={styles.entryInput}
                      keyboardType="numeric"
                      placeholder={branch.name}
                      placeholderTextColor="#98a2b3"
                      value={entryMidByBranch[branch.id] || ''}
                      onChangeText={(value) =>
                        setEntryMidByBranch((prev) => ({
                          ...prev,
                          [branch.id]: value.replace(/[^0-9]/g, ''),
                        }))
                      }
                      onBlur={() => handleEntryAutoSave(branch.id)}
                    />
                  ))}
                </View>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>총 매출</Text>
                  {managerBranches.map((branch) => (
                    <TextInput
                      key={`total-${branch.id}`}
                      style={styles.entryInput}
                      keyboardType="numeric"
                      placeholder={branch.name}
                      placeholderTextColor="#98a2b3"
                      value={entryTotalByBranch[branch.id] || ''}
                      onChangeText={(value) =>
                        setEntryTotalByBranch((prev) => ({
                          ...prev,
                          [branch.id]: value.replace(/[^0-9]/g, ''),
                        }))
                      }
                      onBlur={() => handleEntryAutoSave(branch.id)}
                    />
                  ))}
                  {entryAutoSaveNotice ? (
                    <Text style={styles.entryAutoSaveText}>
                      {entryAutoSaveNotice}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {format(new Date(), 'yyyy-MM-dd')} | {displayBranchName}
                </Text>
                {isAdmin ? (
                  <BranchPicker
                    branches={branches}
                    value={selectedBranchId}
                    onChange={setSelectedBranchId}
                    disabled={!isAdmin}
                  />
                ) : null}

                <EntryAmountField
                  label="중간 매출 (점심)"
                  value={entryMid}
                  onChangeText={(value) =>
                    setEntryMid(value.replace(/[^0-9]/g, ''))
                  }
                  onBlur={() => handleEntryAutoSave(selectedBranchId)}
                />
                <EntryAmountField
                  label="총 매출"
                  value={entryTotal}
                  onChangeText={(value) =>
                    setEntryTotal(value.replace(/[^0-9]/g, ''))
                  }
                  onBlur={() => handleEntryAutoSave(selectedBranchId)}
                />
                {entryAutoSaveNotice ? (
                  <Text style={styles.entryAutoSaveText}>
                    {entryAutoSaveNotice}
                  </Text>
                ) : null}
              </View>
            )}
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
              {!isAdmin && managerBranches.length > 1 ? (
                <View style={styles.weekToggleRowInline}>
                  {managerBranches.map((branch) => (
                    <Pressable
                      key={branch.id}
                      style={[
                        styles.periodButton,
                        selectedBranchId === branch.id && styles.periodButtonActive,
                      ]}
                      onPress={() => setSelectedBranchId(branch.id)}
                    >
                      <Text
                        style={[
                          styles.periodText,
                          selectedBranchId === branch.id && styles.periodTextActive,
                        ]}
                      >
                        {branchLabelMap[branch.name] || branch.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
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
                      <Text style={styles.tableHeaderText}>점심</Text>
                    </View>
                    <View style={styles.tableCell}>
                      <Text style={styles.tableHeaderText}>총매출</Text>
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
                          <TextInput
                            style={styles.historyEditInputCompact}
                            keyboardType="numeric"
                            value={historyEditingMid}
                            onFocus={() => {
                              historyFocusRef.current += 1;
                            }}
                            onBlur={() => {
                              historyFocusRef.current -= 1;
                              setTimeout(() => {
                                if (historyFocusRef.current <= 0) {
                                  handleHistoryAutoSave(row.date);
                                }
                              }, 0);
                            }}
                            onChangeText={(value) =>
                              setHistoryEditingMid(value.replace(/[^0-9]/g, ''))
                            }
                          />
                        ) : (
                          <Pressable
                            style={styles.historyValuePress}
                            onPress={() => {
                              setHistoryEditingDate(row.date);
                              setHistoryEditingMid(row.mid == null ? '' : String(row.mid));
                              setHistoryEditingTotal(
                                row.total == null ? '' : String(row.total),
                              );
                            }}
                          >
                            <Text style={styles.tableCellText}>
                              {row.mid == null ? '-' : formatAmount(row.mid)}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                      <View style={styles.tableCell}>
                        {historyEditingDate === row.date ? (
                          <TextInput
                            style={styles.historyEditInputCompact}
                            keyboardType="numeric"
                            value={historyEditingTotal}
                            onFocus={() => {
                              historyFocusRef.current += 1;
                            }}
                            onBlur={() => {
                              historyFocusRef.current -= 1;
                              setTimeout(() => {
                                if (historyFocusRef.current <= 0) {
                                  handleHistoryAutoSave(row.date);
                                }
                              }, 0);
                            }}
                            onChangeText={(value) =>
                              setHistoryEditingTotal(value.replace(/[^0-9]/g, ''))
                            }
                          />
                        ) : (
                          <Pressable
                            style={styles.historyValuePress}
                            onPress={() => {
                              setHistoryEditingDate(row.date);
                              setHistoryEditingMid(
                                row.mid == null ? '' : String(row.mid),
                              );
                              setHistoryEditingTotal(
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
              {!isAdmin && managerBranches.length ? (
                <View style={styles.webCard}>
                  {managerBranches.map((branch) => (
                    <Text key={branch.id} style={styles.summaryItem}>
                      {branchLabelMap[branch.name] || branch.name}{' '}
                      {format(monthCursor, 'M월')} 합계:{' '}
                      {formatAmount(monthlyTotalsByBranch[branch.id] ?? null)}
                    </Text>
                  ))}
                </View>
              ) : null}
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
  cardRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  cardHalf: {
    flex: 1,
    marginBottom: 0,
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
    alignItems: 'center',
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
  entryAutoSaveText: {
    fontSize: 12,
    color: '#667085',
    marginTop: 2,
  },
  historyValuePress: {
    width: '100%',
    alignItems: 'center',
  },
  historyEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
  historyEditInputCompact: {
    width: '100%',
    minWidth: 80,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
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
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  settingsHint: {
    fontSize: 12,
    color: '#667085',
    marginBottom: 8,
  },
  settingsHintSpacing: {
    marginTop: 16,
  },
  settingsRow: {
    marginBottom: 12,
  },
  settingsBranch: {
    fontSize: 13,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 6,
  },
  settingsField: {
    marginBottom: 8,
  },
  settingsLabel: {
    fontSize: 12,
    color: '#667085',
    marginBottom: 4,
  },
  settingsInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  settingsError: {
    color: '#e63946',
    marginBottom: 8,
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
  sectionTitleInline: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 0,
    flexShrink: 1,
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
  weekToggleRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'nowrap',
    flexShrink: 0,
  },
  weekToggleButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  weekToggleButtonActive: {
    backgroundColor: '#101828',
    borderColor: '#101828',
  },
  weekToggleText: {
    color: '#667085',
    fontSize: 12,
  },
  weekToggleTextActive: {
    color: '#ffffff',
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
    flex: 1.5,
    color: '#101828',
  },
  compareValue: {
    flex: 0.9,
    textAlign: 'center',
    color: '#101828',
  },
  compareTrend: {
    width: 52,
    textAlign: 'right',
    color: '#101828',
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
  branchSalesValueCell: {
    width: 90,
  },
  branchSalesTable: {
    minWidth: 300,
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
    paddingVertical: 5,
    paddingHorizontal: 10,
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
