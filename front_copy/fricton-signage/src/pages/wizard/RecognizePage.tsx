import { useEffect, useMemo, useRef, useState } from "react";

type Submission = {
  id: string;
  companyName: string;
  imageUrl: string;
  title?: string;
  submittedAt: string; // ISO

  // ★ 追加: 文字情報（ユーザ画面のプレビューを再現するため）
  message?: string;
  caption?: string;
  lines?: string[];
  textColor?: string;

  // ★ 追加: プレビュー配置・スタイル一式（ユーザ画面のTEMPLATESに相当）
  overlay?: {
    templateId?: string;
    imageBox?: { x: number; y: number; w: number; h: number; mode: "cover" | "contain" };
    textBoxes?: Array<{
      key: string;
      x: number; y: number; w: number; h: number;
      align?: "left" | "center" | "right";
      valign?: "top" | "middle" | "bottom";
      color?: string;
      fontSize?: number;
      weight?: 400 | 600 | 700 | 800;
      lines?: number;
    }>;
    values?: Record<string, string>;
  };
};

type Reviewed = Submission & { status: "approved" | "rejected"; decidedAt: string };

// ===== 追加: API ベースURLと認証ヘッダ =====
const API_ROOT =
  (import.meta as any)?.env?.VITE_API_ROOT ?? "http://localhost:8000"; // 例: http://localhost:8000
const TOKEN_KEY = "token"; // 管理ログインで保存している想定（なければ未付与でOK）

const authHeaders = (): HeadersInit => {
  const t = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
};
const apiGet = async (path: string, signal?: AbortSignal) => {
  const res = await fetch(`${API_ROOT}${path}`, { signal, headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
};
const apiPost = async (path: string) => {
  const res = await fetch(`${API_ROOT}${path}`, { method: "POST", headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
};
/** ★ 追加: JSONを送るPOST（将来のメール通知API用。現行APIは無視してもOK） */
const apiPostJSON = async (path: string, body: any) => {
  const res = await fetch(`${API_ROOT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
};

/** ★ 追加: overlay を使って文字を重ね描画する小コンポーネント */
function TextOverlay({
  item,
  mode = "card", // card | preview | reviewed
}: {
  item: Submission;
  mode?: "card" | "preview" | "reviewed";
}) {
  const tbJustify = (v?: "top" | "middle" | "bottom") =>
    v === "middle" ? "center" : v === "bottom" ? "flex-end" : "flex-start";
  const textAlign = (a?: "left" | "center" | "right") => a ?? "left";

  // カード/レビューカードは小さめなので少し縮小、プレビューは等倍
  const fontScale = mode === "preview" ? 1.0 : 0.6;

  // overlay がある場合は overlay.values を優先して描画
  if (item.overlay?.textBoxes && item.overlay.values) {
    return (
      <>
        {item.overlay.textBoxes.map((tb, idx) => {
          const value = item.overlay!.values![tb.key] ?? "";
          if (!value) return null;
          // 指定がなければバックアップとして Submission.textColor
          const color = tb.color || item.textColor || "#ffffff";
          const weight = tb.weight ?? 700;
          const fontSize = Math.max(10, Math.round((tb.fontSize ?? 24) * fontScale)); // px基準
          const lines = (value || "").split(/\r?\n/);
          const maxLines = tb.lines && tb.lines > 0 ? tb.lines : undefined;
          const showLines = maxLines ? lines.slice(0, maxLines) : lines;

          return (
            <div
              key={`${tb.key}-${idx}`}
              style={{
                position: "absolute",
                left: `${tb.x}%`,
                top: `${tb.y}%`,
                width: `${tb.w}%`,
                height: `${tb.h}%`,
                display: "flex",
                justifyContent: tbJustify(tb.valign),
                textAlign: textAlign(tb.align),
                // テキストの影を薄く入れて視認性UP（最小限）
                textShadow: "0 1px 3px rgba(0,0,0,0.35)",
                pointerEvents: "none",
                overflow: "hidden",
              }}
            >
              <div style={{ width: "100%" }}>
                {showLines.map((ln, i) => (
                  <div
                    key={i}
                    style={{
                      color,
                      fontSize,
                      fontWeight: weight,
                      lineHeight: 1.25,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {ln}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </>
    );
  }

  // overlay が無い既存データ向けの後方互換（message / caption / lines / textColor）
  const fallbackTexts: string[] = [];
  if (item.title) fallbackTexts.push(item.title);
  if (item.message) fallbackTexts.push(item.message);
  if (item.caption) fallbackTexts.push(item.caption);
  if (item.lines && item.lines.length > 0) fallbackTexts.push(...item.lines);
  if (fallbackTexts.length === 0) return null;

  const color = item.textColor || "#ffffff";
  const baseSize = mode === "preview" ? 28 : 16;

  return (
    <div
      style={{
        position: "absolute",
        left: "5%",
        bottom: "6%",
        width: "90%",
        display: "flex",
        justifyContent: "center",
        textAlign: "center",
        textShadow: "0 1px 3px rgba(0,0,0,0.35)",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: "100%" }}>
        {fallbackTexts.slice(0, 5).map((t, i) => (
          <div
            key={i}
            style={{
              color,
              fontSize: Math.round(baseSize * (1 - i * 0.08)),
              fontWeight: i === 0 ? 700 : 600,
              lineHeight: 1.25,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminAuthPage() {
  // 上段：未認証（待機中）
  const [pending, setPending] = useState<Submission[]>([]);
  // 下段：処理済み（認証 or 非認証）
  const [reviewed, setReviewed] = useState<Reviewed[]>([]);
  // UI状態
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState<Set<string>>(new Set()); // 複数選択（任意）
  const [preview, setPreview] = useState<Submission | null>(null);
  const pollRef = useRef<number | null>(null);

  // ========== ユーティリティ ==========
  const fmt = useMemo(
    () => new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" }),
    []
  );
  const toggleSelect = (id: string) => {
    setSelecting(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // ========== データ取得 ==========
  async function fetchPending(signal?: AbortSignal) {
    setLoading(true);
    try {
      // ★ 絶対URL + （あれば）Bearer 付与
      const res = await apiGet("/api/admin/review/queue?status=pending", signal);
      const list: Submission[] = await res.json();
      setPending(list);
    } catch (e) {
      if ((e as any).name !== "AbortError") console.error(e);
    } finally {
      setLoading(false);
    }
  }

  // 初回＋ポーリング（Zoomの待機室っぽく新着を吸い上げ）
  useEffect(() => {
    const c = new AbortController();
    fetchPending(c.signal);

    // 10秒ごとに更新（必要に応じてWebSocket/SSEに置換）
    pollRef.current = window.setInterval(() => fetchPending(), 10000);
    return () => {
      c.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ========== アクション（認証／非認証） ==========
  /** ★ 追加: 承認時にメール通知（将来のAPIを想定。現行APIは ?notify=1 を無視してもOK） */
  async function approve(id: string) {
    const item = pending.find(p => p.id === id);
    if (!item) return;
    try {
      // 任意メッセージ入力（空でも可 / Cancel で空）
      const note = window.prompt("ユーザーへのメッセージ（任意）を入力してください。\n※この内容が審査結果メールに入ります。", "") ?? "";

      // ★ メール通知フラグ付きで叩く（将来APIで利用）。現行は無視されても200ならOK。
      await apiPostJSON(`/api/admin/review/${id}/approve?notify=1`, { note });

      // 楽観的更新：上から外し、下に流す
      setPending(prev => prev.filter(p => p.id !== id));
      setReviewed(prev => [
        { ...item, status: "approved", decidedAt: new Date().toISOString() },
        ...prev,
      ]);
      setSelecting(prev => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch (e) {
      console.error(e);
      // フォールバック：旧API（メール通知未実装）の場合、従来のエンドポイントで再試行
      try {
        await apiPost(`/api/admin/review/${id}/approve`);
        setPending(prev => prev.filter(p => p.id !== id));
        setReviewed(prev => [
          { ...item, status: "approved", decidedAt: new Date().toISOString() },
          ...prev,
        ]);
        setSelecting(prev => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      } catch (e2) {
        console.error(e2);
        alert("承認に失敗しました。");
      }
    }
  }

  /** ★ 追加: 非認証時にメール通知（同様に ?notify=1 + 任意メッセージ） */
  async function reject(id: string) {
    const item = pending.find(p => p.id === id);
    if (!item) return;
    try {
      const note = window.prompt("ユーザーへのメッセージ（任意）を入力してください。\n※この内容が審査結果メールに入ります。", "") ?? "";
      await apiPostJSON(`/api/admin/review/${id}/reject?notify=1`, { note });

      setPending(prev => prev.filter(p => p.id !== id));
      setReviewed(prev => [
        { ...item, status: "rejected", decidedAt: new Date().toISOString() },
        ...prev,
      ]);
      setSelecting(prev => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } catch (e) {
      console.error(e);
      // フォールバック（旧API）
      try {
        await apiPost(`/api/admin/review/${id}/reject`);
        setPending(prev => prev.filter(p => p.id !== id));
        setReviewed(prev => [
          { ...item, status: "rejected", decidedAt: new Date().toISOString() },
          ...prev,
        ]);
        setSelecting(prev => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      } catch (e2) {
        console.error(e2);
        alert("非認証に失敗しました。");
      }
    }
  }

  // まとめ操作（任意） — ★ 追加: ひとつのメッセージで一括送信
  const approveSelected = () => {
    if (selecting.size === 0) return;
    const note = window.prompt(`選択(${selecting.size})件を承認します。ユーザーへのメッセージ（任意）:`, "") ?? "";
    Array.from(selecting).forEach(async (id) => {
      const item = pending.find(p => p.id === id);
      if (!item) return;
      try {
        await apiPostJSON(`/api/admin/review/${id}/approve?notify=1`, { note });
        setPending(prev => prev.filter(p => p.id !== id));
        setReviewed(prev => [{ ...item, status: "approved", decidedAt: new Date().toISOString() }, ...prev]);
      } catch {
        try {
          await apiPost(`/api/admin/review/${id}/approve`);
          setPending(prev => prev.filter(p => p.id !== id));
          setReviewed(prev => [{ ...item, status: "approved", decidedAt: new Date().toISOString() }, ...prev]);
        } catch (e) {
          console.error(e);
        }
      } finally {
        setSelecting(prev => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    });
  };

  const rejectSelected = () => {
    if (selecting.size === 0) return;
    const note = window.prompt(`選択(${selecting.size})件を非認証にします。ユーザーへのメッセージ（任意）:`, "") ?? "";
    Array.from(selecting).forEach(async (id) => {
      const item = pending.find(p => p.id === id);
      if (!item) return;
      try {
        await apiPostJSON(`/api/admin/review/${id}/reject?notify=1`, { note });
        setPending(prev => prev.filter(p => p.id !== id));
        setReviewed(prev => [{ ...item, status: "rejected", decidedAt: new Date().toISOString() }, ...prev]);
      } catch {
        try {
          await apiPost(`/api/admin/review/${id}/reject`);
          setPending(prev => prev.filter(p => p.id !== id));
          setReviewed(prev => [{ ...item, status: "rejected", decidedAt: new Date().toISOString() }, ...prev]);
        } catch (e) {
          console.error(e);
        }
      } finally {
        setSelecting(prev => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    });
  };

  return (
    <div style={{ maxWidth: 1200, margin: "24px auto", padding: 16 }}>
      <h2 style={{ marginBottom: 8 }}>画像認証（管理）</h2>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
        未認証の投稿が上段に一覧表示され、承認／非認証後は下段に移動します。
      </div>

      {/* 上段：未認証 */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: "12px 0" }}>
            未認証（{pending.length}{loading ? " 取得中…" : ""}）
          </h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={approveSelected} disabled={selecting.size === 0}>選択を承認</button>
            <button onClick={rejectSelected} disabled={selecting.size === 0}>選択を非認証</button>
          </div>
        </div>

        {pending.length === 0 ? (
          <div style={{ padding: 16, color: "#666", background: "#fafafa", borderRadius: 8 }}>
            待機中の投稿はありません。
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {pending.map(item => (
              <article
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  background: "#fff",
                }}
              >
                <div
                  style={{ position: "relative", width: "100%", paddingTop: "66%" }}
                  onClick={() => setPreview(item)}
                  title="クリックで拡大プレビュー"
                >
                  <img
                    src={item.imageUrl}
                    alt={item.title ?? "submission"}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      cursor: "zoom-in",
                    }}
                    draggable={false}
                  />
                  {/* ★ 追加: テキスト重ね描画 */}
                  <TextOverlay item={item} mode="card" />
                </div>
                <div style={{ padding: 10, display: "grid", gap: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {item.companyName}
                  </div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    受信: {fmt.format(new Date(item.submittedAt))}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={selecting.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                    />
                    複数選択
                  </label>
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <button onClick={() => approve(item.id)} style={{ flex: 1 }}>
                      承認
                    </button>
                    <button onClick={() => reject(item.id)} style={{ flex: 1 }}>
                      非認証
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 下段：処理済み（画面の下半分イメージ） */}
      <section style={{ marginTop: 24 }}>
        <h3 style={{ margin: "12px 0" }}>処理済み（最新順）</h3>
        {reviewed.length === 0 ? (
          <div style={{ padding: 16, color: "#666", background: "#fafafa", borderRadius: 8 }}>
            まだ処理済みの項目はありません。
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            {reviewed.map(item => (
              <article
                key={`${item.id}-${item.decidedAt}`}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#fff",
                }}
              >
                <div style={{ position: "relative", width: "100%", paddingTop: "56%" }}>
                  <img
                    src={item.imageUrl}
                    alt={item.title ?? "submission"}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                    draggable={false}
                  />
                  {/* ★ 追加: テキスト重ね描画（処理済み側） */}
                  <TextOverlay item={item} mode="reviewed" />
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 8px",
                      borderRadius: 999,
                      color: (item as Reviewed).status === "approved" ? "#065f46" : "#7f1d1d",
                      background: (item as Reviewed).status === "approved" ? "#d1fae5" : "#fee2e2",
                      border: `1px solid ${
                        (item as Reviewed).status === "approved" ? "#10b981" : "#f87171"
                      }`,
                    }}
                  >
                    {(item as Reviewed).status === "approved" ? "認証済み" : "非認証"}
                  </span>
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{item.companyName}</div>
                    <div style={{ color: "#666" }}>{fmt.format(new Date((item as Reviewed).decidedAt))}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* シンプルプレビュー（オーバーレイ） */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
            cursor: "zoom-out",
          }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "85vh",
              aspectRatio: "16 / 9",
              // 画像は contain に、上にテキストを重ねる
            }}
          >
            <img
              src={preview.imageUrl}
              alt={preview.title ?? "preview"}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                borderRadius: 12,
                background: "#000",
              }}
              draggable={false}
            />
            {/* ★ 追加: プレビューにも文字重ね */}
            <TextOverlay item={preview} mode="preview" />
          </div>
        </div>
      )}
    </div>
  );
}
