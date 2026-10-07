# Jev for Claude

여덟 가지 실무 원칙을 사용자가 직접 호출하는 Claude Code 스킬로 제공하고, 보수적인 로컬 훅과 선택형 Jev API 어댑터를 더한 무의존성 플러그인입니다.

이 프로젝트는 독립적인 비공식 커뮤니티 프로젝트이며 Anthropic 또는 TypeSafe의 제품이 아니고 두 회사의 제휴나 보증을 받지 않습니다. 구현은 독창적으로 작성되었으며 제3자 저장소 코드, 로컬 `CLAUDE.md`, 사용자 설정을 재사용하지 않습니다.

## 제공 기능

- `/jev-workflows:safety-preflight`: 위험 작업 전 범위, 복구, 권한, 개인정보를 점검합니다.
- `/jev-workflows:rule-rubric`: 요구사항을 검증 가능한 규칙과 증거 기준으로 바꿉니다.
- `/jev-workflows:browser-qa`: 실제 렌더링된 웹 흐름을 관찰 가능한 증거로 확인합니다.
- `/jev-workflows:evidence-completion`: 완료 주장이 직접 증거로 뒷받침되는지 점검합니다.
- `/jev-workflows:steer-queue`: 새 지시를 즉시 전환, 다음 대기, 교체, 충돌로 분류합니다.
- `/jev-workflows:compact-checkpoint`: 컨텍스트 축약이나 인계 전에 짧은 체크포인트를 만듭니다.
- `/jev-workflows:targeted-file-relevance`: 전체 저장소를 읽기 전에 최소 관련 파일을 고릅니다.
- `/jev-workflows:seo-audit`: 순위를 보장하지 않고 기술 및 온페이지 SEO를 점검합니다.
- `/jev-workflows:jev-judge`: 명시적인 타입 기반 Jev 평가를 준비하거나 실행합니다.

모든 스킬에는 `disable-model-invocation: true`가 설정되어 있습니다. Claude가 임의로 자동 호출하지 않습니다.

## 자동 훅

로컬 훅 런타임은 Node.js 표준 라이브러리만 사용하며 입력, 상태 파일 수, 이벤트 기록 수가 제한됩니다.

- 명백한 시스템 루트 또는 블록 장치 파괴 명령만 좁게 차단합니다.
- 일부 작업공간 전체 삭제 명령과 비밀 파일명 쓰기는 사용자 확인을 요청합니다.
- 성공한 편집, 테스트 명령, 브라우저 도구, 실패 횟수의 범주만 기록합니다.
- 프롬프트, 전체 대화, transcript 파일, 명령 전문, 전체 파일 경로를 저장하지 않습니다.
- 편집 뒤 인식된 테스트나 브라우저 증거가 없으면 최대 세 번 비차단 알림을 낼 수 있습니다.
- 세션 종료 시 해당 세션 상태를 삭제합니다.

이 훅은 일반적인 안전성 판정기나 Jev 의미 평가가 아닙니다. 정규식 기반 분류가 임의 명령의 안전성을 보장하지 않습니다. 자세한 한계는 [LIMITATIONS](docs/LIMITATIONS.md)를 참고하세요.

## 선택형 Jev 평가

자동 훅은 네트워크를 사용하지 않습니다. 별도 어댑터는 다음 조건을 모두 만족할 때만 공식 System One 엔드포인트를 호출합니다.

1. 호출자가 stdin 또는 `--file`로 명시적인 JSON을 제공합니다.
2. `--allow-network`를 지정합니다.
3. 프로세스 환경에 `TYPESAFE_API_KEY`가 이미 있습니다.

```sh
node scripts/jev-evaluate.mjs --allow-network --file evaluation.json
```

엔드포인트는 고정되어 있고, 리디렉션은 거부하며, 입력은 256 KiB로 제한합니다. 시간 제한이 있고 자동 재시도하지 않으며 HTTP 오류 본문도 출력하지 않습니다. 실제 자격 증명으로 실행하면 외부 사용 비용이 발생할 수 있습니다. 테스트는 모의 전송만 사용합니다.

## Claude Code 설치

Claude Code 세션에서 `<owner>`를 공개 저장소의 소유자 계정명으로 바꾸어 실행합니다.

```text
/plugin marketplace add <owner>/jev-for-claude
/plugin install jev-workflows@jev-workflows-marketplace
```

전체 프로젝트에서 쓰려면 사용자 범위를, 제한적으로 쓰려면 프로젝트 또는 로컬 범위를 선택합니다. 플러그인을 다시 로드하거나 새 세션을 시작한 뒤 `/jev-workflows:safety-preflight`를 실행합니다. 설치만으로 Jev 네트워크 호출이 활성화되거나 API 키가 저장되지는 않습니다.

## 로컬 검증

Node.js 20 이상이 필요하며 패키지 의존성은 없습니다.

```sh
npm test
npm run privacy
bash gates/verify_jev_for_claude.sh
```

마스터 게이트는 Claude 실행 파일이 있을 때 `claude plugin validate --strict`도 실행합니다. 공개 프로젝트 브랜드는 Jev for Claude로 유지하고, Claude 내부 플러그인 ID는 중립적인 `jev-workflows`를 사용합니다. 플러그인을 설치하거나 유료 Claude 세션을 시작하지 않습니다.

개발 중 한 세션에서만 로드하려면 저장소 루트에서 다음을 실행할 수 있습니다.

```sh
claude --plugin-dir .
```

## 개인정보 및 공개 전 점검

개인정보 스캐너는 심볼릭 링크, 비공개 파일명, 바이너리 및 과대 파일, 이메일, 절대 홈 경로, 호스팅 계정 식별자, 흔한 토큰 형식, 개인 키, Bearer 값을 탐지합니다. Git 저장소인 경우 커밋 작성자와 메시지, 로컬 Git 메타데이터, 제한 범위 안의 모든 도달 가능한 과거 blob을 검사합니다. 결과에는 원본 파일명, 일치한 비밀값, Git 오류 원문을 출력하지 않습니다.

전송 메타데이터에 한해서 자격 증명이 없는 정규 GitHub 원격 주소를 허용합니다. 허용 형식은 HTTPS `github.com/<owner>/<repository>[.git]` 또는 사용자 `git`, 호스트 `github.com`, `<owner>/<repository>.git` 경로를 사용하는 정규 SSH scp 형식입니다. 이 고정 SSH 전송 사용자를 제외한 사용자 정보, 비밀번호, 쿼리 문자열, 프래그먼트, 토큰, 비공개 경로, 비정규 GitHub 주소는 계속 차단 대상입니다. 저장소 파일이나 커밋 내용에 적힌 URL에는 이 예외를 적용하지 않습니다.

Git 커밋은 일반 작성자 이름 `Jev for Claude Contributors`와 예약 도메인 `example.invalid`의 로컬 파트 `contributors`를 사용한 비개인 주소를 전제로 합니다. 스캐너는 공개 안전을 보장하지 않습니다. 공개 전에는 스테이징 변경과 Git 이력을 사람이 다시 검토해야 합니다.

## 명확한 비지원 범위

- 자동 네트워크 호출
- 전체 대화나 로컬 Claude 설정 읽기
- 전역 설치, GitHub 저장소 생성, 커밋, 푸시, 릴리스
- 지시문만으로 인터럽트 라우팅이나 백그라운드 스케줄링을 구현했다는 주장
- 로컬 `CLAUDE.md`, 사용자 설정, 제3자 저장소 콘텐츠의 복사

## 라이선스

MIT. 저작권 표기는 특정 개인이 아닌 일반 기여자 집단 이름만 사용합니다.
