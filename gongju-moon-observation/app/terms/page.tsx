import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-space-950 px-5 py-10 text-slate-100">
      <article className="mx-auto max-w-3xl rounded-3xl border border-space-700 bg-space-800 p-6 shadow-card sm:p-8">
        <p className="text-xs font-bold text-amber-300">공주 달 관찰 탐험대</p>
        <h1 className="mt-1 text-3xl font-black">서비스 이용 안내</h1>
        <p className="mt-3 text-sm text-slate-400">최종 수정: 2026년 8월 24일</p>
        <div className="mt-7 space-y-7 text-sm leading-7 text-slate-300">
          <section><h2 className="text-xl font-black text-white">교육 목적</h2><p className="mt-2">이 서비스는 학교 과학 수업의 달 관찰 활동과 자료 수합을 돕기 위한 도구입니다. 천문 계산값은 교육용 참고값이며 실제 관찰 환경과 차이가 있을 수 있습니다.</p></section>
          <section><h2 className="text-xl font-black text-white">교사의 책임</h2><p className="mt-2">교사는 학생과 보호자에게 활동 목적, 제출 자료의 범위, 보관 기간과 공개 범위를 안내하고 학교의 개인정보·사진 촬영 지침을 준수해야 합니다. 학생 갤러리가 불필요한 경우 관리 화면에서 끄는 것을 권장합니다.</p></section>
          <section><h2 className="text-xl font-black text-white">학생 촬영 안전</h2><p className="mt-2">얼굴, 집 주소, 차량 번호, 정확한 위치 등 불필요한 개인정보가 보이지 않도록 달과 하늘을 중심으로 촬영해야 합니다. 사진의 EXIF 위치정보는 제출 과정에서 제거합니다.</p></section>
          <section><h2 className="text-xl font-black text-white">Google Drive</h2><p className="mt-2">제출 파일은 교사가 소유한 Google Drive 공간을 사용합니다. Drive 용량 부족, 학교 관리자 정책, 교사의 권한 해제 또는 Google API 장애로 제출이 일시 중단될 수 있습니다.</p></section>
          <section><h2 className="text-xl font-black text-white">서비스 변경</h2><p className="mt-2">보안, 법령, Google API 정책 또는 교육 현장의 필요에 따라 기능과 운영 방식이 변경될 수 있습니다. 중요한 변경은 서비스 화면 또는 저장소 문서에 안내합니다.</p></section>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/admin" className="rounded-xl bg-amber-500 px-5 py-3 font-black text-space-950">교사 관리로 돌아가기</Link>
          <Link href="/privacy" className="rounded-xl border border-space-600 bg-space-900 px-5 py-3 font-bold">개인정보 처리 안내</Link>
        </div>
      </article>
    </main>
  );
}
