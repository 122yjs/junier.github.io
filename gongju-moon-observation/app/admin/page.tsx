"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

interface ProfileResult {
  authenticated: boolean;
  googleOAuthConfigured: boolean;
  teacher?: { email: string; displayName: string; rootFolderUrl: string };
  classRoom?: { id: string; label: string; galleryEnabled: boolean; driveFolderUrl: string };
  reconnectUrl?: string;
  message?: string;
}

interface Observation {
  id: string;
  studentNumber: number;
  studentName: string;
  observedAt: string;
  memo: string;
  imageBytes: number;
  status: "visible" | "hidden";
  createdAt: string;
  imageUrl: string;
  driveUrl: string | null;
}

interface ObservationPage {
  items: Observation[];
  hasMore: boolean;
  nextCursor: string | null;
  message?: string;
}

export default function AdminPage() {
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [items, setItems] = useState<Observation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [joinUrl, setJoinUrl] = useState("");
  const [label, setLabel] = useState("4학년 1반");
  const [galleryEnabled, setGalleryEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadRecords = useCallback(async (nextCursor: string | null = null, append = false) => {
    const query = new URLSearchParams({ limit: "30" });
    if (nextCursor) query.set("cursor", nextCursor);
    const response = await fetch(`/api/admin/observations?${query}`, { credentials: "same-origin" });
    const result = (await response.json().catch(() => ({}))) as ObservationPage;
    if (!response.ok) throw new Error(result.message || "관찰 기록을 불러오지 못했습니다.");
    setItems((current) => append ? [...current, ...result.items] : result.items);
    setCursor(result.nextCursor);
    setHasMore(result.hasMore);
  }, []);

  const loadInvite = useCallback(async () => {
    const response = await fetch("/api/admin/invite", { credentials: "same-origin" });
    const result = (await response.json().catch(() => ({}))) as { joinUrl?: string; message?: string };
    if (!response.ok) throw new Error(result.message || "수업 참여 링크를 불러오지 못했습니다.");
    setJoinUrl(result.joinUrl || "");
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/profile", { credentials: "same-origin" });
      const result = (await response.json().catch(() => ({}))) as ProfileResult;
      if (!response.ok) throw new Error(result.message || "교사 정보를 불러오지 못했습니다.");
      setProfile(result);
      if (result.authenticated && result.classRoom) {
        setLabel(result.classRoom.label);
        setGalleryEnabled(result.classRoom.galleryEnabled);
        await Promise.all([loadInvite(), loadRecords()]);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "교사 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [loadInvite, loadRecords]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryError = params.get("error");
    const connected = params.get("connected") === "1";
    if (params.size) window.history.replaceState({}, "", "/admin");
    void loadProfile().finally(() => {
      if (queryError) setErrorMessage(queryError);
      if (connected) setMessage("Google Drive 연결을 완료했습니다.");
    });
  }, [loadProfile]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, galleryEnabled }),
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "학급 설정을 저장하지 못했습니다.");
      setMessage(result.message || "학급 설정을 저장했습니다.");
      await loadProfile();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "학급 설정을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function rotateInvite() {
    if (!window.confirm("새 수업 참여 링크를 만들까요? 기존 링크로는 새 기기가 입장할 수 없습니다.")) return;
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/invite", { method: "POST", credentials: "same-origin" });
      const result = (await response.json().catch(() => ({}))) as { joinUrl?: string; message?: string };
      if (!response.ok) throw new Error(result.message || "새 수업 링크를 만들지 못했습니다.");
      setJoinUrl(result.joinUrl || "");
      setMessage(result.message || "새 수업 링크를 만들었습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "새 수업 링크를 만들지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(item: Observation) {
    const status = item.status === "visible" ? "hidden" : "visible";
    setErrorMessage("");
    const response = await fetch(`/api/admin/observations/${item.id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setErrorMessage(result.message || "공개 상태를 바꾸지 못했습니다.");
      return;
    }
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status } : entry));
    setMessage(result.message || "공개 상태를 변경했습니다.");
  }

  async function remove(item: Observation) {
    if (!window.confirm(`${item.studentNumber}번 ${item.studentName} 학생의 사진과 기록을 Google Drive에서 완전히 삭제할까요?`)) return;
    setErrorMessage("");
    const response = await fetch(`/api/admin/observations/${item.id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const result = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setErrorMessage(result.message || "관찰 기록을 삭제하지 못했습니다.");
      return;
    }
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setMessage(result.message || "관찰 기록을 삭제했습니다.");
  }

  async function disconnect() {
    if (!window.confirm("중앙 서비스 연결을 해제할까요? 선생님의 Google Drive 폴더와 사진은 그대로 남습니다.")) return;
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/disconnect", { method: "DELETE", credentials: "same-origin" });
      const result = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(result.message || "연결을 해제하지 못했습니다.");
      setProfile({ authenticated: false, googleOAuthConfigured: true });
      setItems([]);
      setJoinUrl("");
      setMessage(result.message || "중앙 서비스 연결을 해제했습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "연결을 해제하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
    setProfile({ authenticated: false, googleOAuthConfigured: profile?.googleOAuthConfigured ?? true });
    setItems([]);
    setJoinUrl("");
  }

  if (profile === null && loading) {
    return <main className="grid min-h-screen place-items-center bg-space-950 text-amber-300">교사 관리 화면을 준비하고 있어요…</main>;
  }

  if (!profile?.authenticated) {
    const configured = profile?.googleOAuthConfigured !== false;
    return (
      <main className="grid min-h-screen place-items-center bg-space-950 px-5 py-10 text-slate-100">
        <section className="w-full max-w-lg rounded-3xl border border-space-700 bg-space-800 p-7 shadow-card">
          <p className="text-xs font-bold text-amber-300">교사용 중앙 서비스</p>
          <h1 className="mt-1 text-2xl font-black">내 Google Drive에 제출받기</h1>
          <p className="mt-4 text-sm leading-7 text-slate-300">교사가 Google 계정을 한 번 연결하면 전용 폴더와 학생 QR이 자동으로 만들어집니다. 학생은 Google 로그인 없이 사진을 제출합니다.</p>
          <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-400/[.07] p-4 text-sm leading-6 text-blue-100">
            이 앱은 <strong>drive.file</strong> 권한만 요청하며, 앱이 만든 폴더와 파일만 관리합니다. 학생 사진·이름·메모는 중앙 D1이 아니라 선생님의 Google Drive 파일에 저장됩니다.
          </div>
          {message ? <p className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p> : null}
          {errorMessage ? <p className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200" role="alert">{errorMessage}</p> : null}
          {configured ? (
            <a href="/api/oauth/google/start?returnTo=%2Fadmin" className="mt-6 flex w-full items-center justify-center rounded-xl bg-amber-500 px-5 py-3.5 font-black text-space-950 hover:bg-amber-400">Google Drive 연결하기</a>
          ) : (
            <p className="mt-6 rounded-xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-200">운영자가 Google OAuth Client ID와 Secret을 아직 설정하지 않았습니다.</p>
          )}
          <Link href="/" className="mt-4 block text-center text-sm font-bold text-slate-400 hover:text-amber-300">학생 화면으로 돌아가기</Link>
          <div className="mt-4 flex justify-center gap-4 text-xs text-slate-500"><Link href="/privacy">개인정보 처리 안내</Link><Link href="/terms">이용 안내</Link></div>
        </section>
      </main>
    );
  }

  const teacher = profile.teacher!;
  const classRoom = profile.classRoom!;
  return (
    <main className="min-h-screen bg-space-950 px-4 py-7 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-300">교사용 관리 · {classRoom.label}</p>
            <h1 className="mt-1 text-2xl font-black">달 관찰 기록</h1>
            <p className="mt-1 text-sm text-slate-400">{teacher.displayName} · {teacher.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="rounded-xl border border-space-600 bg-space-800 px-4 py-2 text-sm font-bold">학생 화면</Link>
            <a href={profile.reconnectUrl || "/api/oauth/google/start?returnTo=%2Fadmin"} className="rounded-xl border border-space-600 bg-space-800 px-4 py-2 text-sm font-bold">Drive 다시 연결</a>
            <button onClick={signOut} className="rounded-xl border border-space-600 bg-space-800 px-4 py-2 text-sm font-bold">로그아웃</button>
            <button disabled={loading} onClick={disconnect} className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2 text-sm font-bold text-red-200 disabled:opacity-60">연결 해제</button>
          </div>
        </header>

        {message ? <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p> : null}
        {errorMessage ? <p className="rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200" role="alert">{errorMessage}</p> : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <form onSubmit={saveSettings} className="rounded-3xl border border-space-700 bg-space-800 p-6 shadow-card">
            <p className="text-xs font-bold text-amber-300">학급 설정</p>
            <h2 className="mt-1 text-xl font-black">제출함 이름과 공개 범위</h2>
            <label className="mt-5 block text-sm font-bold">학급명
              <input value={label} onChange={(event: ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)} maxLength={50} required className="mt-2 w-full rounded-xl border border-space-600 bg-space-900 px-4 py-3 text-white" />
            </label>
            <label className="mt-4 flex items-start gap-3 rounded-2xl border border-space-700 bg-space-900/60 p-4 text-sm leading-6">
              <input type="checkbox" checked={galleryEnabled} onChange={(event: ChangeEvent<HTMLInputElement>) => setGalleryEnabled(event.target.checked)} className="mt-1 h-4 w-4" />
              <span><strong>학생 갤러리 사용</strong><br /><span className="text-slate-400">켜면 수업 QR로 입장한 학생끼리 마스킹된 이름과 사진을 볼 수 있습니다.</span></span>
            </label>
            <div className="mt-5 flex flex-wrap gap-2">
              <button disabled={loading} className="rounded-xl bg-amber-500 px-5 py-3 font-black text-space-950 disabled:opacity-60">설정 저장</button>
              <a href={classRoom.driveFolderUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-space-600 bg-space-900 px-5 py-3 font-bold">Drive 폴더 열기</a>
              <a href={teacher.rootFolderUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-space-600 bg-space-900 px-5 py-3 font-bold">전체 앱 폴더</a>
            </div>
          </form>

          <section className="rounded-3xl border border-space-700 bg-space-800 p-6 text-center shadow-card">
            <p className="text-xs font-bold text-amber-300">학생 수업 참여</p>
            <h2 className="mt-1 text-xl font-black">QR을 학생에게 보여 주세요</h2>
            {joinUrl ? (
              <>
                <div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={joinUrl} size={220} level="M" includeMargin /></div>
                <p className="mt-4 break-all text-xs leading-5 text-slate-400">{joinUrl}</p>
                <p className="mt-3 text-xs leading-5 text-slate-500">한 번 입장한 학생 기기는 60일 동안 제출할 수 있습니다.</p>
                <button type="button" disabled={loading} onClick={rotateInvite} className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-2.5 text-sm font-black text-red-200 disabled:opacity-60">새 QR 만들기</button>
              </>
            ) : <p className="mt-8 text-sm text-slate-400">수업 링크를 불러오고 있어요…</p>}
          </section>
        </div>

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold text-amber-300">선생님의 Google Drive에서 불러옴</p><h2 className="mt-1 text-2xl font-black">제출 기록</h2></div>
            <button onClick={() => { setLoading(true); void loadRecords().catch((error) => setErrorMessage(error.message)).finally(() => setLoading(false)); }} className="rounded-xl border border-space-600 bg-space-800 px-4 py-2.5 text-sm font-bold">↻ 새로고침</button>
          </div>
          {items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-space-600 bg-space-800/50 py-14 text-center text-slate-400">아직 제출된 사진이 없습니다.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-space-700 bg-space-800 shadow-card">
                  <img src={item.imageUrl} alt={`${item.studentNumber}번 ${item.studentName} 학생의 달 관찰 사진`} className="h-56 w-full bg-space-900 object-cover" loading="lazy" />
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-black">{item.studentNumber}번 {item.studentName}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.status === "visible" ? "bg-emerald-400/10 text-emerald-300" : "bg-slate-500/15 text-slate-400"}`}>{item.status === "visible" ? "학생 공개" : "숨김"}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">관찰 {formatObservedAt(item.observedAt)} · {formatBytes(item.imageBytes)}</p>
                    {item.memo ? <p className="mt-3 rounded-xl border border-space-700 bg-space-900/60 p-3 text-sm leading-6 text-slate-300">{item.memo}</p> : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => void updateStatus(item)} className="rounded-lg border border-space-600 px-3 py-2 text-xs font-bold">{item.status === "visible" ? "갤러리 숨김" : "다시 공개"}</button>
                      {item.driveUrl ? <a href={item.driveUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-space-600 px-3 py-2 text-xs font-bold">Drive 열기</a> : null}
                      <button onClick={() => void remove(item)} className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-200">완전 삭제</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {hasMore ? <div className="text-center"><button disabled={loading} onClick={() => { setLoading(true); void loadRecords(cursor, true).catch((error) => setErrorMessage(error.message)).finally(() => setLoading(false)); }} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-6 py-3 text-sm font-black text-amber-200 disabled:opacity-60">기록 더 보기</button></div> : null}
        </section>
        <footer className="flex justify-center gap-5 border-t border-space-800 pt-5 text-xs text-slate-500"><Link href="/privacy">개인정보 처리 안내</Link><Link href="/terms">이용 안내</Link></footer>
      </div>
    </main>
  );
}

function formatObservedAt(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

function formatBytes(value: number) {
  if (!value) return "용량 미확인";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))}KB`;
  return `${(value / 1024 / 1024).toFixed(1)}MB`;
}
