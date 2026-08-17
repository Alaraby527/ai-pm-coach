# AI PM Coach

面向 AI 产品经理求职者的轻量教练。粘贴简历和目标岗位 JD 后，生成有证据约束的能力差距、7 天行动计划，并提供针对性模拟面试与四维评分。

[在线体验](https://ai-pm-coach-omega.vercel.app/)

![AI PM Coach 产品界面](./preview.png)

## 产品思路

- **问题**：通用求职建议很难落到具体 JD，求职者也缺少可重复练习的反馈闭环。
- **方案**：把简历证据、JD 要求、行动计划、模拟面试串成一个流程，并要求模型不得编造经历或数据。
- **衡量**：下一步将通过真实用户测试记录核心流程完成率、建议采纳率和单次调用成本；当前不展示未经验证的效果数字。
- **边界**：MVP 不做账号、数据库、文档解析和自动投递，先验证核心建议是否有用。

## 在线部署

项目可直接部署到 Vercel。将 `AI_API_KEY` 配置为 Vercel 环境变量；可选配置 `AI_API_BASE_URL` 和 `AI_MODEL`。API Key 不应写入仓库。

## 运行

要求 Node.js 24 或更新版本，不需要安装第三方依赖。启动命令会让 Node 原生读取系统的 `HTTP_PROXY` / `HTTPS_PROXY` 配置。

### Windows 一键启动

启动应用后，也可以直接在网页顶部的密码框中输入 DeepSeek API Key。Key 只在当前页面内存中存在，不会写入 localStorage、文件或日志。留空时，服务会读取环境变量中的 Key。

如需用启动脚本注入 Key：双击 `start-windows.cmd`，按提示输入；随后脚本会自动打开正确的本地网页。保持启动窗口开启；按回车停止服务。

不要直接双击 `public/index.html`，否则网页连接不到后端，会出现 `Failed to fetch`。

### 命令行启动

PowerShell：

```powershell
$env:AI_API_KEY="你的 DeepSeek API Key"
$env:AI_API_BASE_URL="https://api.deepseek.com" # 可省略
$env:AI_MODEL="deepseek-v4-pro" # 可省略
npm start
```

浏览器打开 <http://127.0.0.1:3000>。如果端口被占用：

```powershell
npm start -- 43127
```

API 请求使用 DeepSeek 官方的 OpenAI 兼容对话接口和 JSON Output。API Key 只由本地 Node 服务读取，不会写入前端或浏览器存储。

如需切换通义千问、Kimi 或智谱，只需按照对应平台文档设置 `AI_API_BASE_URL`、`AI_MODEL` 和 `AI_API_KEY`；业务代码不需要修改。

## 使用流程

1. 粘贴简历文本与目标 JD。
2. 点击“生成成长方案”。
3. 查看匹配概览、能力差距和 7 天计划。
4. 点击“开始模拟面试”，回答问题并提交评分。
5. 刷新页面可恢复最近结果；“清空”会删除浏览器本地数据。

简历和 JD 会发送给配置的模型服务。请不要输入不必要的身份证号、手机号等敏感信息。

## 自检

```powershell
npm test
```

自检使用注入的固定模型响应，不消耗 API 额度，覆盖：

- 正常生成结构化成长方案。
- 拒绝空简历。
- 模拟面试出题与四维评分闭环。

## 项目边界

第一版只支持粘贴文本，不解析 PDF/DOCX；不包含账号、云数据库、RAG、自动搜岗或自动投递。只有真实使用证明这些功能必要时再添加。

