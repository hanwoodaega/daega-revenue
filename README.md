# daega-revenue
지점별 매출 관리 앱 (Expo + Supabase)

## 주요 기능
- 지점별 매출 등록 (점심 / 하루 매출)
- 저번주 같은 요일, 어제, 작년 같은달 같은주 같은요일 비교
- 최근 7일 매출 라인 차트
- 관리자 전체 지점 보기 + 드롭다운 선택
- 점장 본인 지점만 보기

## Supabase 설정
1. Supabase 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행
3. 관리자 계정(이메일 + 비밀번호) 생성
4. `profiles` 테이블에 사용자 프로필 추가
   - `id`: auth.users.id
   - `role`: `admin` 또는 `manager`
   - `branch_id`: branches 테이블의 id (관리자도 설정해두면 편함)
   - `phone`: 연락처(표시용)
   - `active`: 계정 활성화 여부
   - `must_change_password`: 첫 로그인 비밀번호 변경 여부
5. 이메일 로그인 사용을 위해 Auth > Providers에서 Email 활성화

## 테스트 데이터 넣기
관리자 계정이 `profiles`에 있는 상태에서 아래 SQL을 실행하면
최근 60일치 테스트 매출이 들어갑니다.
```
supabase/seed.sql
```

## 관리자 웹에서 점장 계정 생성
점장 계정은 **자체 가입 없이** 관리자만 생성합니다. (profiles insert는 admin만 가능)
관리자는 웹 화면에서 점장 계정을 만들 수 있습니다.
1. `supabase/functions/create-manager` 함수를 배포
2. Supabase Functions 환경 변수에 `SUPABASE_SERVICE_ROLE_KEY` 설정
3. 관리자 계정으로 웹 로그인 후 점장 계정 생성

```
supabase functions deploy create-manager
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

## 관리자 계정 생성 방식
Supabase Auth 사용자 생성은 **SQL로 직접 생성할 수 없습니다.**
아래 중 하나로 관리자 계정을 만드세요.
- Supabase 대시보드에서 Email + Password 계정 생성
- Admin API(서비스 키)로 사용자 생성

## 환경 변수
`.env` 파일 생성 후 아래 값을 넣습니다.
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## 실행
```
npm install
npm run start
```
Expo Go에서 QR 코드로 실행할 수 있습니다.

관리자 웹은 아래로 실행합니다.
```
npm run web
```
