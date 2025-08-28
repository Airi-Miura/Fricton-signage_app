import os
import json
import uuid
import time
import yaml  # ← 追加（admin.yml を読むため）
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Tuple

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, OperationalError
from passlib.context import CryptContext
from jose import jwt, JWTError

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "appdb")
DB_USER = os.getenv("DB_USER", "app")
DB_PASS = os.getenv("DB_PASS", "secret")
DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# アップロード保存先（環境変数で上書き可）
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# フロント(:3000)からの絶対URL生成用
API_ORIGIN = os.getenv("API_ORIGIN", "http://localhost:8000")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-change-me")  # 本番は強い値に
JWT_ALG = os.getenv("JWT_ALG", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))  # 24h

# YAMLファイルパス & 許可adminリスト
ADMIN_CONF = os.getenv("ADMIN_CONF", "./admin.yml")
allowed_admin_usernames: set[str] = set()
admin_yaml_accounts: List[dict] = []

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="fricsignage API")

# ---- ここから：起動時初期化（DB接続の待機＋スキーマ作成）----
def init_db_with_retry():
    # DBが上がるまで待機（最大30回 = 30秒）
    for _ in range(30):
        try:
            with engine.begin() as conn:
                conn.execute(text("SELECT 1"))
            break
        except OperationalError:
            time.sleep(1)

    # スキーマ作成／拡張（既存なら安全にスキップ）
    with engine.begin() as conn:
        # posts
        conn.execute(text("""
        CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            kind VARCHAR(20) NOT NULL,
            title TEXT NOT NULL
        );
        """))

        # users（初回は列をすべて含める）
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

        # 列追加の後追い（既存テーブルに不足があれば足す）
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
        END $$;
        """))

        conn.execute(text("""
        CREATE INDEX IF NOT EXISTS idx_users_username_lower
        ON users ((lower(username)));
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

        # 予約スロット（kind×day×time で一意）— 非パーティション
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

        # 既存 submissions の schedule_json からバックフィル（初回のみ入る／重複は無視）
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

def load_admin_yaml():
    """admin.yml を読み込み、許可ユーザー集合とシード用データを保持"""
    global allowed_admin_usernames, admin_yaml_accounts
    allowed_admin_usernames = set()
    admin_yaml_accounts = []
    p = Path(ADMIN_CONF)
    if not p.exists():
        return
    data = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    for acc in data.get("admins", []):
        u = str(acc.get("username", "")).strip()
        if not u:
            continue
        admin_yaml_accounts.append({
            "username": u,
            "password": acc.get("password"),
            "password_hash": acc.get("password_hash"),
            "display_name": acc.get("display_name", u),
        })
        allowed_admin_usernames.add(u.lower())

def seed_admins():
    # YAML + 既存の ADMIN_SEED を取り込んでDBに反映
    load_admin_yaml()

    seed_env = os.getenv("ADMIN_SEED", "").strip()
    if seed_env:
        pairs = [p.strip() for p in seed_env.split(";") if p.strip()]
        for item in pairs:
            parts = [x.strip() for x in item.split(",")]
            if not parts or ":" not in parts[0]:
                continue
            uname, plainpw = parts[0].split(":", 1)
            name = parts[1] if len(parts) > 1 else uname
            admin_yaml_accounts.append({
                "username": uname,
                "password": plainpw,
                "password_hash": None,
                "display_name": name,
            })
            allowed_admin_usernames.add(uname.lower())

    if not admin_yaml_accounts:
        return

    with engine.begin() as conn:
        for acc in admin_yaml_accounts:
            u = acc["username"]
            dn = acc["display_name"]
            # ハッシュ決定
            if acc.get("password_hash"):
                h = acc["password_hash"]
            else:
                h = pwd_ctx.hash(acc.get("password") or "change-me-now")
            # 既存判定
            row = conn.execute(text("SELECT id FROM users WHERE lower(username)=lower(:u)"),
                               {"u": u}).first()
            if not row:
                conn.execute(text("""
                    INSERT INTO users (username, password_hash, display_name, role, is_active)
                    VALUES (:u, :h, :n, 'admin', TRUE)
                """), {"u": u, "h": h, "n": dn})
            else:
                # 既存をadmin/有効に更新（YAMLがソースオブトゥルース）
                conn.execute(text("""
                    UPDATE users
                       SET password_hash=:h,
                           display_name=:n,
                           role='admin',
                           is_active=TRUE
                     WHERE lower(username)=lower(:u)
                """), {"u": u, "h": h, "n": dn})

@app.on_event("startup")
def on_startup():
    init_db_with_retry()  # 先にスキーマ準備
    seed_admins()         # その後に管理者シード
# ---- ここまで：起動時初期化 ----

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

# --- モデル ---
class PostIn(BaseModel):
    kind: str
    title: str

class RegisterIn(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    name: str = Field(..., min_length=1, max_length=64)

class LoginIn(BaseModel):
    username: str
    password: str

# --- ヘルス ---
@app.get("/api/health")
def health():
    return {"ok": True, "time": datetime.utcnow().isoformat()}

# --- FirstChoice（既存） ---
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

# --- 認証 ---
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
                INSERT INTO users (username, password_hash, display_name)
                VALUES (:u, :h, :n)
                RETURNING id
                """),
                {"u": uname, "h": pw_hash, "n": p.name.strip()}
            ).first()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="username already exists")
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
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token")
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="not allowed")
    # DBでアクティブ確認
    uid = claims.get("sub")
    with engine.begin() as conn:
        row = conn.execute(text("SELECT is_active FROM users WHERE id=:id"), {"id": int(uid)}).first()
        if not row or not row[0]:
            raise HTTPException(status_code=403, detail="inactive user")
    return claims

# 通常ログイン = 有効ユーザーならOK
@app.post("/api/auth/login")
def login_user(p: LoginIn):
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
        raise HTTPException(status_code=403, detail="inactive user")

    token = create_access_token(sub=str(row["id"]), username=row["username"], role=row["role"])
    return {"ok": True, "token": token}

# 管理者ログイン = adminロール かつ YAMLに載っているIDのみ
@app.post("/api/auth/admin/login")
def admin_login(p: LoginIn):
    uname = p.username.strip()
    with engine.begin() as conn:
        row = conn.execute(
            text("""
            SELECT id, username, display_name, password_hash, role, is_active
            FROM users
            WHERE lower(username) = lower(:u)
            LIMIT 1
            """),
            {"u": uname}
        ).mappings().first()
    if not row or not pwd_ctx.verify(p.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")
    if not row["is_active"] or row["role"] != "admin":
        raise HTTPException(status_code=403, detail="not allowed")
    # YAMLに定義されたユーザーに限定
    if not allowed_admin_usernames or row["username"].lower() not in allowed_admin_usernames:
        raise HTTPException(status_code=403, detail="not allowed (not in admin.yml)")

    token = create_access_token(sub=str(row["id"]), username=row["username"], role=row["role"])
    return {"ok": True, "token": token}

# =============================
# 配信申請の受付（画像＋スケジュールを保存） — signage / tv / trucks / AllPost
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
    """すでに埋まっている (day,time) を返す（UX向けプリチェック。最終防衛は _insert_slots）"""
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
    """
    schedule_json を reservation_slots に展開してINSERT。
    PRIMARY KEY(kind, day, time) で重複時は IntegrityError -> 409 にする。
    """
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
):
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

    return {"ok": True, "submission_id": sub_id, "files": saved_paths}

# --- 共通保存関数を使う Bulk ---
@app.post("/api/submit/bulk")
async def create_bulk(
    title: str = Form(""),
    schedule: str = Form(...),                        # {"YYYY-MM-DD":["HH:MM",...]}
    files_signage: Optional[List[UploadFile]] = File(None),
):
    try:
        sched = json.loads(schedule)
        if not _valid_sched_dict(sched):
            raise ValueError("schedule must be object")
    except Exception:
        raise HTTPException(status_code=400, detail="invalid schedule JSON")

    if not ():
        raise HTTPException(status_code=400, detail="no files selected")

    result = {
        "truck":   {"submission_id": None, "files": []},
    }

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
# 管理者ビュー用 API（閲覧）—（既存のまま）
# =============================
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
                INSERT INTO users (username, password_hash, display_name)
                VALUES (:u, :h, :n)
                RETURNING id
                """),
                {"u": uname, "h": pw_hash, "n": p.name.strip()}
            ).first()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="username already exists")
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
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid token")
    if claims.get("role") != "admin":
        raise HTTPException(status_code=403, detail="not allowed")
    uid = claims.get("sub")
    with engine.begin() as conn:
        row = conn.execute(text("SELECT is_active FROM users WHERE id=:id"), {"id": int(uid)}).first()
        if not row or not row[0]:
            raise HTTPException(status_code=403, detail="inactive user")
    return claims

# =============================
# ここから管理者アカウントの自己管理 API（既存のまま）
# =============================

class AdminPwChangeIn(BaseModel):
    current_password: str
    new_password: str

class AdminRenameIn(BaseModel):
    current_password: str
    new_username: str

class AdminMeOut(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    role: str
    is_active: bool

@app.get("/api/auth/admin/me", response_model=AdminMeOut)
def admin_me(claims=Depends(require_admin)):
    uid = int(claims["sub"])
    with engine.begin() as conn:
        row = conn.execute(
            text("""
                SELECT id, username, display_name, role, is_active
                FROM users
                WHERE id=:id AND role='admin'
                LIMIT 1
            """),
            {"id": uid}
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=403, detail="not allowed")
        return {
            "id": int(row["id"]),
            "username": row["username"],
            "display_name": row["display_name"],
            "role": row["role"],
            "is_active": bool(row["is_active"]),
        }

@app.post("/api/auth/admin/change_password")
def change_admin_password(p: AdminPwChangeIn, claims=Depends(require_admin)):
    uid = int(claims["sub"])
    if not p.new_password or len(p.new_password) < 6:
        raise HTTPException(status_code=400, detail="new password too short")
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT password_hash FROM users WHERE id=:id AND role='admin'"),
            {"id": uid}
        ).first()
        if not row:
            raise HTTPException(status_code=403, detail="not allowed")
        if not pwd_ctx.verify(p.current_password, row[0]):
            raise HTTPException(status_code=401, detail="current password mismatch")
        new_hash = pwd_ctx.hash(p.new_password)
        conn.execute(
            text("UPDATE users SET password_hash=:h WHERE id=:id"),
            {"h": new_hash, "id": uid}
        )
    return {"ok": True}

@app.post("/api/auth/admin/rename")
def rename_admin_username(p: AdminRenameIn, claims=Depends(require_admin)):
    uid = int(claims["sub"])
    new_uname = p.new_username.strip()
    if not new_uname:
        raise HTTPException(status_code=400, detail="username is required")
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT password_hash FROM users WHERE id=:id AND role='admin'"),
            {"id": uid}
        ).first()
        if not row:
            raise HTTPException(status_code=403, detail="not allowed")
        if not pwd_ctx.verify(p.current_password, row[0]):
            raise HTTPException(status_code=401, detail="auth failed")
        try:
            conn.execute(
                text("UPDATE users SET username=:u WHERE id=:id"),
                {"u": new_uname, "id": uid}
            )
        except IntegrityError:
            raise HTTPException(status_code=409, detail="username already exists")
    return {"ok": True}

# =============================
# ここから週内の予約枠（グレーアウト対象）を返すAPI
# =============================

def _parse_date(date_str: str) -> datetime.date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(status_code=400, detail=f"invalid date format: {date_str} (YYYY-MM-DD expected)")

@app.get("/api/truck/booked")
def get_booked_slots(
    start: str = Query(..., description="YYYY-MM-DD（含む）"),
    end: str   = Query(..., description="YYYY-MM-DD（含む）"),
    kind: str  = Query(..., description="対象kind（アドトラック)"),
):
    s = _parse_date(start)
    e = _parse_date(end)
    if e < s:
        raise HTTPException(status_code=400, detail="end must be >= start")

    # ★ 受け取った kind を寛容に正規化（前後/全角スペースを除去）
    k = (kind or "").strip().replace("\u3000", "")

    # ※ 厳格な allowed チェックは外す（空っぽなら 422）
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

from typing import List, Optional, Dict
from sqlalchemy import bindparam

@app.get("/api/AllPost/booked")
def get_booked_slots(
    start: str = Query(..., description="YYYY-MM-DD（含む）"),
    end: str   = Query(..., description="YYYY-MM-DD（含む）"),
    kind: Optional[List[str]] = Query(None, description="対象kindを複数可（&kind=サイネージ&kind=大型ビジョン&kind=アドトラック）"),
):
    s = _parse_date(start)
    e = _parse_date(end)
    if e < s:
        raise HTTPException(status_code=400, detail="end must be >= start")

    kinds = [x.strip().replace("\u3000", "") for x in (kind or []) if x and x.strip()]
    if not kinds:
        raise HTTPException(status_code=422, detail="kind is required")

    with engine.begin() as conn:
        rows = conn.execute(
            text("""
                SELECT day::text AS d, to_char(time, 'HH24:MI') AS t
                  FROM reservation_slots
                 WHERE day BETWEEN :s AND :e
                   AND kind IN :kinds
                 ORDER BY d, t
            """).bindparams(bindparam("kinds", expanding=True)),
            {"s": s, "e": e, "kinds": kinds},
        ).mappings().all()

    out: Dict[str, List[str]] = {}
    for r in rows:
        out.setdefault(r["d"], []).append(r["t"])
    return out
