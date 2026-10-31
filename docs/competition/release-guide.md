# 运行与分发

当前发布身份见 [current-release.json](current-release.json)，复现步骤统一维护在 [quickstart.md](quickstart.md)。运行包、SHA-256 和解压验收见 [release-freeze.md](release-freeze.md)。

包内包含 Node、PostgreSQL、生产 standalone、OCR 程序和语言数据、原创演示资料、许可证及技术文档。不包含 .env.local、现有数据库、用户原件或开发者 Vision 验证记录。首次启动生成新的本地身份与数据库。

停止后搬运整个目录。配置云服务只改模型设置，保留自动生成的数据库和会话值。不要将包含真实数据的已运行目录当作干净安装包分发。

验收过的安装范围为 Windows x64 可写 ASCII 路径。运行包通过允许列表构建，manifest 对每个文件记录 SHA-256；ZIP 校验值独立提供。下载与 API 申请不算作已验证的十分钟本机复现时间。
