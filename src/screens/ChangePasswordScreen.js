import { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function ChangePasswordScreen({ userId, onComplete }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async () => {
    if (!password || password.length < 6) {
      setMessage('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== confirm) {
      setMessage('비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      const { error: profileError } = await supabase.rpc(
        'set_must_change_password',
        { value: false },
      );
      if (profileError) throw profileError;

      onComplete?.();
    } catch (err) {
      setMessage(err.message ?? '비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>비밀번호 변경</Text>
        <Text style={styles.subtitle}>
          첫 로그인 시 비밀번호를 변경해야 합니다.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="새 비밀번호 (6자 이상)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 확인"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? '변경 중...' : '비밀번호 변경'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 13,
    color: '#667085',
    marginTop: 6,
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#101828',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  message: {
    color: '#e63946',
    marginBottom: 8,
  },
});
