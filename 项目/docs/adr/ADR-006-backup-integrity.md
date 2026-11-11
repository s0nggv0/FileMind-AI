# ADR-006: 备份完整性、隔离导入与崩溃恢复

Status: accepted; Phase 7 格式、Phase 8 恢复增强。

备份使用有版本的 ZIP 容器、严格 manifest、逐条 SHA-256 和固定表列 allowlist。导入前检查配额、路径、符号链接、引用、数值和模型兼容性；重新生成 ID 并映射到当前身份。API Key、Cookie、Recovery Key、数据库口令和日志不在导出范围。

SHA-256 用于发现损坏，不能证明来源真实性；默认备份未加密。Phase 8 用持久文件意图和业务事务同提交的 Journal 替代失败后直接清理文件：未引用文件进入隔离区，已提交文件在响应丢失后保留。三种实际导入进程中断窗口均单独记录。

保留既有格式兼容与有限内存配额。本阶段不增加加密格式或远端备份服务。详见 [备份格式](../architecture/backup-recovery.md)、[当前恢复流程](../architecture/storage-maintenance.md) 和 [实际中断结果](../evaluation/phase8-crash-results.json)。
