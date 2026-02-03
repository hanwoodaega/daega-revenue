import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const profileRequestRef = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const loadUserData = useCallback(async () => {
    const requestId = profileRequestRef.current + 1;
    profileRequestRef.current = requestId;
    if (!session?.user) {
      setProfile(null);
      setBranches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [{ data: profileData, error: profileError }, { data: branchData }] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('id, role, branch_id, phone, active, must_change_password')
            .eq('id', session.user.id)
            .maybeSingle(),
          supabase.from('branches').select('id, name').order('name'),
        ]);

      if (requestId !== profileRequestRef.current) return;
      if (profileError) throw profileError;
      setProfile(profileData);
      setBranches(branchData || []);
    } catch (err) {
      if (requestId !== profileRequestRef.current) return;
      console.warn(err.message ?? '프로필 정보를 불러오지 못했습니다.');
    } finally {
      if (requestId === profileRequestRef.current) {
        setLoading(false);
      }
    }
  }, [session]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  if (!session) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#101828" />
          <Text style={styles.loadingText}>데이터 준비 중...</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (!profile) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            프로필이 없습니다. 관리자에게 계정 설정을 요청하세요.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  if (profile.active === false) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <Text style={styles.errorText}>현재 계정이 비활성화되었습니다.</Text>
          <Pressable style={styles.logout} onPress={() => supabase.auth.signOut()}>
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>
        </View>
      </SafeAreaProvider>
    );
  }

  if (profile.must_change_password) {
    return (
      <SafeAreaProvider>
        <ChangePasswordScreen
          userId={profile.id}
          onComplete={() => {
            setProfile((prev) => ({ ...prev, must_change_password: false }));
            loadUserData();
          }}
        />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DashboardScreen session={session} profile={profile} branches={branches} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#f3f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#667085',
  },
  errorText: {
    color: '#e63946',
    textAlign: 'center',
  },
  logout: {
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d0d5dd',
  },
  logoutText: {
    color: '#344054',
    fontWeight: '600',
  },
});
