import { useEffect, useMemo, useRef, useState } from "react";

type Submission = {
  id: string;
  companyName: string;
  imageUrl: string;
  title?: string;
  submittedAt: string; // ISO
};

type Reviewed = Submission & { status: "approved" | "rejected"; decidedAt: string };

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
      // ★本番APIに差し替え：status=pending の一覧を返す
      const res = await fetch("/api/admin/review/queue?status=pending", { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  async function approve(id: string) {
    const item = pending.find(p => p.id === id);
    if (!item) return;
    try {
      // ★本番APIに差し替え
      const res = await fetch(`/api/admin/review/${id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      alert("承認に失敗しました。");
    }
  }

  async function reject(id: string) {
    const item = pending.find(p => p.id === id);
    if (!item) return;
    try {
      // ★本番APIに差し替え
      const res = await fetch(`/api/admin/review/${id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
      alert("非認証に失敗しました。");
    }
  }

  // まとめ操作（任意）
  const approveSelected = () => Array.from(selecting).forEach(approve);
  const rejectSelected =  () => Array.from(selecting).forEach(reject);

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
                  <span
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 8,
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 8px",
                      borderRadius: 999,
                      color: item.status === "approved" ? "#065f46" : "#7f1d1d",
                      background: item.status === "approved" ? "#d1fae5" : "#fee2e2",
                      border: `1px solid ${
                        item.status === "approved" ? "#10b981" : "#f87171"
                      }`,
                    }}
                  >
                    {item.status === "approved" ? "認証済み" : "非認証"}
                  </span>
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{item.companyName}</div>
                    <div style={{ color: "#666" }}>{fmt.format(new Date(item.decidedAt))}</div>
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
          <img
            src={preview.imageUrl}
            alt={preview.title ?? "preview"}
            style={{
              maxWidth: "90vw",
              maxHeight: "85vh",
              objectFit: "contain",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              borderRadius: 12,
              background: "#000",
            }}
            draggable={false}
          />
        </div>
      )}
    </div>
  );
}
