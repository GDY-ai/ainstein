"""
AInstein 认证模块（蓝图 §1.5 用户交互模型）
==========================================

本模块提供轻量级的用户认证能力：
- 密码哈希（基于 ``werkzeug.security`` / ``hashlib`` 兜底）
- Token 签发与校验（基于 ``itsdangerous.URLSafeTimedSerializer``）
- Flask 装饰器：``@require_auth`` / ``@require_admin``

设计原则
--------
1. **简单优先**：单一 SECRET_KEY，无 OAuth、无邮箱验证。
2. **零侵入**：不修改 ``database.py``；用户/角色信息直接读 users 表。
3. **可观察**：装饰器在 ``flask.g`` 注入 ``current_user`` 字段，便于 API 直接使用。
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from functools import wraps
from typing import Any, Callable, Dict, Optional

from flask import g, jsonify, request

import database as db

logger = logging.getLogger(__name__)


# ============================================================
# Secret Key
# ============================================================

def _load_secret_key() -> str:
    """加载 SECRET_KEY；优先环境变量，否则在 data 目录持久化随机生成的 key。"""
    key = os.environ.get('AINSTEIN_SECRET_KEY')
    if key:
        return key
    # 兜底：把随机 key 写入 data 目录，进程重启仍然可用
    try:
        from config import DB_PATH
        data_dir = os.path.dirname(DB_PATH)
    except Exception:
        data_dir = os.path.join(os.path.dirname(__file__), 'data')
    os.makedirs(data_dir, exist_ok=True)
    key_path = os.path.join(data_dir, '.secret_key')
    if os.path.isfile(key_path):
        try:
            with open(key_path, 'r', encoding='utf-8') as fh:
                content = fh.read().strip()
                if content:
                    return content
        except OSError:
            pass
    new_key = secrets.token_urlsafe(48)
    try:
        with open(key_path, 'w', encoding='utf-8') as fh:
            fh.write(new_key)
        os.chmod(key_path, 0o600)
    except OSError:
        logger.warning('无法持久化 SECRET_KEY，仅本进程有效')
    return new_key


SECRET_KEY: str = _load_secret_key()
TOKEN_MAX_AGE: int = 60 * 60 * 24 * 30  # 30 天


# ============================================================
# 密码哈希
# ============================================================

def hash_password(password: str) -> str:
    """对明文密码做不可逆哈希。

    优先使用 ``werkzeug.security.generate_password_hash``（PBKDF2-SHA256）；
    若 Werkzeug 不可用则回退到 hashlib + 随机 salt。
    """
    if not isinstance(password, str) or not password:
        raise ValueError('password 不能为空')
    try:
        from werkzeug.security import generate_password_hash
        return generate_password_hash(password, method='pbkdf2:sha256', salt_length=16)
    except Exception:
        salt = secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'),
                                     salt.encode('utf-8'), 200_000).hex()
        return f'pbkdf2_local$200000${salt}${digest}'


def verify_password(password: str, password_hash: str) -> bool:
    """校验明文密码是否与哈希匹配。"""
    if not password or not password_hash:
        return False
    if password_hash.startswith('pbkdf2_local$'):
        try:
            _, iters, salt, digest = password_hash.split('$', 3)
            check = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'),
                                        salt.encode('utf-8'), int(iters)).hex()
            return hmac.compare_digest(check, digest)
        except Exception:
            return False
    try:
        from werkzeug.security import check_password_hash
        return check_password_hash(password_hash, password)
    except Exception:
        return False


# ============================================================
# Token 签发 / 校验（itsdangerous）
# ============================================================

def _serializer():
    from itsdangerous import URLSafeTimedSerializer
    return URLSafeTimedSerializer(SECRET_KEY, salt='ainstein-auth-v1')


def generate_token(user_id: int, role: str = 'user') -> str:
    """签发一个带过期时间的 token；payload 只放 ``user_id`` 与 ``role``。"""
    s = _serializer()
    return s.dumps({'user_id': int(user_id), 'role': role or 'user'})


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """校验 token；成功返回 ``{'user_id', 'role'}``，失败返回 ``None``。"""
    if not token or not isinstance(token, str):
        return None
    try:
        from itsdangerous import BadSignature, SignatureExpired
    except Exception:
        logger.exception('itsdangerous 未安装')
        return None
    s = _serializer()
    try:
        data = s.loads(token, max_age=TOKEN_MAX_AGE)
    except SignatureExpired:
        logger.info('token 已过期')
        return None
    except BadSignature:
        logger.info('token 签名非法')
        return None
    if not isinstance(data, dict) or 'user_id' not in data:
        return None
    return {
        'user_id': int(data['user_id']),
        'role': data.get('role') or 'user',
    }


# ============================================================
# 请求级辅助
# ============================================================

def _extract_token() -> Optional[str]:
    """从 ``Authorization: Bearer <token>`` 或 ``X-Auth-Token`` 头读取 token。"""
    auth = request.headers.get('Authorization', '')
    if auth.lower().startswith('bearer '):
        return auth[7:].strip() or None
    token = request.headers.get('X-Auth-Token') or request.args.get('token')
    return token.strip() if token else None


def _resolve_current_user() -> Optional[Dict[str, Any]]:
    """读 token → 查 DB → 返回 user dict。结果缓存到 ``flask.g``。"""
    cached = getattr(g, '_ainstein_current_user', None)
    if cached is not None:
        return cached
    token = _extract_token()
    if not token:
        return None
    payload = verify_token(token)
    if not payload:
        return None
    user = db.get_user(payload['user_id'])
    if not user or user.get('status') == 'banned':
        return None
    # token 中的 role 仅作展示，权限以 DB 为准
    user['role'] = user.get('role') or payload.get('role') or 'user'
    g._ainstein_current_user = user
    return user


def get_current_user() -> Optional[Dict[str, Any]]:
    """供业务代码读取当前登录用户（未登录返回 ``None``）。"""
    return _resolve_current_user()


# ============================================================
# Flask 装饰器
# ============================================================

def require_auth(fn: Callable) -> Callable:
    """要求请求携带合法 token；解析后的用户对象注入到 ``flask.g.current_user``。"""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _resolve_current_user()
        if not user:
            return jsonify({'error': 'authentication required'}), 401
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn: Callable) -> Callable:
    """要求当前用户具备 ``admin`` 角色。"""

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _resolve_current_user()
        if not user:
            return jsonify({'error': 'authentication required'}), 401
        if (user.get('role') or '').lower() != 'admin':
            return jsonify({'error': 'admin privilege required'}), 403
        g.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """剥离敏感字段后返回可对外暴露的用户视图。"""
    if not user:
        return {}
    return {
        'id': user.get('id'),
        'username': user.get('username'),
        'email': user.get('email'),
        'role': user.get('role') or 'user',
        'status': user.get('status') or 'active',
        'created_at': user.get('created_at'),
    }


__all__ = [
    'SECRET_KEY',
    'TOKEN_MAX_AGE',
    'hash_password',
    'verify_password',
    'generate_token',
    'verify_token',
    'get_current_user',
    'require_auth',
    'require_admin',
    'public_user',
]
