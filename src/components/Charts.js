import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, {
  G,
  Line,
  Polyline,
  Rect,
  Text as SvgText,
  Circle,
  Path,
} from 'react-native-svg';
import { formatCurrency } from '../lib/format';

const chartPadding = 24;

const useChartWidth = () => {
  const [width, setWidth] = useState(0);
  const onLayout = (event) => {
    setWidth(event.nativeEvent.layout.width);
  };
  return { width, onLayout };
};

const getMinMax = (data) => {
  const values = data
    .map((item) => (item.value == null ? NaN : Number(item.value)))
    .filter((value) => Number.isFinite(value));
  if (!values.length) {
    return { min: 0, max: 1, hasValues: false };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return { min: Math.max(0, min - 1), max: max + 1, hasValues: true };
  }
  return { min, max, hasValues: true };
};

export function LineChartSimple({
  title,
  data,
  height = Platform.OS === 'web' ? 260 : 220,
  maxWidth,
  compareData,
  compareColor = '#94a3b8',
  lineColor = '#2255ff',
  compareDashed = true,
  showComparePoints = false,
  showComparePointLabels = false,
  compareDataAlt,
  compareAltColor = '#cbd5f5',
  rangeMode = 'combined',
  legend,
  labelFormatter,
  valueFormatter,
  showMinMax = false,
  showCompareMinMax = false,
  primaryLabel,
  compareLabel,
  compareFirst = false,
  showPointLabels = false,
  minOverride = null,
  showMinLeft = false,
}) {
  const { width, onLayout } = useChartWidth();
  const combined = useMemo(() => {
    if (rangeMode === 'primary') {
      return data;
    }
    return [...data, ...(compareData || []), ...(compareDataAlt || [])];
  }, [compareData, compareDataAlt, data, rangeMode]);
  const { min, max, hasValues: hasCombinedValues } = useMemo(
    () => getMinMax(combined),
    [combined],
  );
  const {
    min: displayMin,
    max: displayMax,
    hasValues: hasDisplayValues,
  } = useMemo(() => getMinMax(data), [data]);
  const {
    min: compareDisplayMin,
    max: compareDisplayMax,
    hasValues: hasCompareDisplayValues,
  } = useMemo(() => getMinMax(compareData || []), [compareData]);
  const adjustedDisplayMin = minOverride ?? displayMin;
  const adjustedMin = minOverride ?? min;
  const adjustedMax = max <= adjustedMin ? adjustedMin + 1 : max;
  const minLabel = valueFormatter
    ? valueFormatter(displayMin)
    : formatCurrency(displayMin);
  const minLeftLabel = valueFormatter
    ? valueFormatter(adjustedDisplayMin)
    : formatCurrency(adjustedDisplayMin);
  const maxLabel = valueFormatter
    ? valueFormatter(displayMax)
    : formatCurrency(displayMax);
  const compareMinLabel = valueFormatter
    ? valueFormatter(compareDisplayMin)
    : formatCurrency(compareDisplayMin);
  const compareMaxLabel = valueFormatter
    ? valueFormatter(compareDisplayMax)
    : formatCurrency(compareDisplayMax);
  const range = adjustedMax - adjustedMin || 1;
  const [hovered, setHovered] = useState(null);
  const tooltipFontSize = Platform.OS === 'web' ? 14 : 12;

  const points = useMemo(() => {
    if (!width || !data.length) return [];
    const innerWidth = width - chartPadding * 2;
    const innerHeight = height - chartPadding * 2;
    const segments = [];
    let current = [];
    data.forEach((item, index) => {
      const rawValue = item.value;
      const value =
        rawValue == null || rawValue === '' ? NaN : Number(rawValue);
      const isValid = Number.isFinite(value);
      if (!isValid) {
        if (current.length) {
          segments.push(current.join(' '));
          current = [];
        }
        return;
      }
      const x =
        chartPadding +
        (innerWidth * index) / Math.max(1, data.length - 1);
      const y =
        chartPadding + innerHeight * (1 - (value - adjustedMin) / range);
      current.push(`${x},${y}`);
    });
    if (current.length) {
      segments.push(current.join(' '));
    }
    return segments;
  }, [data, height, adjustedMin, range, width]);

  const comparePoints = useMemo(() => {
    if (!width || !compareData?.length) return [];
    const innerWidth = width - chartPadding * 2;
    const innerHeight = height - chartPadding * 2;
    const segments = [];
    let current = [];
    compareData.forEach((item, index) => {
      const rawValue = item.value;
      const value =
        rawValue == null || rawValue === '' ? NaN : Number(rawValue);
      const isValid = Number.isFinite(value);
      if (!isValid) {
        if (current.length) {
          segments.push(current.join(' '));
          current = [];
        }
        return;
      }
      const x =
        chartPadding +
        (innerWidth * index) / Math.max(1, compareData.length - 1);
      const y =
        chartPadding + innerHeight * (1 - (value - adjustedMin) / range);
      current.push(`${x},${y}`);
    });
    if (current.length) {
      segments.push(current.join(' '));
    }
    return segments;
  }, [compareData, height, adjustedMin, range, width]);

  const compareAltPoints = useMemo(() => {
    if (!width || !compareDataAlt?.length) return [];
    const innerWidth = width - chartPadding * 2;
    const innerHeight = height - chartPadding * 2;
    const segments = [];
    let current = [];
    compareDataAlt.forEach((item, index) => {
      const rawValue = item.value;
      const value =
        rawValue == null || rawValue === '' ? NaN : Number(rawValue);
      const isValid = Number.isFinite(value);
      if (!isValid) {
        if (current.length) {
          segments.push(current.join(' '));
          current = [];
        }
        return;
      }
      const x =
        chartPadding +
        (innerWidth * index) / Math.max(1, compareDataAlt.length - 1);
      const y =
        chartPadding + innerHeight * (1 - (value - adjustedMin) / range);
      current.push(`${x},${y}`);
    });
    if (current.length) {
      segments.push(current.join(' '));
    }
    return segments;
  }, [compareDataAlt, height, adjustedMin, range, width]);

  return (
    <View style={[styles.card, maxWidth ? { maxWidth } : null]} onLayout={onLayout}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {showMinMax && hasDisplayValues ? (
          compareData && showCompareMinMax && hasCompareDisplayValues ? (
            <View style={styles.minMaxStack}>
              {compareFirst ? (
                <>
                  <Text style={styles.minMaxText}>
                    {compareLabel || '비교'} 최저 {compareMinLabel} · 최고 {compareMaxLabel}
                  </Text>
                  <Text style={styles.minMaxText}>
                    {primaryLabel || '현재'} 최저 {minLabel} · 최고 {maxLabel}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.minMaxText}>
                    {primaryLabel || '현재'} 최저 {minLabel} · 최고 {maxLabel}
                  </Text>
                  <Text style={styles.minMaxText}>
                    {compareLabel || '비교'} 최저 {compareMinLabel} · 최고 {compareMaxLabel}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.minMaxRow}>
              <Text style={styles.minMaxText}>최저 {minLabel}</Text>
              <Text style={styles.minMaxText}>최고 {maxLabel}</Text>
            </View>
          )
        ) : null}
      </View>
      {!hasCombinedValues ? (
        <Text style={styles.empty}>데이터가 없습니다.</Text>
      ) : width ? (
        <Svg width={width} height={height}>
          <G>
            <Line
              x1={chartPadding}
              y1={height - chartPadding}
              x2={width - chartPadding}
              y2={height - chartPadding}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            {showMinLeft ? (
              <SvgText
                x={chartPadding - 6}
                y={height - chartPadding + 4}
                fontSize="11"
                fill="#101828"
                textAnchor="end"
              >
                {minLeftLabel}
              </SvgText>
            ) : null}
            {compareAltPoints.map((segment, index) => (
              <Polyline
                key={`alt-${index}`}
                points={segment}
                fill="none"
                stroke={compareAltColor}
                strokeWidth="2"
                strokeDasharray="2 6"
              />
            ))}
            {comparePoints.map((segment, index) => (
              <Polyline
                key={`compare-${index}`}
                points={segment}
                fill="none"
                stroke={compareColor}
                strokeWidth="2"
                strokeDasharray={compareDashed ? '8 4' : undefined}
              />
            ))}
            {points.map((segment, index) => (
              <Polyline
                key={`primary-${index}`}
                points={segment}
                fill="none"
                stroke={lineColor}
                strokeWidth="2"
              />
            ))}
          </G>
          {data.map((item, index) => {
            const rawValue = item.value;
            const value =
              rawValue == null || rawValue === '' ? NaN : Number(rawValue);
            if (!Number.isFinite(value)) {
              return (
                <G key={item.label}>
                  <SvgText
                    x={
                      chartPadding +
                      ((width - chartPadding * 2) * index) /
                        Math.max(1, data.length - 1)
                    }
                    y={height - 8}
                    fontSize="12"
                    fill="#667085"
                    textAnchor="middle"
                  >
                    {labelFormatter ? labelFormatter(item.label) : item.label}
                  </SvgText>
                </G>
              );
            }
            const innerWidth = width - chartPadding * 2;
            const innerHeight = height - chartPadding * 2;
            const x =
              chartPadding +
              (innerWidth * index) / Math.max(1, data.length - 1);
            const y =
              chartPadding + innerHeight * (1 - (value - adjustedMin) / range);
            return (
              <G key={item.label}>
                {showPointLabels ? (
                  <SvgText
                    x={x}
                    y={Math.max(chartPadding + 14, y - 18)}
                    fontSize="14"
                    fill="#344054"
                    textAnchor="middle"
                  >
                    {valueFormatter ? valueFormatter(value) : formatCurrency(value)}
                  </SvgText>
                ) : null}
                  <SvgText
                  x={x}
                  y={height - 8}
                    fontSize="13"
                  fill="#667085"
                  textAnchor="middle"
                >
                  {labelFormatter ? labelFormatter(item.label) : item.label}
                </SvgText>
                <Rect
                  x={x - 5}
                  y={y - 5}
                  width={10}
                  height={10}
                  rx={5}
                  fill={lineColor}
                  onMouseEnter={
                    Platform.OS === 'web'
                      ? () =>
                          setHovered({
                            x,
                            y,
                            label: valueFormatter
                              ? valueFormatter(item.value || 0)
                              : formatCurrency(item.value || 0),
                          })
                      : undefined
                  }
                  onMouseLeave={
                    Platform.OS === 'web' ? () => setHovered(null) : undefined
                  }
                  onPress={
                    Platform.OS !== 'web'
                      ? () =>
                          setHovered({
                            x,
                            y,
                            label: valueFormatter
                              ? valueFormatter(item.value || 0)
                              : formatCurrency(item.value || 0),
                          })
                      : undefined
                  }
                />
              </G>
            );
          })}
          {showComparePoints && compareData
            ? compareData.map((item, index) => {
                const rawValue = item.value;
                const value =
                  rawValue == null || rawValue === '' ? NaN : Number(rawValue);
                if (!Number.isFinite(value)) {
                  return null;
                }
                const innerWidth = width - chartPadding * 2;
                const innerHeight = height - chartPadding * 2;
                const x =
                  chartPadding +
                  (innerWidth * index) / Math.max(1, compareData.length - 1);
                const y =
                  chartPadding + innerHeight * (1 - (value - adjustedMin) / range);
                return (
                  <G key={`compare-point-${item.label}`}>
                    {showComparePointLabels ? (
                      <SvgText
                        x={x}
                        y={Math.max(chartPadding + 14, y - 18)}
                        fontSize="14"
                        fill="#101828"
                        textAnchor="middle"
                      >
                        {valueFormatter ? valueFormatter(value) : formatCurrency(value)}
                      </SvgText>
                    ) : null}
                    <Rect
                      x={x - 5}
                      y={y - 5}
                      width={10}
                      height={10}
                      rx={5}
                      fill={compareColor}
                    />
                  </G>
                );
              })
            : null}
          {hovered ? (
            <G pointerEvents="none">
              <Rect
                x={hovered.x - 44}
                y={Math.max(chartPadding, hovered.y - 30)}
                width={88}
                height={22}
                rx={5}
                fill="#ffffff"
                stroke="#d0d5dd"
              />
              <SvgText
                x={hovered.x}
                y={Math.max(chartPadding + 14, hovered.y - 14)}
                fontSize={tooltipFontSize}
                fill="#101828"
                textAnchor="middle"
              >
                {hovered.label}
              </SvgText>
            </G>
          ) : null}
        </Svg>
      ) : null}
      {legend?.length ? (
        <View style={styles.legendRow}>
          {legend.map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View
                style={[
                  styles.legendLine,
                  {
                    backgroundColor: item.color,
                    borderStyle: item.dashed ? 'dashed' : 'solid',
                    borderColor: item.color,
                    borderWidth: item.dashed ? 1 : 0,
                    borderStyle: item.dashed ? 'dotted' : 'solid',
                  },
                ]}
              />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function BarChartSimple({
  title,
  data,
  height = Platform.OS === 'web' ? 260 : 220,
  maxWidth,
  compareData,
  compareColor = '#cbd5f5',
  valueFormatter,
  showMinMax = false,
  minOverride = null,
  primaryLabel,
  compareLabel,
  showLegend = false,
  compareFirst = false,
  showMinLeft = false,
  hideTitle = false,
}) {
  const { width, onLayout } = useChartWidth();
  const combined = useMemo(
    () => [...data, ...(compareData || [])],
    [compareData, data],
  );
  const { min, max, hasValues: hasCombinedValues } = useMemo(
    () => getMinMax(combined),
    [combined],
  );
  const {
    min: displayMin,
    max: displayMax,
    hasValues: hasDisplayValues,
  } = useMemo(() => getMinMax(data), [data]);
  const {
    min: compareDisplayMin,
    max: compareDisplayMax,
    hasValues: hasCompareDisplayValues,
  } = useMemo(() => getMinMax(compareData || []), [compareData]);
  const adjustedDisplayMin = minOverride ?? displayMin;
  const adjustedMin = minOverride ?? min;
  const adjustedMax = max <= adjustedMin ? adjustedMin + 1 : max;
  const labelMaxValue = Math.max(displayMax, displayMin);
  const minLabel = valueFormatter
    ? valueFormatter(displayMin)
    : formatCurrency(displayMin);
  const maxLabel = valueFormatter
    ? valueFormatter(labelMaxValue)
    : formatCurrency(labelMaxValue);
  const compareLabelMaxValue = Math.max(compareDisplayMax, compareDisplayMin);
  const compareMinLabel = valueFormatter
    ? valueFormatter(compareDisplayMin)
    : formatCurrency(compareDisplayMin);
  const compareMaxLabel = valueFormatter
    ? valueFormatter(compareLabelMaxValue)
    : formatCurrency(compareLabelMaxValue);
  const minLeftLabel = valueFormatter
    ? valueFormatter(adjustedDisplayMin)
    : formatCurrency(adjustedDisplayMin);
  const range = adjustedMax - adjustedMin || 1;
  const barLabelFontSize = Platform.OS === 'web' ? 15 : 13;
  const maxValue = useMemo(() => {
    const values = data
      .map((item) => (item.value == null ? NaN : Number(item.value)))
      .filter((value) => Number.isFinite(value));
    return values.length ? Math.max(...values) : null;
  }, [data]);

  return (
    <View style={[styles.card, maxWidth ? { maxWidth } : null]} onLayout={onLayout}>
      <View style={[styles.titleRow, hideTitle && styles.titleRowRight]}>
        {!hideTitle ? <Text style={styles.title}>{title}</Text> : null}
        {showMinMax && hasDisplayValues ? (
          compareData && hasCompareDisplayValues ? (
            <View style={styles.minMaxStack}>
              {compareFirst ? (
                <>
                  <Text style={styles.minMaxText}>
                    {compareLabel || '저녁'} 최저 {compareMinLabel} · 최고 {compareMaxLabel}
                  </Text>
                  <Text style={styles.minMaxText}>
                    {primaryLabel || '점심'} 최저 {minLabel} · 최고 {maxLabel}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.minMaxText}>
                    {primaryLabel || '점심'} 최저 {minLabel} · 최고 {maxLabel}
                  </Text>
                  <Text style={styles.minMaxText}>
                    {compareLabel || '저녁'} 최저 {compareMinLabel} · 최고 {compareMaxLabel}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.minMaxRow}>
              <Text style={styles.minMaxText}>최저 {minLabel}</Text>
              <Text style={styles.minMaxText}>최고 {maxLabel}</Text>
            </View>
          )
        ) : null}
      </View>
      {!hasCombinedValues ? (
        <Text style={styles.empty}>데이터가 없습니다.</Text>
      ) : width ? (
        <Svg width={width} height={height}>
          <G>
            <Line
              x1={chartPadding}
              y1={height - chartPadding}
              x2={width - chartPadding}
              y2={height - chartPadding}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            {showMinLeft ? (
              <SvgText
                x={chartPadding - 6}
                y={height - chartPadding + 4}
                fontSize="11"
                fill="#101828"
                textAnchor="end"
              >
                {minLeftLabel}
              </SvgText>
            ) : null}
            {data.map((item, index) => {
              const innerWidth = width - chartPadding * 2;
              const innerHeight = height - chartPadding * 2;
              const slotWidth = innerWidth / data.length;
              const barWidth = Math.max(6, Math.min(10, slotWidth * 0.35));
              const gap = compareData ? 4 : 0;
              const totalBarWidth = compareData
                ? barWidth * 2 + gap
                : barWidth;
              const xBase =
                chartPadding +
                index * slotWidth +
                (slotWidth - totalBarWidth) / 2;
              const xCompareCenter = xBase + barWidth / 2;
              const xPrimaryCenter = compareData
                ? xBase + barWidth + gap + barWidth / 2
                : xBase + barWidth / 2;
              const rawValue = item.value;
              const value =
                rawValue == null || rawValue === '' ? NaN : Number(rawValue);
              const hasValue = Number.isFinite(value);
              const barHeight = hasValue
                ? Math.max(0, innerHeight * ((value - adjustedMin) / range))
                : 0;
              const y = height - chartPadding - barHeight;
              const label = valueFormatter
                ? valueFormatter(item.value || 0)
                : formatCurrency(item.value || 0);
              const labelWidth = Math.max(28, label.length * 7);
              const labelY = Math.max(chartPadding + 10, y - 10);
              const compareRaw = compareData?.[index]?.value;
              const compareValue =
                compareRaw == null || compareRaw === ''
                  ? NaN
                  : Number(compareRaw);
              const hasCompareValue = Number.isFinite(compareValue);
              const compareHeight = compareData
                ? Math.max(
                    0,
                    innerHeight *
                      ((hasCompareValue ? compareValue : adjustedMin) - adjustedMin) /
                      range,
                  )
                : 0;
              const compareY = height - chartPadding - compareHeight;
              const compareLabel = valueFormatter
                ? valueFormatter(compareValue || 0)
                : formatCurrency(compareValue || 0);
              const compareLabelWidth = Math.max(28, compareLabel.length * 7);
              let compareLabelY = Math.max(chartPadding + 10, compareY - 18);
              if (Math.abs(compareLabelY - labelY) < 12) {
                compareLabelY = Math.max(chartPadding + 10, compareLabelY - 12);
              }
              return (
                <G key={`${item.label}-${index}`}>
                  {compareData && hasCompareValue ? (
                    <Rect
                      x={xBase}
                      y={compareY}
                      width={barWidth}
                      height={compareHeight}
                      rx={4}
                      fill={compareColor}
                    />
                  ) : null}
                  {hasValue ? (
                    <Rect
                      x={compareData ? xBase + barWidth + gap : xBase}
                      y={y}
                      width={barWidth}
                      height={barHeight}
                      rx={4}
                      fill="#101828"
                    />
                  ) : null}
                  {compareData && hasCompareValue ? (
                    <>
                      <Rect
                        x={xCompareCenter - compareLabelWidth / 2}
                        y={compareLabelY - 8}
                        width={compareLabelWidth}
                      height={14}
                        rx={3}
                        fill="#ffffff"
                      opacity={0.96}
                      />
                      <SvgText
                        x={xCompareCenter}
                        y={compareLabelY}
                        fontSize={Math.max(10, barLabelFontSize - 1)}
                        fill="#344054"
                        textAnchor="middle"
                      >
                        {compareLabel}
                      </SvgText>
                    </>
                  ) : null}
                  {hasValue ? (
                    <>
                      <Rect
                        x={xPrimaryCenter - labelWidth / 2}
                        y={labelY - 8}
                        width={labelWidth}
                      height={14}
                        rx={3}
                        fill="#ffffff"
                      opacity={0.96}
                      />
                      <SvgText
                        x={xPrimaryCenter}
                        y={labelY}
                        fontSize={barLabelFontSize}
                        fill="#344054"
                        textAnchor="middle"
                      >
                        {label}
                      </SvgText>
                    </>
                  ) : null}
                  <SvgText
                    x={xBase + totalBarWidth / 2}
                    y={height - 8}
                    fontSize="12"
                    fill="#667085"
                    textAnchor="middle"
                  >
                    {item.label}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </Svg>
      ) : null}
      {!showMinMax && maxValue != null ? (
        <Text style={styles.summary}>
          최고 {formatCurrency(maxValue)}원
        </Text>
      ) : null}
      {showLegend && compareData ? (
        <View style={styles.legendRow}>
          {compareFirst ? (
            <>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: compareColor }]} />
                <Text style={styles.legendText}>{compareLabel || '저녁'}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#101828' }]} />
                <Text style={styles.legendText}>{primaryLabel || '점심'}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#101828' }]} />
                <Text style={styles.legendText}>{primaryLabel || '점심'}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: compareColor }]} />
                <Text style={styles.legendText}>{compareLabel || '저녁'}</Text>
              </View>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const polarToCartesian = (cx, cy, r, angle) => {
  const rad = ((angle - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
};

const describeArc = (cx, cy, r, startAngle, endAngle) => {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M',
    start.x,
    start.y,
    'A',
    r,
    r,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
    'L',
    cx,
    cy,
    'Z',
  ].join(' ');
};

export function DonutChartSimple({
  title,
  data,
  height = 200,
  maxWidth,
  innerRatio = 0.6,
  showSliceValues = false,
}) {
  const { width, onLayout } = useChartWidth();
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
  const center = { x: (width || 0) / 2, y: height / 2 };
  const radius = Math.min(width || 0, height) / 2 - 12;
  const innerRadius = radius * innerRatio;
  let startAngle = 0;

  return (
    <View style={[styles.card, maxWidth ? { maxWidth } : null]} onLayout={onLayout}>
      <Text style={styles.title}>{title}</Text>
      {width ? (
        <Svg width={width} height={height}>
          {data.map((item) => {
            const angle = total ? (item.value / total) * 360 : 0;
            const endAngle = startAngle + angle;
            const path = describeArc(
              center.x,
              center.y,
              radius,
              startAngle,
              endAngle,
            );
            const midAngle = startAngle + angle / 2;
            const labelPos = polarToCartesian(
              center.x,
              center.y,
              radius * 0.75,
              midAngle,
            );
            startAngle = endAngle;
            return (
              <G key={item.label}>
                <Path d={path} fill={item.color} />
                <SvgText
                  x={labelPos.x}
                  y={labelPos.y}
                  fontSize="11"
                  fill="#ffffff"
                  textAnchor="middle"
                >
                  {showSliceValues
                    ? `${total ? ((item.value / total) * 100).toFixed(0) : 0}%`
                    : item.label}
                </SvgText>
              </G>
            );
          })}
          {innerRatio > 0 ? (
            <>
              <Circle
                cx={center.x}
                cy={center.y}
                r={innerRadius}
                fill="#ffffff"
              />
              <SvgText
                x={center.x}
                y={center.y}
                fontSize="12"
                fill="#101828"
                textAnchor="middle"
              >
                {total ? '100%' : '0%'}
              </SvgText>
            </>
          ) : null}
        </Svg>
      ) : null}
      <View style={styles.legendRow}>
        {data.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>
              {item.label} {total ? ((item.value / total) * 100).toFixed(1) : 0}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  titleRowRight: {
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 15,
    color: '#667085',
  },
  minMaxRow: {
    flexDirection: 'row',
    gap: 10,
  },
  minMaxStack: {
    alignItems: 'flex-end',
    gap: 2,
    alignSelf: 'flex-end',
  },
  minMaxText: {
    fontSize: 13,
    color: '#667085',
  },
  empty: {
    color: '#667085',
  },
  summary: {
    marginTop: 6,
    fontSize: 13,
    color: '#667085',
  },
  legendRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    paddingLeft: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLine: {
    width: 16,
    height: 2,
    borderWidth: 1,
  },
  legendText: {
    fontSize: 13,
    color: '#667085',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#667085',
  },
});
