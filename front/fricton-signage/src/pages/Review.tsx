// src/pages/Review.tsx
import { useEffect, useState } from "react";
import type { FirstChoice } from "../services/api";  
import { fetchFirstChoices } from "../services/api";

export default function Review() {
  const [items, setItems] = useState<FirstChoice[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchFirstChoices()
      .then(list => { if (alive) setItems(list); })
      .catch(err => { if (alive) setError(err.message || "読み込み失敗"); });
    return () => { alive = false; }; // アンマウント時の安全策
  }, []);

  if (error) return <div style={{color:"red"}}>{error}</div>;

  return (
    <div>
      <h2>まとめ</h2>
      <ul>
        {items.map(it => (
          <li key={it.id}>{it.kind} / {it.title} / {new Date(it.created_at).toLocaleString()}</li>
        ))}
      </ul>
    </div>
  );
}
