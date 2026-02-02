import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';

const slots = [
  { value: 'lunch', label: '점심' },
  { value: 'daily', label: '하루 매출' },
];

export default function EntryForm({
  date,
  slot,
  amount,
  onChangeDate,
  onChangeSlot,
  onChangeAmount,
  onSubmit,
  loading,
  title = '매출 등록',
  submitLabel = '매출 등록',
  onCancel,
  cancelLabel = '취소',
}) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>날짜</Text>
        <Pressable
          style={styles.dateButton}
          onPress={() => setShowPicker(true)}
        >
          <Text style={styles.dateText}>{format(date, 'yyyy.MM.dd')}</Text>
        </Pressable>
      </View>
      {showPicker ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={(_, selected) => {
            setShowPicker(false);
            if (selected) {
              onChangeDate(selected);
            }
          }}
        />
      ) : null}
      <View style={styles.row}>
        <Text style={styles.label}>시간</Text>
        <View style={styles.slotRow}>
          {slots.map((item, index) => (
            <Pressable
              key={item.value}
              onPress={() => onChangeSlot(item.value)}
              style={[
                styles.slotButton,
                index !== slots.length - 1 && styles.slotButtonSpacer,
                slot === item.value && styles.slotButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.slotText,
                  slot === item.value && styles.slotTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>금액</Text>
        <TextInput
          style={styles.input}
          placeholder="예: 350000"
          keyboardType="numeric"
          value={amount}
          onChangeText={onChangeAmount}
        />
      </View>
      <View style={styles.actionRow}>
        {onCancel ? (
          <Pressable
            style={[styles.cancel, loading && styles.submitDisabled]}
            onPress={onCancel}
            disabled={loading}
          >
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.submit, loading && styles.submitDisabled]}
          onPress={onSubmit}
          disabled={loading}
        >
          <Text style={styles.submitText}>
            {loading ? '처리 중...' : submitLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 12,
  },
  row: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: '#5b6470',
    marginBottom: 6,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  dateText: {
    color: '#101828',
  },
  slotRow: {
    flexDirection: 'row',
  },
  slotButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  slotButtonSpacer: {
    marginRight: 8,
  },
  slotButtonActive: {
    backgroundColor: '#2255ff',
    borderColor: '#2255ff',
  },
  slotText: {
    fontSize: 12,
    color: '#5b6470',
  },
  slotTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  submit: {
    backgroundColor: '#101828',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    flex: 1,
  },
  cancel: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginRight: 8,
    flex: 1,
  },
  cancelText: {
    color: '#344054',
    fontWeight: '600',
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
  },
});
