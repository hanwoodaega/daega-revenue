import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useState } from 'react';

export default function BranchPicker({
  branches,
  value,
  onChange,
  disabled,
  label = '지점 선택',
}) {
  const [iosOpen, setIosOpen] = useState(false);
  if (!branches?.length) {
    return null;
  }

  const selectedLabel =
    branches.find((branch) => branch.id === value)?.name || '지점 선택';

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.pickerWrapper}>
        <Pressable
          style={[styles.iosButton, disabled && styles.iosButtonDisabled]}
          onPress={() => {
            if (!disabled) setIosOpen(true);
          }}
        >
          <Text style={styles.iosButtonText}>{selectedLabel}</Text>
          <Text style={styles.iosButtonIcon}>⌄</Text>
        </Pressable>
      </View>
      <Modal visible={iosOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setIosOpen(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>지점 선택</Text>
            <ScrollView>
              {branches.map((branch) => {
                const isActive = branch.id === value;
                return (
                  <Pressable
                    key={branch.id}
                    onPress={() => {
                      onChange(branch.id);
                      setIosOpen(false);
                    }}
                    style={[
                      styles.modalItem,
                      isActive && styles.modalItemActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.modalItemText,
                        isActive && styles.modalItemTextActive,
                      ]}
                    >
                      {branch.name}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    color: '#5b6470',
    marginBottom: 6,
  },
  pickerWrapper: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
  },
  iosButton: {
    height: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iosButtonDisabled: {
    opacity: 0.5,
  },
  iosButtonText: {
    color: '#101828',
    fontSize: 15,
  },
  iosButtonIcon: {
    color: '#98a2b3',
    fontSize: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 12,
  },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalItemActive: {
    backgroundColor: '#eef2ff',
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  modalItemText: {
    color: '#101828',
    fontSize: 15,
  },
  modalItemTextActive: {
    fontWeight: '700',
    color: '#1d4ed8',
  },
});
