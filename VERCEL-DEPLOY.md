# Vercel + Supabase 배포

화면: https://busangikiwoom.vercel.app/
Supabase 프로젝트: busangi-kiwoom (서울)

## Vercel Production 환경 변수

- BUSANGI_BACKEND_ORIGIN=https://eqqsbkeutuhltjrxhceh.supabase.co
- BUSANGI_BACKEND_MODE=supabase

위 값은 공개 서버 주소와 실행 모드이며 비밀 키가 아닙니다. vercel.cjs는 /api/*를 Supabase Edge Function busangi-api로 전달합니다. build-vercel.cjs는 허용한 화면 파일과 에셋만 dist에 복사합니다. Git main 변경으로 재배포합니다.

## Supabase 서버 설정

supabase/schema.sql의 테이블은 모두 RLS를 활성화하고 익명·일반 인증 사용자의 직접 접근을 차단합니다. Edge Function만 서버 권한으로 접근합니다. 로그인은 기존 닉네임 방식이며 비밀번호는 scrypt로 처리하고 세션 토큰은 해시만 DB에 보관합니다. 브라우저에는 HttpOnly·Secure 쿠키를 사용합니다. 저장은 버전 충돌을 검사합니다.

KIS_APP_KEY와 KIS_APP_SECRET은 Supabase Edge Function의 Secrets에만 저장합니다. BUSANGI_ALLOWED_ORIGINS에는 공개 사이트 주소를 지정합니다. Supabase 서버 키는 런타임 제공 값을 사용하며 브라우저·Git·Vercel 정적 결과로 전달하지 않습니다. 주가 API는 조회 전용입니다. 광장은 서버리스 환경에서 1초 주기로 접속자와 채팅을 갱신합니다.

## 검증

npm test
node check-secrets.cjs (Git stage 후 실제 키 값을 출력하지 않고 검사)

cloud-api-smoke.cjs는 BUSANGI_SMOKE_URL을 지정한 경우에만 원격 가입·저장·권한·채팅·시세를 검사합니다. 종료 시 출력된 임시 사용자/플레이어 ID만 정확히 지정해 테스트 기록을 정리합니다. 실제 회원 데이터는 정리 대상이 아닙니다.

/api/health, /api/auth/session이 JSON을 반환하는지, 가입→가입 완료→재로그인→저장 복원 및 광장 두 접속자의 대화를 배포 후 확인합니다. 기존 PC의 SQLite 회원정보는 자동 전송하지 않습니다. 새 클라우드 계정 가입 시 현재 브라우저 진행 가져오기를 이용할 수 있습니다.

## 로컬 실행 대안

npm start는 기존 SQLite/DPAPI 기반 로컬 서버를 실행합니다. 외부 Node 호스팅을 따로 사용하는 경우 BUSANGI_BACKEND_MODE=node와 해당 HTTPS 주소를 설정하고 BUSANGI_DATA_DIR을 영구 디스크로 지정합니다.
