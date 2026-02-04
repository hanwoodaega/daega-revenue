import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function AdminPanel({ branches }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [branchId, setBranchId] = useState(branches?.[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const hanwooBranch =
    branches?.find((branch) => branch.name === '한우대가 순천점') ||
    branches?.find((branch) => branch.name === '한우대가 광양점') ||
    null;
  const martBranch =
    branches?.find((branch) => branch.name === '대가정육마트') || null;
  const branchOptions = [
    hanwooBranch ? { id: hanwooBranch.id, label: '한우대가' } : null,
    martBranch ? { id: martBranch.id, label: '대가정육마트' } : null,
  ].filter(Boolean);

  useEffect(() => {
    if (!branchId && branchOptions.length) {
      setBranchId(branchOptions[0].id);
    }
  }, [branchId, branchOptions]);

  const handleCreate = async () => {
    if (!email || !branchId) {
      setMessage('이메일과 지점을 입력해주세요.');
      return;
    }

    setLoading(true);
    setMessage('');
    setTempPassword('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setMessage('로그인이 만료되었습니다. 다시 로그인해주세요.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-manager', {
        body: { email, branchId, phone: phone || null },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (error) throw error;
      setMessage(data?.message ?? '점장 계정을 생성했습니다.');
      setTempPassword(data?.tempPassword ?? '');
      setEmail('');
      setPhone('');
    } catch (err) {
      setMessage(err.message ?? '점장 계정 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>점장 계정 생성 (관리자)</Text>
      <Text style={styles.help}>
        이메일을 입력하면 초기 비밀번호가 자동 생성됩니다.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="manager@example.com"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="연락처 (선택)"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <View style={styles.select}>
        {branchOptions.map((branch) => (
          <Pressable
            key={branch.id}
            onPress={() => setBranchId(branch.id)}
            style={[
              styles.branchButton,
              branchId === branch.id && styles.branchButtonActive,
            ]}
          >
            <Text
              style={[
                styles.branchText,
                branchId === branch.id && styles.branchTextActive,
              ]}
            >
              {branch.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {tempPassword ? (
        <View style={styles.passwordBox}>
          <Text style={styles.passwordLabel}>초기 비밀번호</Text>
          <Text style={styles.passwordValue}>{tempPassword}</Text>
          <Text style={styles.passwordHelp}>
            직원에게 전달 후 로그인하면 됩니다.
          </Text>
        </View>
      ) : null}
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleCreate}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? '생성 중...' : '점장 계정 생성'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101828',
  },
  help: {
    fontSize: 12,
    color: '#667085',
    marginTop: 6,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  select: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  branchButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  branchButtonActive: {
    backgroundColor: '#2255ff',
    borderColor: '#2255ff',
  },
  branchText: {
    fontSize: 13,
    color: '#5b6470',
  },
  branchTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  message: {
    color: '#e63946',
    marginBottom: 8,
  },
  passwordBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
  },
  passwordLabel: {
    fontSize: 12,
    color: '#667085',
  },
  passwordValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  passwordHelp: {
    marginTop: 6,
    fontSize: 12,
    color: '#667085',
  },
  button: {
    backgroundColor: '#101828',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
