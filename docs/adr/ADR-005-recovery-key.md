# ADR-005: 本地身份恢复使用一次展示的 Recovery Key

Status: accepted; Phase 7 决策，Phase 8 补记。

便携产品的浏览器 Cookie 丢失后，资料仍在数据库。选择 256-bit 随机 Recovery Key，只展示一次，数据库只存 SHA-256 digest；恢复签发现有签名 Cookie。轮换立即使旧 Key 失效，数据库持久限流限制猜测。

Key 仅能访问同一数据库中的身份，不能恢复丢失数据库或代替备份。持有 Cookie 或 Key 即有该身份权限。本阶段不增加 OAuth、邮箱或多人账户；数据库全局的保守限流可能影响共享服务，因此产品范围仍是个人本地使用。详见 [Recovery Key](../architecture/backup-recovery.md)。
