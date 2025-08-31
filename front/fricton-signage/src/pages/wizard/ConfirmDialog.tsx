// ConfirmDialog.tsx

type Props = {
  open: boolean;
  title?: string;
  summary: {
    imagesCount: number;
    audioCount: number;
    datetimeText: string; // 例: "8/31 19:00~20:00"
  };
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean; // 送信中の無効化
};

export default function ConfirmDialog({
  open,
  title = "申請内容の確認",
  summary,
  onCancel,
  onConfirm,
  confirming = false,
}: Props) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 92vw)",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 10, fontSize: 14 }}>
          <div>画像：{summary.imagesCount}枚</div>
          <div>音声ファイル：{summary.audioCount > 0 ? `${summary.audioCount}つあり` : "なし"}</div>
          <div>日程：{summary.datetimeText}</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>
            以上の内容でよろしいですか？
          </div>
        </div>

        <div
          style={{
            padding: 12,
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onCancel}
            disabled={confirming}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            いいえ
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid transparent",
              background: "#0ea5e9",
              color: "#fff",
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            {confirming ? "送信中…" : "はい"}
          </button>
        </div>
      </div>
    </div>
  );
}
