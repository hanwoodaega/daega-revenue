import { Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { format } from 'date-fns';

const screenWidth = Dimensions.get('window').width;

export default function SalesChart({ data }) {
  if (!data?.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>최근 7일 데이터가 없습니다.</Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.title}>최근 7일 매출</Text>
        <Text style={styles.webNotice}>
          웹에서는 차트 경고가 발생할 수 있어 모바일에서 확인해주세요.
        </Text>
      </View>
    );
  }

  const labels = data.map((item) => format(item.date, 'M/d'));
  const values = data.map((item) => item.total);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>최근 7일 매출</Text>
      <LineChart
        data={{
          labels,
          datasets: [{ data: values }],
        }}
        width={screenWidth - 32}
        height={220}
        yAxisLabel=""
        yAxisSuffix=""
        chartConfig={{
          backgroundGradientFrom: '#ffffff',
          backgroundGradientTo: '#ffffff',
          color: (opacity = 1) => `rgba(34, 85, 255, ${opacity})`,
          labelColor: (opacity = 1) => `rgba(85, 94, 105, ${opacity})`,
          propsForDots: { r: '4', strokeWidth: '2', stroke: '#2255ff' },
          decimalPlaces: 0,
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 20,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  title: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginBottom: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
  },
  webNotice: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginTop: 8,
    marginBottom: 12,
    fontSize: 12,
    color: '#667085',
  },
  chart: {
    borderRadius: 12,
  },
  empty: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#667085',
  },
});
