import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-space-950 px-5 py-10 text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-space-700 bg-space-800 p-6 shadow-card sm:p-8">
        <p className="text-xs font-bold text-amber-300">공주 달 관찰 탐험대</p>
        <h1 className="mt-1 text-3xl font-black">개인정보 처리 안내</h1>
        <p className="mt-3 text-sm text-slate-400">최종 수정: 2026년 8월 24일</p>

        <section className="mt-7 space-y-3 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-black text-white">1. 서비스의 역할</h2>
          <p>이 서비스는 교사가 자신의 Google Drive를 연결하고, 학생의 달 관찰 사진과 기록을 해당 교사의 앱 전용 Drive 폴더로 수합하도록 중계합니다.</p>
        </section>
        <section className="mt-7 space-y-3 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-black text-white">2. 중앙 서비스가 처리하는 교사 정보</h2>
          <p>Google 계정 식별자, 이메일, 표시 이름, 암호화된 refresh token, 앱이 만든 Drive 폴더 ID, 학급 설정과 수업 초대 정보를 처리합니다. refresh token은 서버에서 AES-GCM으로 암호화해 저장합니다.</p>
        </section>
        <section className="mt-7 space-y-3 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-black text-white">3. 학생 자료의 저장 위치</h2>
          <p>학생 사진·이름·번호·관찰 시각·메모는 제출 처리 중 중앙 서버를 통과하지만 중앙 D1 또는 R2에 장기 저장하지 않습니다. 검증과 사진 메타데이터 제거 후 교사의 Google Drive 파일에 저장합니다.</p>
          <p>중앙 D1에는 중복 제출 방지와 요청 제한을 위한 무작위 요청 ID, 학급 ID, 세션 ID, Drive 파일 ID, 상태와 시각만 남습니다.</p>
        </section>
        <section className="mt-7 space-y-3 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-black text-white">4. Google 권한</h2>
          <p>교사 식별을 위한 <code>openid email</code>과, 앱이 생성하거나 연결한 파일만 관리하는 <code>drive.file</code>만 요청합니다. 사용자의 Drive 전체를 읽는 권한은 요청하지 않습니다.</p>
        </section>
        <section className="mt-7 space-y-3 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-black text-white">5. 연결 해제와 삭제</h2>
          <p>교사는 관리 화면에서 연결을 해제할 수 있습니다. 연결 해제 시 중앙 D1의 교사 연결 정보·암호화 토큰·학급 정보·비식별 제출 영수증을 삭제하고 Google 토큰 폐기를 요청합니다.</p>
          <p>교사가 소유한 Google Drive 폴더와 사진은 자동 삭제하지 않습니다. 교사는 Drive에서 직접 보관하거나 삭제할 수 있습니다.</p>
        </section>
        <section className="mt-7 space-y-3 text-sm leading-7 text-slate-300">
          <h2 className="text-xl font-black text-white">6. 문의</h2>
          <p>운영 및 개인정보 문의는 Google OAuth 동의 화면에 표시된 지원 이메일로 접수합니다.</p>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-xl bg-amber-500 px-5 py-3 font-black text-space-950">교사 관리로 돌아가기</Link>
          <Link href="/terms" className="rounded-xl border border-space-600 bg-space-900 px-5 py-3 font-bold">이용 안내</Link>
        </div>
      </article>
    </main>
  );
}
