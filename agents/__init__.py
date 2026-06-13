"""AInstein Agent 模块。

- 旧版三级 Agent（``scientist`` / ``director`` / ``researcher``）保留以兼容现有引擎。
- 新版统一 Agent 框架在 :mod:`agents.framework` 中实现：
  ``BaseAgent`` / ``RoleRegistry`` / ``AgentPool`` / ``ThinkingContext`` /
  ``ThinkingResult``，遵循硅基大脑蓝图 §1.2 / §2.3 的去层级化、平等博弈设计。
"""
from agents.framework import (
    ROLES,
    PERSONALITY_DIMENSIONS,
    BaseAgent,
    RoleRegistry,
    AgentPool,
    ThinkingContext,
    ThinkingResult,
    generate_random_personality,
    init_framework,
    pool,
)

__all__ = [
    "ROLES",
    "PERSONALITY_DIMENSIONS",
    "BaseAgent",
    "RoleRegistry",
    "AgentPool",
    "ThinkingContext",
    "ThinkingResult",
    "generate_random_personality",
    "init_framework",
    "pool",
]
