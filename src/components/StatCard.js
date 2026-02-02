import { StyleSheet, Text, View } from 'react-native';

export default function StatCard({ title, value, subtitle }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.value}>{value}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#1a1a1a',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  title: {
    fontSize: 13,
    color: '#5b6470',
    marginBottom: 6,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#7a828f',
  },
});
