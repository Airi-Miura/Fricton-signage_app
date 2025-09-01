import os
import json
import uuid
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Tuple

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, EmailStr  # ★ EmailStr を追加
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, OperationalError
from passlib.context import CryptContext
from jose import jwt, JWTError

# -----------------------------
# アプリDB（業務データ＋一般ユーザー）
# -----------------------------
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "appdb")
DB_USER = os.getenv("DB_USER", "app")
DB_PASS = os.getenv("DB_PASS", "secret")
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# -----------------------------
# 管理者認証DB（物理分離用）
#   ※ 未設定ならアプリDBと同一接続を使う（動作保証のため）
# -----------------------------
ADMIN_AUTH_DATABASE_URL = os.getenv("ADMIN_AUTH_DATABASE_URL", DATABASE_URL)

# アップロード保存先（環境変数で上書き可）
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

API_ORIGIN = os.getenv("API_ORIGIN", "http://localhost:8000")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-change-me")  # 本番は強い値に
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

# ★ 送信メール設定（未設定なら送信スキップ）
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
SMTP_FROM_ADDR = (
    os.getenv("SMTP_FROM_ADDR")
    or os.getenv("MAIL_FROM")
    or os.getenv("SMTP_FROM")      # ← どちらか入っていれば拾う
    or (SMTP_USER or "")
)
SMTP_FROM_NAME = (
    os.getenv("SMTP_FROM_NAME")
    or os.getenv("MAIL_FROM_NAME") # ← 追加
    or "Fricsignage"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
engine_admin = create_engine(ADMIN_AUTH_DATABASE_URL, pool_pre_ping=True)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="fricsignage API")

# ---- 簡易メールヘルパ ----
def send_mail(to_addr: str, subject: str, body: str) -> None:
    """
    SMTP_* 環境変数が揃っていない場合は送信せずに戻る（安全にスキップ）
    """

    if not (SMTP_HOST and SMTP_USER and SMTP_PASS and SMTP_FROM_ADDR and to_addr):
        # 必要情報が無い場合は黙ってスキップ（ログ等入れたければここで）
        return
    import smtplib
    from email.mime.text import MIMEText
    from email.utils import formataddr

    msg = MIMEText(body, _charset="utf-8")
    msg["Subject"] = subject
    msg["From"] = formataddr((SMTP_FROM_NAME, SMTP_FROM_ADDR))
    msg["To"] = to_addr

    print(msg["From"])
    print(msg["To"])
    print(msg["Subject"])
    print(SMTP_FROM_ADDR)

    # 587(STARTTLS) を既定。465 を使う場合は SMTP_SSL に置き換え
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASS)
        s.sendmail(SMTP_FROM_ADDR, [to_addr], msg.as_string())

# ---- 起動時初期化（DB接続の待機＋スキーマ作成）----
def init_app_db_with_retry():
    # アプリDB待機
    for _ in range(30):
        try:
            with engine.begin() as conn:
                conn.execute(text("SELECT 1"))
            break
        except OperationalError:
            time.sleep(1)

    # スキーマ（アプリDB）
    with engine.begin() as conn:
        # posts
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            kind VARCHAR(20) NOT NULL,
            title TEXT NOT NULL
        );
        """))

        # users（一般ユーザ向け）
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            role TEXT NOT NULL DEFAULT 'staff',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """))

        conn.execute(text("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='users' AND column_name='display_name'
          ) THEN
            ALTER TABLE users ADD COLUMN display_name TEXT;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='users' AND column_name='role'
          ) THEN
            ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='users' AND column_name='is_active'
          ) THEN
            ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
          END IF;

          -- ★ email カラム（NULL許可で追加。既存ユーザに配慮）
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='users' AND column_name='email'
          ) THEN
            ALTER TABLE users ADD COLUMN email TEXT;
          END IF;
        END $$;
        """))

        conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_users_username_lower
        ON users ((lower(username)));
        """))

        # ★ email 小文字ユニーク（NULL は複数可）
        conn.execute(text("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique
        ON users ((lower(email)));
        """))

        # submissions
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS submissions(
            id BIGSERIAL PRIMARY KEY,
            kind VARCHAR(20) NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            schedule_json JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """))

        # ← 不足分: 審査用カラムを足す（存在しなければ）
        conn.execute(text("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='submissions' AND column_name='status'
          ) THEN
            ALTER TABLE submissions ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
            CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='submissions' AND column_name='decided_at'
          ) THEN
            ALTER TABLE submissions ADD COLUMN decided_at TIMESTAMPTZ NULL;
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='submissions' AND column_name='company_name'
          ) THEN
            ALTER TABLE submissions ADD COLUMN company_name TEXT NOT NULL DEFAULT '';
          END IF;
        END $$;
        """))

        # submission_files
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS submission_files(
            id BIGSERIAL PRIMARY KEY,
            submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
            path TEXT NOT NULL,
            original_name TEXT NOT NULL,
            mime TEXT,
            size BIGINT
        );
        """))

        # 予約スロット（kind×day×time で一意）
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS reservation_slots (
          kind VARCHAR(20) NOT NULL,
          day  DATE NOT NULL,
          time TIME NOT NULL,
          submission_id BIGINT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT now(),
          PRIMARY KEY (kind, day, time)
        );
        """))

        # 既存 submissions の schedule_json からバックフィル（安全に重複回避）
        rows = conn.execute(text("SELECT id, kind, schedule_json FROM submissions")).mappings().all()
        for r in rows:
            sid = int(r["id"])
            k = r["kind"]
            sched = r.get("schedule_json") or {}
            if isinstance(sched, dict):
                for d, arr in sched.items():
                    if not isinstance(arr, list):
                        continue
                    for t in arr:
                        if isinstance(t, str) and len(t) == 5 and t[2] == ":":
                            conn.execute(text("""
                                INSERT INTO reservation_slots(kind, day, time, submission_id)
                                VALUES (:k, :d, :t, :sid)
                                ON CONFLICT (kind, day, time) DO NOTHING
                            """), {"k": k, "d": d, "t": t, "sid": sid})

def init_admin_auth_db_with_retry():
    # 管理認証DB待機
    for _ in range(30):
        try:
            with engine_admin.begin() as conn:
                conn.execute(text("SELECT 1"))
            break
        except OperationalError:
            time.sleep(1)

    # 管理者テーブル（admin_users）
    with engine_admin.begin() as conn:
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS admin_users (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          display_name TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT now()
        );
        """))
        conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_admin_users_username_lower
          ON admin_users ((lower(username)));
        """))

@app.on_event("startup")
def on_startup():
    init_app_db_with_retry()
    init_admin_auth_db_with_retry()

# ---- ミドルウェア ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR), html=False), name="uploads")

# ---- モデル ----
class PostIn(BaseModel):
    kind: str
    title: str

class RegisterIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=1, max_length=64)
    email: EmailStr = Field(...)  # ★ 追加（必須）

class LoginIn(BaseModel):
    username: str
    password: str

# ---- ヘルス ----
@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}

# ---- FirstChoice（既存）----
@app.get("/api/FirstChoice")
def list_posts():
    with engine.begin() as conn:
        rows = conn.execute(text("SELECT id, kind, title FROM posts ORDER BY id DESC")).mappings().all()
    return {"items": [dict(r) for r in rows]}

@app.post("/api/FirstChoice")
def create_post(p: PostIn):
    if p.kind not in ("アドトラック", "大型ビジョン", "サイネージ"):
        raise HTTPException(400, "kind must be '大型ビジョン' or 'アドトラック' or 'サイネージ'")
    with engine.begin() as conn:
        r = conn.execute(
            text("INSERT INTO posts(kind, title) VALUES (:k,:t) RETURNING id"),
            {"k": p.kind, "t": p.title}
        ).first()
    return {"id": int(r[0])}

# ---- 認証（一般）※従来どおり残す ----
@app.post("/api/auth/register")
def register_user(p: RegisterIn):
    uname = p.username.strip()
    if not uname:
        raise HTTPException(status_code=400, detail="username is required")
    pw_hash = pwd_ctx.hash(p.password)
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text("""
                INSERT INTO users (username, password_hash, display_name, email)
                VALUES (:u, :h, :n, :e)
                RETURNING id
                """),
                {"u": uname, "h": pw_hash, "n": p.name.strip(), "e": p.email.strip()}
            ).first()
    except IntegrityError as e:
        # username / email 重複の出し分け（ざっくり）
        msg = str(e).lower()
        if "username" in msg:
            raise HTTPException(status_code=409, detail="username already exists")
        if "email" in msg:
            raise HTTPException(status_code=409, detail="email already exists")
        raise HTTPException(status_code=409, detail="already exists")

    # ★ 登録完了メールを送信（失敗してもAPI成功は維持）
    try:
        subject = "【Fricsignage】ご登録ありがとうございます"
        body = (
            f"{p.name} 様\n\n"
            "この度はご登録ありがとうございます。アカウントが作成されました。\n\n"
            f"登録メールアドレス: {p.email}\n"
            "※このメールに心当たりがない場合は破棄してください。\n"
            "-- \n"
            "Fricsignage（送信専用）"
        )
        send_mail(p.email, subject, body)
    except Exception:
        pass

    return {"ok": True, "user_id": int(row[0])}

def create_access_token(*, sub: str, username: str, role: str) -> str:
    now = datetime.utcnow()
    exp = now + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": sub,
        "username": username,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def require_admin(authorization: str = Header(None)):
    """管理API用：admin_users（管理認証DB）で有効性を確認"""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token")
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="not allowed")

    # 管理認証DBの admin_users を確認
    uid = claims.get("sub")
    with engine_admin.begin() as conn:
        row = conn.execute(text("SELECT is_active FROM admin_users WHERE id=:id"), {"id": int(uid)}).first()
        if not row or not row[0]:
            raise HTTPException(status_code=403, detail="inactive user")
    return claims

# ★ 一般ユーザー（任意）: Authorization があればユーザーを引く（無ければ None）
def try_get_user_from_auth(authorization: Optional[str]) -> Optional[Dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        return None
    uid = claims.get("sub")
    if not uid:
        return None
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT id, username, display_name, email, is_active
              FROM users WHERE id=:id
        """), {"id": int(uid)}).mappings().first()
    if not row or not row["is_active"]:
        return None
    return {"id": int(row["id"]), "username": row["username"], "name": row.get("display_name") or "", "email": row.get("email")}

@app.post("/api/auth/login")
def login_user(p: LoginIn):
    """一般ログイン（従来どおり users テーブルを参照）"""
    uname = p.username.strip()
    with engine.begin() as conn:
        row = conn.execute(
            text("""
            SELECT id, username, display_name, password_hash, role, is_active
            FROM users
            WHERE lower(username) = lower(:u)
            """),
            {"u": uname}
        ).mappings().first()
    if not row or not pwd_ctx.verify(p.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")
    if not row["is_active"]:
        raise HTTPException(statuscode=403, detail="inactive user")  # ← 注意: FastAPIは status_code。typoがあれば修正

    token = create_access_token(sub=str(row["id"]), username=row["username"], role=row["role"])
    return {"ok": True, "token": token}

# ---- 管理者ログイン（admin_users：管理認証DBのみ参照）----
@app.post("/api/auth/admin-login")
def admin_login(p: LoginIn):
    uname = (p.username or "").strip()
    with engine_admin.begin() as conn:
        row = conn.execute(text("""
            SELECT id, username, display_name, password_hash, is_active
            FROM admin_users WHERE lower(username)=lower(:u) LIMIT 1
        """), {"u": uname}).mappings().first()
    if not row:
        raise HTTPException(status_code=401, detail="invalid credentials")
    if not pwd_ctx.verify(p.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="inactive user")

    token = create_access_token(sub=str(row["id"]), username=row["username"], role="admin")
    return {"ok": True, "username": row["username"], "name": row.get("display_name") or "", "role": "admin", "token": token}

# =============================
# 配信申請の受付（画像＋スケジュール保存）
# =============================
def _valid_sched_dict(sched) -> bool:
    if not isinstance(sched, dict):
        return False
    for d, arr in sched.items():
        if not isinstance(arr, list):
            return False
        for t in arr:
            if not (isinstance(t, str) and len(t) == 5 and t[2] == ":"):
                return False
    return True

def find_conflicts(conn, kind: str, sched: dict) -> List[Tuple[str, str]]:
    conflicts: List[Tuple[str, str]] = []
    if not isinstance(sched, dict):
        return conflicts
    for day, times in sched.items():
        if not isinstance(times, list):
            continue
        for tm in times:
            if not (isinstance(tm, str) and len(tm) == 5 and tm[2] == ":"):
                continue
            row = conn.execute(
                text("SELECT 1 FROM reservation_slots WHERE kind=:k AND day=:d AND time=:t LIMIT 1"),
                {"k": kind, "d": day, "t": tm}
            ).first()
            if row:
                conflicts.append((day, tm))
    return conflicts

def _insert_slots(conn, kind: str, submission_id: int, sched: dict):
    try:
        for day, times in (sched or {}).items():
            if not isinstance(times, list):
                continue
            for tm in times:
                if isinstance(tm, str) and len(tm) == 5 and tm[2] == ":":
                    conn.execute(text("""
                        INSERT INTO reservation_slots(kind, day, time, submission_id)
                        VALUES (:k, :d, :t, :sid)
                    """), {"k": kind, "d": day, "t": tm, "sid": int(submission_id)})
    except IntegrityError:
        raise HTTPException(status_code=409, detail={"message": "slot conflicts"})

# 共通: 複数 UploadFile を保存して submission_files に登録
async def _save_files_for_submission(conn, submission_id: int, files: Optional[List[UploadFile]]) -> List[str]:
    saved_paths: List[str] = []
    if not files:
        return saved_paths
    for f in files:
        if not f:
            continue
        ext = (Path(f.filename).suffix or "").lower()
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest = UPLOAD_DIR / unique_name
        data = await f.read()
        dest.write_bytes(data)
        size = dest.stat().st_size
        conn.execute(
            text("""
                INSERT INTO submission_files(submission_id, path, original_name, mime, size)
                VALUES (:sid, :p, :o, :m, :sz)
            """),
            {
                "sid": submission_id,
                "p": str(dest),
                "o": f.filename or unique_name,
                "m": f.content_type or "",
                "sz": size,
            },
        )
        saved_paths.append(str(dest))
    return saved_paths

# --- trucks ---
@app.post("/api/trucks")
async def create_trucks(
    kind: str = Form(...),
    title: str = Form(""),
    schedule: str = Form(...),
    files_trucks: List[UploadFile] = File(...),
    audio: UploadFile | None = File(None),  # ★ 任意で受ける（フロント送信に合わせる）
    authorization: Optional[str] = Header(None),  # ★ 任意でユーザー特定
):





    print("トラック関数実行🚀")
    try:
        sched = json.loads(schedule)
        if not _valid_sched_dict(sched):
            raise ValueError("schedule must be object")
        with engine.begin() as conn:
            conflicts = find_conflicts(conn, kind, sched)
            if conflicts:
                raise HTTPException(
                    status_code=409,
                    detail={"message": "slot conflicts", "conflicts": [{"date": d, "time": t} for d, t in conflicts]},
                )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="invalid schedule JSON")

    saved_paths: List[str] = []
    with engine.begin() as conn:
        sub_id = conn.execute(
            text("""
                INSERT INTO submissions(kind, title, schedule_json)
                VALUES (:k, :t, CAST(:s AS JSONB))
                RETURNING id
            """),
            {"k": kind, "t": title, "s": json.dumps(sched)},
        ).scalar_one()

        _insert_slots(conn, kind, sub_id, sched)
        saved_paths = await _save_files_for_submission(conn, sub_id, files_trucks)

    # ★ ここで確認メール（可能なら）
    user = try_get_user_from_auth(authorization)
    print(user)

    if user and user.get("email"):
        # 件名・本文は最小実装（必要なら整形強化）
        images_cnt = len(files_trucks or [])
        audio_txt = "あり" if audio else "なし"
        # スケジュール要約
        try:
            # {"YYYY-MM-DD":["HH:MM",...]} を "8/31 19:00, 19:30 ..." 風に要約
            def _fmt_day(d: str) -> str:
                dt = datetime.strptime(d, "%Y-%m-%d").date()
                return f"{dt.month}/{dt.day}"
            parts = []
            for d, arr in sched.items():
                if isinstance(arr, list) and arr:
                    parts.append(f"{_fmt_day(d)} " + ", ".join(arr))
            sched_summary = "\n".join(parts) if parts else "-"
        except Exception:
            sched_summary = "-"

        subject = "【申請完了】アドトラックの申請を受け付けました"
        body = (
            f"{user.get('name') or user['username']} 様\n\n"
            "アドトラックの申請を受け付けました。\n\n"
            "— 申請概要 —\n"
            f"・画像：{images_cnt} 枚\n"
            f"・音声：{audio_txt}\n"
            f"・日程：\n{sched_summary}\n\n"
            "本メールは送信専用です。お心当たりがない場合は破棄してください。"
        )
        try:
            send_mail(user["email"], subject, body)
        except Exception:
            # メール失敗は API 成功に影響させない（ログに留める運用推奨）
            pass

    return {"ok": True, "submission_id": sub_id, "files": saved_paths}

# --- Bulk（最小修正） ---
@app.post("/api/submit/bulk")
async def create_bulk(
    title: str = Form(""),
    schedule: str = Form(...),                        # {"YYYY-MM-DD":["HH:MM",...]}
    files_truck: Optional[List[UploadFile]] = File(None),
):
    try:
        sched = json.loads(schedule)
        if not _valid_sched_dict(sched):
            raise ValueError("schedule must be object")
    except Exception:
        raise HTTPException(status_code=400, detail="invalid schedule JSON")

    if not (files_truck and len(files_truck) > 0):
        raise HTTPException(status_code=400, detail="no files selected")

    result = { "truck": {"submission_id": None, "files": []} }

    with engine.begin() as conn:
        if files_truck and len(files_truck) > 0:
            truck_id = conn.execute(
                text("""
                    INSERT INTO submissions(kind, title, schedule_json)
                    VALUES (:k, :t, CAST(:s AS JSONB))
                    RETURNING id
                """),
                {"k": "アドトラック", "t": title, "s": json.dumps(sched)},
            ).scalar_one()
            _insert_slots(conn, "アドトラック", truck_id, sched)
            files = await _save_files_for_submission(conn, truck_id, files_truck)
            result["truck"]["submission_id"] = int(truck_id)
            result["truck"]["files"] = files

    return {"ok": True, "result": result}

# =============================
# 予約枠（グレーアウト対象）取得
# =============================
def _parse_date(date_str: str) -> datetime.date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail=f"invalid date format: {date_str} (YYYY-MM-DD expected)")

@app.get("/api/truck/booked")
def get_booked_slots_truck(
    start: str = Query(..., description="YYYY-MM-DD（含む）"),
    end: str   = Query(..., description="YYYY-MM-DD（含む）"),
    kind: str  = Query(..., description="対象kind（アドトラック)"),
):
    s = _parse_date(start)
    e = _parse_date(end)
    if e < s:
        raise HTTPException(status_code=400, detail="end must be >= start")

    k = (kind or "").strip().replace("\u3000", "")
    if not k:
        raise HTTPException(status_code=422, detail="kind is required")

    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT day::text AS d, to_char(time, 'HH24:MI') AS t
              FROM reservation_slots
             WHERE day BETWEEN :s AND :e
               AND kind = :k
             ORDER BY d, t
        """), {"s": s, "e": e, "k": k}).mappings().all()

    out: Dict[str, List[str]] = {}
    for r in rows:
        out.setdefault(r["d"], []).append(r["t"])
    return out

# ==== 追加: スキーマ ====
class AdminMeOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    is_active: bool

class AdminPwChangeIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)

class AdminRenameIn(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_username: str = Field(..., min_length=3, max_length=64)

# ==== 追加: 管理者の自己情報取得 ====
@app.get("/api/auth/admin/me", response_model=AdminMeOut)
def admin_me(claims=Depends(require_admin)):
    uid = int(claims["sub"])
    with engine_admin.begin() as conn:
        row = conn.execute(text("""
            SELECT id, username, display_name, is_active
            FROM admin_users WHERE id=:id LIMIT 1
        """), {"id": uid}).mappings().first()
    if not row: raise HTTPException(status_code=403, detail="not allowed")
    return {"id": int(row["id"]), "username": row["username"], "display_name": row.get("display_name"), "is_active": bool(row["is_active"])}

@app.post("/api/auth/admin/change_password")
def change_admin_password(p: AdminPwChangeIn, claims=Depends(require_admin)):
    uid = int(claims["sub"])
    if len(p.new_password or "") < 6:
        raise HTTPException(status_code=400, detail="new password too short")
    with engine_admin.begin() as conn:
        row = conn.execute(text("SELECT password_hash FROM admin_users WHERE id=:id"), {"id": uid}).first()
        if not row: raise HTTPException(status_code=403, detail="not allowed")
        if not pwd_ctx.verify(p.current_password, row[0]):
            raise HTTPException(status_code=401, detail="current password mismatch")
        conn.execute(text("UPDATE admin_users SET password_hash=:h WHERE id=:id"),
                     {"h": pwd_ctx.hash(p.new_password), "id": uid})
    return {"ok": True}

@app.post("/api/auth/admin/rename")
def rename_admin_username(p: AdminRenameIn, claims=Depends(require_admin)):
    uid = int(claims["sub"])
    new_uname = (p.new_username or "").strip()
    if not new_uname: raise HTTPException(status_code=400, detail="username is required")
    with engine_admin.begin() as conn:
        row = conn.execute(text("SELECT password_hash FROM admin_users WHERE id=:id"), {"id": uid}).first()
        if not row: raise HTTPException(status_code=403, detail="not allowed")
        if not pwd_ctx.verify(p.current_password, row[0]):
            raise HTTPException(status_code=401, detail="auth failed")
        exists = conn.execute(text("SELECT 1 FROM admin_users WHERE lower(username)=lower(:u) AND id<>:id LIMIT 1"),
                              {"u": new_uname, "id": uid}).first()
        if exists: raise HTTPException(status_code=409, detail="username already exists")
        conn.execute(text("UPDATE admin_users SET username=:u WHERE id=:id"), {"u": new_uname, "id": uid})
    return {"ok": True, "username": new_uname}

# =========================================================
# 追加: 管理審査API（フロントが参照する3エンドポイント）
# =========================================================

def _file_path_to_url(p: Optional[str]) -> str:
    """
    submission_files.path には "./uploads/xxxx.png" のようなパスが入る実装。
    表示用URLは {API_ORIGIN}/uploads/<ファイル名> に正規化する。
    """
    if not p:
        return ""
    name = Path(p).name
    return f"{API_ORIGIN}/uploads/{name}"

class SubmissionOut(BaseModel):
    id: int
    companyName: str
    imageUrl: str
    title: str | None = None
    submittedAt: str  # ISO

@app.get("/api/admin/review/queue", response_model=List[SubmissionOut])
def list_review_queue(status: str = Query("pending"), claims=Depends(require_admin)):
    st = (status or "pending").lower()
    if st not in ("pending", "approved", "rejected"):
        raise HTTPException(status_code=400, detail="invalid status")
    with engine.begin() as conn:
        rows = conn.execute(text("""
            SELECT s.id,
                   NULLIF(s.company_name, '') AS company_name,
                   s.title,
                   s.created_at,
                   (
                     SELECT sf.path
                       FROM submission_files sf
                      WHERE sf.submission_id = s.id
                      ORDER BY sf.id ASC
                      LIMIT 1
                   ) AS first_path
              FROM submissions s
             WHERE s.status = :st
             ORDER BY s.created_at DESC
        """), {"st": st}).mappings().all()

    out: List[SubmissionOut] = []
    for r in rows:
        company = r["company_name"] or r["title"] or ""
        image_url = _file_path_to_url(r["first_path"])
        submitted_at = (r["created_at"] or datetime.utcnow()).isoformat()
        out.append(SubmissionOut(
            id=int(r["id"]),
            companyName=company,
            imageUrl=image_url,
            title=r["title"],
            submittedAt=submitted_at
        ))
    return out

@app.post("/api/admin/review/{submission_id}/approve")
def approve_submission(submission_id: int, claims=Depends(require_admin)):
    with engine.begin() as conn:
        row = conn.execute(text("SELECT status FROM submissions WHERE id=:id"), {"id": submission_id}).first()
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        # 既に確定済みでも上書きは許容（必要ならガード）
        conn.execute(text("""
            UPDATE submissions
               SET status='approved', decided_at=now()
             WHERE id=:id
        """), {"id": submission_id})
    return {"ok": True}

@app.post("/api/admin/review/{submission_id}/reject")
def reject_submission(submission_id: int, claims=Depends(require_admin)):
    with engine.begin() as conn:
        row = conn.execute(text("SELECT status FROM submissions WHERE id=:id"), {"id": submission_id}).first()
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        conn.execute(text("""
            UPDATE submissions
               SET status='rejected', decided_at=now()
             WHERE id=:id
        """), {"id": submission_id})
    return {"ok": True}
