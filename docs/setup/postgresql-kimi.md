# PostgreSQL + Kimi 配置

当前后端使用普通 PostgreSQL、服务端私有文件目录和 Kimi API。无需 Supabase 或 OpenAI 账号。没有配置时仍可运行本地 Mock 演示；真实持久化和模型调用需要以下配置。

## 1. 复用现有 PostgreSQL 服务

一个 PostgreSQL 服务可以管理多个数据库。建议为本项目单独建立 `filemind_ai` 数据库和 `filemind_user` 用户，便于权限管理和备份。其他项目继续连接各自的数据库，不需要额外安装一套 PostgreSQL。支持 PostgreSQL 14+。

在现有服务中，使用管理员账号，**在事务外分别执行**下面两条语句。将示例密码换成自己的强密码，不把真实密码写进 Git 或聊天：

```sql
CREATE ROLE filemind_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD 'REPLACE_WITH_YOUR_PASSWORD';
CREATE DATABASE filemind_ai OWNER filemind_user;
```

如果已经创建过这个数据库和用户，直接使用它们。程序不会自动创建数据库。迁移只在连接指定的数据库中建立 `filemind` schema、8 张业务表、迁移记录和事务函数。不要将 DATABASE_URL 指向其他项目正在使用的数据库。

运行身份使用专用普通用户。超级用户 / BYPASSRLS 角色会绕过 PostgreSQL 行权限；程序仍保留归属检查，但不建议用管理员账号运行应用。

## 2. 创建本地环境文件

在项目根目录执行；已有 `.env.local` 时直接编辑该文件：

```powershell
Copy-Item .env.example .env.local
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

将随机字符串写入 WORKSPACE_SESSION_SECRET，长期保留。主要配置：

```dotenv
DATABASE_URL=postgresql://filemind_user:URL_ENCODED_PASSWORD@localhost:5432/filemind_ai
FILE_STORAGE_ROOT=.filemind/storage
WORKSPACE_SESSION_SECRET=YOUR_GENERATED_RANDOM_SECRET
WORKSPACE_COOKIE_SECURE=true

AI_ENGINE=mock
AI_PROVIDER=kimi
AI_MODEL=kimi-k2.6
AI_SMALL_MODEL=
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.cn/v1
```

DATABASE_URL 中使用你的数据库地址、端口、用户名和密码；密码中的 URL 保留字符需要 URL 编码。云数据库按服务提供方要求配置 TLS，例如连接串中的 sslmode；不要通过关闭证书校验解决连接错误。

FILE_STORAGE_ROOT 可以是相对路径或绝对路径，默认位于项目目录下。部署时必须放在持久磁盘 / Volume 上，并与数据库一起备份；该方案适用于本机或有持久磁盘的 Node.js 服务器。临时文件系统的无服务器部署需要另行接入对象存储。目录必须在 `public` 之外。

WORKSPACE_SESSION_SECRET 用于签名 Demo 身份 Cookie。清除 Cookie、换浏览器或改变 Secret 会产生新的身份，旧身份的数据不能自动找回。本阶段没有完整账号登录或跨设备同步。生产环境缺少 Secret 或配置不足 32 字节时会拒绝使用；开发环境缺省 Secret 在进程重启后改变。

本地 `npm run dev` 自动使用适合 HTTP 的 Cookie。仅在本地 HTTP 生产预览（build + start）时把 WORKSPACE_COOKIE_SECURE 设为 false；正式 HTTPS 部署保留 true。

## 3. 初始化表结构

```powershell
npm run db:migrate
```

迁移命令读取 `.env.local`，使用 DATABASE_URL 指定的数据库。首次应用 `database/migrations/202610020001_workspace.sql`，再次运行显示 Database is up to date。迁移记录包含 SQL 校验和，兼容 Windows/Linux 换行；已应用的迁移不可直接修改，后续变化添加新迁移。

程序通过同一连接上的 BEGIN / COMMIT / ROLLBACK 保存事务，用事务级锁避免并发初始化。失败会回滚，不打印连接串和密码。运行该命令需要该数据库中的建 schema / 表 / 函数权限；使用上面建立的数据库所有者即可。

先运行 `npm run dev`，保持 AI_ENGINE=mock，上传合成资料并检查 Saved 后刷新恢复。确认数据库和文件目录正常，再启用 Kimi。

## 4. 配置 Kimi API

从 [Kimi API 开放平台](https://platform.kimi.com/docs/get-api-key) 创建 API Key，填写 KIMI_API_KEY。使用开放平台 API 凭据，并确认可用额度；聊天产品和代码订阅不是此处的 API 配置入口。

将 AI_ENGINE 改为 llm，重启服务。当前适配验证的模型是 `kimi-k2.6`，main 和 small 均使用该模型；AI_SMALL_MODEL 留空会复用主模型。适配显式关闭思考模式，因为 K2.6 思考模式不能与 required 工具选择一起使用。模型输出通过 strict JSON Schema 和业务 Zod 校验。

不要使用已下线的 kimi-k2.5 或 moonshot-v1 系列。其他 Kimi 型号有不同的推理参数，当前适配会拒绝未经支持的型号；不能只替换名称便宣称兼容。资料见 [模型列表](https://platform.kimi.com/docs/models)、[K2.6 参数](https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart)、[结构输出](https://platform.kimi.com/docs/guide/response_format)。

## 5. 验收

```powershell
npm run test:live
```

此命令会在 3075 启动服务、上传四份合成 PDF/DOCX/TXT/MD、请求收费 Kimi 模型，检查审核自动保存、Apply、刷新、Library 和跨用户访问，并留下测试 Workspace。只有明确运行该命令时才调用收费 Provider。

当前已通过离线 PostgreSQL WASM 迁移与仓库测试、文件落盘测试和模拟 Kimi 协议测试。真实 PostgreSQL 服务连接与收费模型端到端验收仍需你的连接串和 Key，不能用离线结果代替。

## 在数据库管理工具中查看数据

DBeaver / pgAdmin 可以查看 `filemind` schema 下的表。应用用户受 RLS 限制，没有当前用户上下文时查询结果为空；通过管理员查看，或在事务中设置授权的用户上下文：

```sql
BEGIN;
SELECT set_config('filemind.user_id', 'YOUR_DEMO_USER_UUID', true);
SELECT id, display_name, summary, category FROM filemind.documents;
COMMIT;
```

管理数据库的凭据拥有设置此上下文的能力，只保留在服务器或管理员手中。网页通过服务器验证的签名 Cookie 获取身份，浏览器不能设置数据库上下文或直接连接数据库。Library 展示摘要、分类和标签；Dashboard 展示查询统计；Graph 展示保存的规则关系。
